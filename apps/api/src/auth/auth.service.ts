import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Actor, ActorKind } from '../common/auth.decorators';
import { JwtPayload, resolveActor } from '../common/auth.guard';
import { SmsService } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';
import { OtpChallengeDto, TokensDto } from './dto/auth.dto';

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 30 * 24 * 3600;
const INVITE_TTL_S = 7 * 24 * 3600;

/** Format d'affichage : "+221771234567" → "+221 77 123 45 67". */
export function displayPhone(raw: string) {
  const p = normalizePhone(raw);
  const m = p.match(/^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+221 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : raw.trim();
}

/** Normalise un numéro sénégalais : "77 123 45 67" → "+221771234567". */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 9) return `+221${digits}`;
  if (digits.startsWith('221') && digits.length === 12) return `+${digits}`;
  return raw.trim().startsWith('+') ? `+${digits}` : digits;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private sms: SmsService,
  ) {}

  async issue(kind: ActorKind, id: string, tv: number): Promise<TokensDto> {
    const base = { sub: id, kind, tv };
    const accessToken = await this.jwt.signAsync({ ...base, typ: 'access' }, { expiresIn: ACCESS_TTL_S });
    const refreshToken = await this.jwt.signAsync(
      { ...base, typ: 'refresh' },
      { expiresIn: REFRESH_TTL_S, secret: process.env.JWT_REFRESH_SECRET },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, kind };
  }

  async officerLogin(matricule: string, password: string) {
    const o = await this.prisma.officer.findUnique({ where: { matricule: matricule.trim().toUpperCase() } });
    if (!o || !(await bcrypt.compare(password, o.passwordHash))) {
      throw new UnauthorizedException('Matricule ou mot de passe incorrect');
    }
    // resolveActor lève 423 si l'agent est suspendu.
    await resolveActor(this.prisma, { sub: o.id, kind: 'officer', tv: o.tokenVersion, typ: 'access' });
    return this.issue('officer', o.id, o.tokenVersion);
  }

  async adminLogin(email: string, password: string) {
    const a = await this.prisma.admin.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!a || !a.passwordHash || !(await bcrypt.compare(password, a.passwordHash))) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    if (a.statut !== 'actif') throw new UnauthorizedException('Compte révoqué ou non activé');
    await this.prisma.admin.update({ where: { id: a.id }, data: { lastLoginAt: new Date() } });
    return this.issue('admin', a.id, a.tokenVersion);
  }

  async userLogin(telephone: string, password: string): Promise<TokensDto | OtpChallengeDto> {
    const u = await this.prisma.userAccount.findUnique({ where: { telephone: normalizePhone(telephone) } });
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new UnauthorizedException('Téléphone ou mot de passe incorrect');
    }
    if (u.twoFactor) return this.sendOtp(u.id, u.telephone);
    await this.prisma.userAccount.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return this.issue('user', u.id, u.tokenVersion);
  }

  async userRegister(cni: string, telephone: string, password: string) {
    const phone = normalizePhone(telephone);
    const owner = await this.prisma.owner.findUnique({ where: { cni: cni.trim() }, include: { account: true } });
    // Le compte n'est lié que si CNI et téléphone correspondent au fichier national.
    if (!owner || normalizePhone(owner.telephone) !== phone) {
      throw new NotFoundException('Aucun propriétaire ne correspond à cette CNI et ce téléphone');
    }
    if (owner.account) throw new BadRequestException('Un compte existe déjà pour ce propriétaire');
    const u = await this.prisma.userAccount.create({
      data: { ownerId: owner.id, telephone: phone, passwordHash: await bcrypt.hash(password, 10) },
    });
    return this.sendOtp(u.id, phone);
  }

  private async sendOtp(userId: string, phone: string): Promise<OtpChallengeDto> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.prisma.otpCode.create({
      data: { userId, codeHash: await bcrypt.hash(code, 8), expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    await this.sms.send(phone, `SEN Contraventions : votre code de connexion est ${code}. Il expire dans 5 minutes.`);
    return { otpRequired: true, challengeId: otp.id, maskedPhone: phone.replace(/^\+221(\d{2})\d{5}(\d{2})$/, '+221 $1 *** ** $2') };
  }

  async verifyOtp(challengeId: string, code: string) {
    const otp = await this.prisma.otpCode.findUnique({ where: { id: challengeId }, include: { user: true } });
    if (!otp || otp.usedAt || otp.expiresAt < new Date() || !(await bcrypt.compare(code, otp.codeHash))) {
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    await this.prisma.userAccount.update({ where: { id: otp.userId }, data: { lastLoginAt: new Date() } });
    return this.issue('user', otp.userId, otp.user.tokenVersion);
  }

  async refresh(token: string) {
    let p: JwtPayload;
    try {
      p = await this.jwt.verifyAsync<JwtPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Session expirée');
    }
    if (p.typ !== 'refresh') throw new UnauthorizedException('Jeton invalide');
    await resolveActor(this.prisma, p);
    return this.issue(p.kind, p.sub, p.tv);
  }

  inviteToken(adminId: string) {
    return this.jwt.signAsync({ sub: adminId, typ: 'invite' }, { expiresIn: INVITE_TTL_S });
  }

  async activateAdmin(token: string, password: string) {
    let p: { sub: string; typ: string };
    try {
      p = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Lien d'activation invalide ou expiré");
    }
    if (p.typ !== 'invite') throw new UnauthorizedException("Lien d'activation invalide");
    const a = await this.prisma.admin.findUnique({ where: { id: p.sub } });
    if (!a || a.statut !== 'en_attente') throw new BadRequestException('Invitation déjà utilisée');
    await this.prisma.admin.update({
      where: { id: a.id },
      data: { statut: 'actif', passwordHash: await bcrypt.hash(password, 10), lastLoginAt: new Date() },
    });
    return this.issue('admin', a.id, a.tokenVersion);
  }

  async me(actor: Actor) {
    if (actor.kind === 'admin') {
      const a = await this.prisma.admin.findUniqueOrThrow({ where: { id: actor.id }, include: { zone: true } });
      return { kind: 'admin', id: a.id, nom: a.nom, email: a.email, role: a.role, zone: a.zone };
    }
    if (actor.kind === 'officer') {
      const o = await this.prisma.officer.findUniqueOrThrow({ where: { id: actor.id }, include: { zone: true } });
      const { passwordHash, tokenVersion, ...rest } = o;
      return { kind: 'officer', ...rest };
    }
    const u = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id }, include: { owner: true } });
    return {
      kind: 'user',
      id: u.id,
      telephone: u.telephone,
      twoFactor: u.twoFactor,
      biometric: u.biometric,
      lang: u.lang,
      owner: u.owner,
    };
  }
}

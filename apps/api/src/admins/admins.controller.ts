import { BadRequestException, Body, ConflictException, Controller, Get, Logger, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthService } from '../auth/auth.service';
import { Actor, Allow, CurrentActor, Roles } from '../common/auth.decorators';
import { AuditService, SettingsStore } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

class InviteAdminDto {
  @IsString() @IsNotEmpty() nom: string;
  @IsEmail() email: string;
  @IsIn(['super_admin', 'commandant', 'tresorier', 'superviseur']) role: AdminRole;
  /** Zone de rattachement (commandant / superviseur) */
  @IsOptional() @IsString() zoneId?: string;
}

class UpdateSettingsDto {
  @IsOptional() @IsString() @IsNotEmpty() institution?: string;
  @IsOptional() @IsString() devise?: string;
  @IsOptional() @IsString() dateFormat?: string;
  @IsOptional() @IsBoolean() autoBackup?: boolean;
  @IsOptional() @IsString() @IsNotEmpty() smsTemplate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(90) delaiPaiementJours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) objectifRecouvrement?: number;
}

@ApiTags('Admins & paramètres')
@ApiBearerAuth()
@Controller()
export class AdminsController {
  private log = new Logger('Invitations');

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private settings: SettingsStore,
    private rt: RealtimeGateway,
    private audit: AuditService,
  ) {}

  @Roles() @Get('admins')
  async list() {
    const rows = await this.prisma.admin.findMany({ include: { zone: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({
      id: a.id,
      nom: a.nom,
      email: a.email,
      role: a.role,
      perimetre: a.role === 'tresorier' ? 'Trésor public' : a.zone ? `Zone ${a.zone.nom}` : a.role === 'super_admin' ? 'National' : 'À définir',
      statut: a.statut,
      lastLoginAt: a.lastLoginAt,
    }));
  }

  /** Invite un administrateur : lien d'activation envoyé par email (journalisé en dev). */
  @Roles() @Post('admins')
  async invite(@CurrentActor() actor: Actor, @Body() dto: InviteAdminDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.admin.findUnique({ where: { email } })) throw new ConflictException('Cet email a déjà un compte');
    if ((dto.role === 'commandant' || dto.role === 'superviseur') && !dto.zoneId) {
      throw new BadRequestException('Une zone est requise pour ce rôle');
    }
    const a = await this.prisma.admin.create({
      data: { nom: dto.nom.trim(), email, role: dto.role, zoneId: dto.zoneId, statut: 'en_attente' },
    });
    const token = await this.auth.inviteToken(a.id);
    const link = `${process.env.ADMIN_WEB_URL ?? 'http://localhost:3000'}/activation?token=${token}`;
    this.log.log(`Email → ${email} : ${link}`);
    await this.audit.log(actor, 'invite', 'admin', a.id, { email, role: dto.role });
    return { id: a.id, activationLink: process.env.NODE_ENV === 'production' ? undefined : link };
  }

  @Roles() @Post('admins/:id/revoke')
  async revoke(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (id === actor.id) throw new BadRequestException('Vous ne pouvez pas révoquer votre propre accès');
    await this.prisma.admin.update({ where: { id }, data: { statut: 'revoque', tokenVersion: { increment: 1 } } });
    await this.audit.log(actor, 'revoke', 'admin', id);
    return { ok: true };
  }

  @Roles() @Post('admins/:id/restore')
  async restore(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const a = await this.prisma.admin.findUniqueOrThrow({ where: { id } });
    await this.prisma.admin.update({ where: { id }, data: { statut: a.passwordHash ? 'actif' : 'en_attente' } });
    await this.audit.log(actor, 'restore', 'admin', id);
    return { ok: true };
  }

  /** Paramètres généraux. Lisibles par les terminaux (nom de l'institution, délai de paiement). */
  @Allow('admin', 'officer', 'user') @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Roles() @Put('settings')
  async putSettings(@CurrentActor() actor: Actor, @Body() dto: UpdateSettingsDto) {
    const out = await this.settings.set(dto);
    await this.audit.log(actor, 'update', 'settings', undefined, dto);
    this.rt.toOfficers('settings.updated', out);
    return out;
  }
}

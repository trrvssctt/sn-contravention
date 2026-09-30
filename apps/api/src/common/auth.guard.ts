import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, ActorKind, IS_PUBLIC, KINDS, ROLES } from './auth.decorators';

export interface JwtPayload {
  sub: string;
  kind: ActorKind;
  tv: number;
  typ: 'access' | 'refresh';
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Jeton manquant');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Jeton invalide');

    const actor = await resolveActor(this.prisma, payload);
    req.actor = actor;

    const kinds = this.reflector.getAllAndOverride<ActorKind[]>(KINDS, targets) ?? ['admin'];
    if (!kinds.includes(actor.kind)) throw new ForbiddenException('Accès non autorisé pour ce profil');

    if (actor.kind === 'admin') {
      const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES, targets);
      if (roles && actor.role !== 'super_admin' && !roles.includes(actor.role!)) {
        throw new ForbiddenException('Rôle insuffisant');
      }
      // Le superviseur est en lecture seule sur sa zone.
      if (actor.role === 'superviseur' && req.method !== 'GET') {
        throw new ForbiddenException('Profil superviseur : lecture seule');
      }
    }
    return true;
  }
}

/**
 * Recharge l'acteur en base : un officier suspendu reçoit HTTP 423 (terminal verrouillé),
 * un jeton émis avant une révocation (tokenVersion) est refusé.
 */
export async function resolveActor(prisma: PrismaService, p: JwtPayload): Promise<Actor> {
  if (p.kind === 'officer') {
    const o = await prisma.officer.findUnique({ where: { id: p.sub } });
    if (!o) throw new UnauthorizedException('Session expirée');
    // Le statut passe avant la version du jeton : un agent suspendu doit recevoir 423, pas 401.
    if (o.statut === 'suspendu') {
      throw new HttpException(
        { statusCode: 423, code: 'OFFICER_SUSPENDED', message: 'Compte suspendu : terminal verrouillé' },
        HttpStatus.LOCKED,
      );
    }
    if (o.statut === 'inactif') throw new UnauthorizedException('Compte inactif');
    if (o.tokenVersion !== p.tv) throw new UnauthorizedException('Session expirée');
    return { kind: 'officer', id: o.id, zoneId: o.zoneId, name: `${o.prenom} ${o.nom}` };
  }
  if (p.kind === 'admin') {
    const a = await prisma.admin.findUnique({ where: { id: p.sub } });
    if (!a || a.tokenVersion !== p.tv || a.statut !== 'actif') throw new UnauthorizedException('Accès révoqué');
    return { kind: 'admin', id: a.id, role: a.role, zoneId: a.zoneId, name: a.nom };
  }
  const u = await prisma.userAccount.findUnique({ where: { id: p.sub }, include: { owner: true } });
  if (!u || u.tokenVersion !== p.tv) throw new UnauthorizedException('Session expirée');
  return { kind: 'user', id: u.id, name: `${u.owner.prenom} ${u.owner.nom}` };
}

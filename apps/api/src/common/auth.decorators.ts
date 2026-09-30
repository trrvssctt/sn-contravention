import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export type ActorKind = 'admin' | 'officer' | 'user';

/** Acteur authentifié, reconstruit depuis le JWT et vérifié en base à chaque requête. */
export interface Actor {
  kind: ActorKind;
  id: string;
  role?: AdminRole;
  /** Zone de rattachement : limite la visibilité des commandants et superviseurs. */
  zoneId?: string | null;
  name: string;
}

export const IS_PUBLIC = 'isPublic';
export const KINDS = 'actorKinds';
export const ROLES = 'adminRoles';

/** Route accessible sans jeton. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Types d'acteurs autorisés (par défaut : admin uniquement). */
export const Allow = (...kinds: ActorKind[]) => SetMetadata(KINDS, kinds);

/** Rôles admin autorisés. Le Super Admin passe toujours. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES, roles);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  return ctx.switchToHttp().getRequest().actor;
});

/** Filtre Prisma limitant une requête à la zone de l'admin (commandant / superviseur). */
export function zoneScope(actor: Actor): { zoneId?: string } {
  if (actor.kind === 'admin' && actor.zoneId && (actor.role === 'commandant' || actor.role === 'superviseur')) {
    return { zoneId: actor.zoneId };
  }
  return {};
}

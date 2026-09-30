import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload, resolveActor } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Canal temps réel (Socket.IO, namespace /ws).
 * Connexion : io('<api>/ws', { auth: { token: '<access token>' } }).
 *
 * Salles : admins (tous) · admins:national · zone:<id> (admins de zone) · officers · officer:<id> · user:<id>
 * Événements : contravention.created · contravention.updated · payment.confirmed
 *              officer.suspended · infraction_types.updated · vehicle.flagged
 *              notification.created · settings.updated
 */
@WebSocketGateway({ namespace: '/ws', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private log = new Logger('Realtime');

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) || String(client.handshake.query?.token || '');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const actor = await resolveActor(this.prisma, payload);
      client.data.actor = actor;
      if (actor.kind === 'admin') {
        client.join('admins');
        client.join(actor.zoneId ? `zone:${actor.zoneId}` : 'admins:national');
      } else if (actor.kind === 'officer') {
        client.join(['officers', `officer:${actor.id}`]);
        await this.prisma.officer.update({ where: { id: actor.id }, data: { lastSeenAt: new Date() } });
        this.emitPresence();
      } else {
        client.join(`user:${actor.id}`);
      }
    } catch (e) {
      client.emit('error', { code: (e as { response?: { code?: string } })?.response?.code ?? 'UNAUTHORIZED' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.actor?.kind === 'officer') this.emitPresence();
  }

  /** Nombre de terminaux officiers connectés (pied de la sidebar admin). */
  async officersOnline(): Promise<number> {
    if (!this.server) return 0;
    const sockets = await this.server.in('officers').fetchSockets();
    return new Set(sockets.map((s) => s.data.actor?.id)).size;
  }

  private async emitPresence() {
    this.server.to('admins').emit('presence.updated', { officersOnline: await this.officersOnline() });
  }

  /** Admins nationaux : tout ; admins de zone (commandant, superviseur) : leur zone uniquement. */
  toAdmins(event: string, data: unknown, zoneId?: string) {
    if (!this.server) return;
    const rooms = zoneId ? ['admins:national', `zone:${zoneId}`] : ['admins'];
    this.server.to(rooms).emit(event, data);
  }

  toOfficers(event: string, data: unknown) {
    this.server?.to('officers').emit(event, data);
  }

  toActor(kind: string, id: string, event: string, data: unknown) {
    this.server?.to(`${kind}:${id}`).emit(event, data);
  }

  /** Force la déconnexion d'un officier suspendu (verrouillage immédiat du terminal). */
  async kickOfficer(id: string) {
    this.server?.to(`officer:${id}`).emit('officer.suspended', { code: 'OFFICER_SUSPENDED' });
    const sockets = await this.server?.in(`officer:${id}`).fetchSockets();
    sockets?.forEach((s) => s.disconnect(true));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Actor } from './auth.decorators';

type Tx = Prisma.TransactionClient;

/** Numérotation séquentielle par année : CNT-2026-00848, RCU-2026-00319. */
@Injectable()
export class NumberingService {
  async next(tx: Tx, prefix: 'CNT' | 'RCU', date = new Date()): Promise<string> {
    const key = `${prefix}-${date.getFullYear()}`;
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
      RETURNING "value"`;
    return `${key}-${String(rows[0].value).padStart(5, '0')}`;
  }
}

export const DEFAULT_SETTINGS = {
  institution: 'Police Nationale du Sénégal — Direction de la Sécurité Publique',
  devise: 'XOF',
  dateFormat: 'DD/MM/YYYY',
  autoBackup: true,
  smsTemplate:
    'SEN Contraventions : amende de {montant} FCFA (N° {numero}) pour le véhicule {plaque}. Payez via Wave ou Orange Money sous 15 jours.',
  delaiPaiementJours: 15,
  objectifRecouvrement: 80,
};
export type Settings = typeof DEFAULT_SETTINGS;

@Injectable()
export class SettingsStore {
  constructor(private prisma: PrismaService) {}

  async get(): Promise<Settings> {
    const rows = await this.prisma.setting.findMany();
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out as Settings;
  }

  async set(values: Partial<Settings>) {
    await this.prisma.$transaction(
      Object.entries(values)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) =>
          this.prisma.setting.upsert({
            where: { key },
            create: { key, value: value as Prisma.InputJsonValue },
            update: { value: value as Prisma.InputJsonValue },
          }),
        ),
    );
    return this.get();
  }
}

/** Passerelle SMS. En dev (SMS_PROVIDER=console) les messages sont journalisés. */
@Injectable()
export class SmsService {
  private log = new Logger('SMS');

  async send(to: string, body: string) {
    // Brancher ici l'opérateur (Orange SMS API, etc.) en production.
    this.log.log(`→ ${to} : ${body}`);
    return { to, length: body.length };
  }

  render(template: string, vars: { montant: number; numero: string; plaque: string }) {
    return template
      .replaceAll('{montant}', fmtAmount(vars.montant))
      .replaceAll('{numero}', vars.numero)
      .replaceAll('{plaque}', vars.plaque);
  }
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(actor: Actor | null, action: string, entity: string, entityId?: string, diff?: unknown) {
    return this.prisma.auditLog.create({
      data: {
        actorType: (actor?.kind as ActorType) ?? 'system',
        actorId: actor?.id,
        action,
        entity,
        entityId,
        diff: diff as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class NotifyService {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeGateway,
  ) {}

  async push(type: ActorType, id: string, n: { type: string; titre: string; corps: string }) {
    const row = await this.prisma.notification.create({
      data: { destinataireType: type, destinataireId: id, ...n },
    });
    this.rt.toActor(type, id, 'notification.created', row);
    return row;
  }

  async pushMany(type: ActorType, ids: string[], n: { type: string; titre: string; corps: string }) {
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((id) => ({ destinataireType: type, destinataireId: id, ...n })),
    });
    for (const id of ids) this.rt.toActor(type, id, 'notification.created', n);
  }
}

export function fmtAmount(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Bornes de dates utilitaires (fuseau serveur = Africa/Dakar, UTC+0). */
export const dates = {
  startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  },
  startOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  },
  addDays(d: Date, n: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  },
  addMonths(d: Date, n: number) {
    return new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes());
  },
};

export function paginate(page?: string | number, perPage?: string | number, max = 100) {
  const p = Math.max(1, Number(page) || 1);
  const pp = Math.min(max, Math.max(1, Number(perPage) || 20));
  return { page: p, perPage: pp, skip: (p - 1) * pp, take: pp };
}

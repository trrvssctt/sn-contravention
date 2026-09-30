import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentChannel, PaymentMode, Prisma } from '@prisma/client';
import { Actor } from '../common/auth.decorators';
import { AuditService, NotifyService, NumberingService, paginate } from '../common/common.services';
import { officerName } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PaymentDto } from './dto/payment.dto';

const paymentInclude = {
  officer: true,
  allocations: { include: { contravention: { include: { vehicle: true } } } },
} satisfies Prisma.PaymentInclude;
type FullPayment = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export function toPaymentDto(p: FullPayment): PaymentDto {
  return {
    id: p.id,
    numeroRecu: p.numeroRecu,
    mode: p.mode,
    montant: p.montant,
    statut: p.statut,
    canal: p.canal,
    dateHeure: p.dateHeure,
    referenceExterne: p.referenceExterne,
    plaque: p.allocations[0]?.contravention.vehicle.plaque ?? null,
    encaissePar: p.officer ? officerName(p.officer) : p.canal === 'usager' ? 'App usager' : 'Administration',
    allocations: p.allocations.map((a) => ({ contraventionId: a.contraventionId, numero: a.contravention.numero, montant: a.montant })),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private rt: RealtimeGateway,
    private notify: NotifyService,
    private audit: AuditService,
  ) {}

  /** Charge les contraventions à régler (par id ou numéro) et vérifie qu'elles sont dues. */
  private async loadDue(refs: string[]) {
    const rows = await this.prisma.contravention.findMany({
      where: { OR: [{ id: { in: refs } }, { numero: { in: refs } }] },
      include: { vehicle: true },
      orderBy: { dateHeure: 'asc' },
    });
    if (rows.length !== new Set(refs).size) throw new NotFoundException('Contravention introuvable');
    const due = rows.filter((c) => c.statut === 'impayee' || c.statut === 'partielle');
    if (due.length !== rows.length) throw new BadRequestException('Une ou plusieurs amendes sont déjà réglées ou annulées');
    return due;
  }

  /** Répartit un montant sur les amendes, de la plus ancienne à la plus récente. */
  private allocate(due: { id: string; montantTotal: number; montantPaye: number }[], montant: number) {
    let left = montant;
    const out: { contraventionId: string; montant: number }[] = [];
    for (const c of due) {
      if (left <= 0) break;
      const part = Math.min(left, c.montantTotal - c.montantPaye);
      if (part > 0) out.push({ contraventionId: c.id, montant: part });
      left -= part;
    }
    return out;
  }

  /** Encaissement immédiat (officier sur le terrain, ou admin « Marquer comme payée »). */
  async record(
    actor: Actor,
    input: { contraventions: string[]; mode: PaymentMode; montant?: number; referenceExterne?: string },
  ) {
    const due = await this.loadDue(input.contraventions);
    const reste = due.reduce((a, c) => a + c.montantTotal - c.montantPaye, 0);
    const montant = Math.min(input.montant ?? reste, reste);
    if (input.mode !== 'especes' && !input.referenceExterne && actor.kind === 'officer') {
      throw new BadRequestException('Référence de transaction requise pour ce mode de paiement');
    }
    const channel: PaymentChannel = actor.kind === 'officer' ? 'officer' : 'admin';
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          mode: input.mode,
          montant,
          referenceExterne: input.referenceExterne,
          canal: channel,
          officerId: actor.kind === 'officer' ? actor.id : null,
          ownerId: due[0].vehicle.ownerId,
          allocations: { create: this.allocate(due, montant) },
        },
      });
      return this.confirmTx(tx, p.id);
    });
    await this.audit.log(actor, 'record', 'payment', payment.id, { montant, mode: input.mode });
    await this.afterConfirm(payment);
    return toPaymentDto(payment);
  }

  /** Intention de paiement mobile money (Espace Usager). Confirmée par le webhook opérateur. */
  async createIntent(actor: Actor, refs: string[], provider: 'wave' | 'orange_money') {
    const account = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id } });
    const due = await this.loadDue(refs);
    if (due.some((c) => c.vehicle.ownerId !== account.ownerId)) throw new ForbiddenException('Amende d\'un autre propriétaire');
    const montant = due.reduce((a, c) => a + c.montantTotal - c.montantPaye, 0);
    const p = await this.prisma.payment.create({
      data: {
        mode: provider,
        montant,
        canal: 'usager',
        ownerId: account.ownerId,
        allocations: { create: this.allocate(due, montant) },
      },
    });
    // En production : appel à l'API Wave Checkout / Orange Money Web Payment qui renvoie l'URL.
    const checkoutUrl = `${process.env.PUBLIC_URL}/v1/dev/checkout/${p.id}`;
    const row = await this.prisma.payment.update({ where: { id: p.id }, data: { checkoutUrl }, include: paymentInclude });
    return { ...toPaymentDto(row), checkoutUrl };
  }

  async getIntent(actor: Actor, id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id }, include: paymentInclude });
    if (!p) throw new NotFoundException('Paiement introuvable');
    if (actor.kind === 'user') {
      const account = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id } });
      if (p.ownerId !== account.ownerId) throw new ForbiddenException();
    }
    return { ...toPaymentDto(p), checkoutUrl: p.checkoutUrl ?? '' };
  }

  /** Appelé par les webhooks opérateurs (signature vérifiée en amont). Idempotent. */
  async settleIntent(id: string, success: boolean, reference?: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Paiement introuvable');
    if (p.statut !== 'en_attente') return { ok: true, statut: p.statut };
    if (!success) {
      await this.prisma.payment.update({ where: { id }, data: { statut: 'echoue', referenceExterne: reference } });
      return { ok: true, statut: 'echoue' };
    }
    const full = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { referenceExterne: reference, dateHeure: new Date() } });
      return this.confirmTx(tx, id);
    });
    await this.afterConfirm(full);
    return { ok: true, statut: 'confirme' };
  }

  /** Confirme un paiement : N° de reçu, mise à jour des montants payés et statuts. */
  private async confirmTx(tx: Prisma.TransactionClient, id: string) {
    const numeroRecu = await this.numbering.next(tx, 'RCU');
    const p = await tx.payment.update({ where: { id }, data: { statut: 'confirme', numeroRecu }, include: paymentInclude });
    for (const a of p.allocations) {
      const c = await tx.contravention.update({
        where: { id: a.contraventionId },
        data: { montantPaye: { increment: a.montant } },
      });
      await tx.contravention.update({
        where: { id: c.id },
        data: { statut: c.montantPaye >= c.montantTotal ? 'payee' : 'partielle' },
      });
    }
    return p;
  }

  private async afterConfirm(p: FullPayment) {
    const dto = toPaymentDto(p);
    this.rt.toAdmins('payment.confirmed', dto, p.allocations[0]?.contravention.zoneId);
    if (p.officerId) this.rt.toActor('officer', p.officerId, 'payment.confirmed', dto);
    if (p.ownerId) {
      const account = await this.prisma.userAccount.findUnique({ where: { ownerId: p.ownerId } });
      if (account) {
        this.rt.toActor('user', account.id, 'payment.confirmed', dto);
        await this.notify.push('user', account.id, {
          type: 'paiement',
          titre: 'Paiement confirmé',
          corps: `Reçu ${p.numeroRecu} · ${p.montant.toLocaleString('fr-FR')} F`,
        });
      }
    }
  }

  async list(q: { mode?: string; page?: string; per_page?: string; from?: string; to?: string }, actor: Actor) {
    const { page, perPage, skip, take } = paginate(q.page, q.per_page);
    const where: Prisma.PaymentWhereInput = { statut: 'confirme' };
    if (q.mode && q.mode !== 'all') where.mode = q.mode as PaymentMode;
    if (q.from || q.to) where.dateHeure = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    if (actor.kind === 'officer') where.officerId = actor.id;
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, include: paymentInclude, orderBy: { dateHeure: 'desc' }, skip, take }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: rows.map(toPaymentDto), total, page, perPage };
  }

  async receipt(numeroOrId: string) {
    const p = await this.prisma.payment.findFirst({
      where: { OR: [{ id: numeroOrId }, { numeroRecu: numeroOrId }] },
      include: paymentInclude,
    });
    if (!p) throw new NotFoundException('Reçu introuvable');
    return toPaymentDto(p);
  }
}

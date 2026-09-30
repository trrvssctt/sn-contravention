import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor, zoneScope } from '../common/auth.decorators';
import { AuditService, NotifyService, NumberingService, paginate, SettingsStore, SmsService } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ContraventionDto, CreateContraventionDto, ListContraventionsQuery, UpdateContraventionDto } from './dto/contravention.dto';

export const contraventionInclude = {
  vehicle: { include: { owner: true } },
  officer: true,
  zone: true,
  items: { include: { infractionType: true } },
} satisfies Prisma.ContraventionInclude;

type Full = Prisma.ContraventionGetPayload<{ include: typeof contraventionInclude }>;

const GRADE_ABBR: Record<string, string> = {
  Sergent: 'Sgt.',
  Brigadier: 'Brig.',
  Officier: 'Off.',
  Adjudant: 'Adj.',
  Lieutenant: 'Lt.',
  Capitaine: 'Cpt.',
  Commissaire: 'Com.',
};

export function officerName(o: { grade: string; prenom: string; nom: string }) {
  return `${GRADE_ABBR[o.grade] ?? ''} ${o.prenom} ${o.nom}`.trim();
}

export function toContraventionDto(c: Full): ContraventionDto {
  return {
    id: c.id,
    numero: c.numero,
    dateHeure: c.dateHeure,
    plaque: c.vehicle.plaque,
    vehicule: `${c.vehicle.marque} ${c.vehicle.modele}`,
    proprietaire: `${c.vehicle.owner.prenom} ${c.vehicle.owner.nom}`,
    infraction: c.items.map((i) => i.infractionType.libelle).join(' + '),
    items: c.items.map((i) => ({
      infractionTypeId: i.infractionTypeId,
      code: i.infractionType.code,
      libelle: i.infractionType.libelle,
      icone: i.infractionType.icone,
      montant: i.montant,
    })),
    officierId: c.officerId,
    officier: c.officer ? officerName(c.officer) : null,
    zoneId: c.zoneId,
    zone: c.zone.nom,
    montantTotal: c.montantTotal,
    montantPaye: c.montantPaye,
    resteAPayer: c.statut === 'annulee' ? 0 : Math.max(0, c.montantTotal - c.montantPaye),
    statut: c.statut,
    canal: c.canal,
    lieuTexte: c.lieuTexte,
    lat: c.lat,
    lng: c.lng,
    photoPreuveUrl: c.photoPreuveUrl,
    notes: c.notes,
    qrPayload: `SENCTV:${c.numero}:${c.montantTotal}`,
  };
}

@Injectable()
export class ContraventionsService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private rt: RealtimeGateway,
    private sms: SmsService,
    private settings: SettingsStore,
    private notify: NotifyService,
    private audit: AuditService,
  ) {}

  where(actor: Actor, q: ListContraventionsQuery): Prisma.ContraventionWhereInput {
    const w: Prisma.ContraventionWhereInput = { ...zoneScope(actor) };
    if (actor.kind === 'officer') w.officerId = actor.id;
    if (q.statut) w.statut = q.statut as Prisma.EnumContraventionStatusFilter['equals'];
    if (q.zone_id && !w.zoneId) w.zoneId = q.zone_id;
    if (q.officer_id && actor.kind === 'admin') w.officerId = q.officer_id;
    if (q.from || q.to) w.dateHeure = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    const s = q.q?.trim();
    if (s) {
      w.OR = [
        { numero: { contains: s, mode: 'insensitive' } },
        { vehicle: { plaque: { contains: s, mode: 'insensitive' } } },
        { officer: { nom: { contains: s, mode: 'insensitive' } } },
        { officer: { prenom: { contains: s, mode: 'insensitive' } } },
      ];
    }
    return w;
  }

  async list(actor: Actor, q: ListContraventionsQuery) {
    const { page, perPage, skip, take } = paginate(q.page, q.per_page);
    const where = this.where(actor, q);
    const [rows, total] = await Promise.all([
      this.prisma.contravention.findMany({ where, include: contraventionInclude, orderBy: { dateHeure: 'desc' }, skip, take }),
      this.prisma.contravention.count({ where }),
    ]);
    return { data: rows.map(toContraventionDto), total, page, perPage };
  }

  /** Compteurs par statut pour les mini-stats du registre. */
  async counts(actor: Actor) {
    const grouped = await this.prisma.contravention.groupBy({
      by: ['statut'],
      where: { ...zoneScope(actor) },
      _count: true,
    });
    const out = { total: 0, impayee: 0, partielle: 0, payee: 0, annulee: 0 };
    for (const g of grouped) {
      out[g.statut] = g._count;
      out.total += g._count;
    }
    return out;
  }

  async get(actor: Actor, idOrNumero: string) {
    const c = await this.prisma.contravention.findFirst({
      where: { OR: [{ id: idOrNumero }, { numero: idOrNumero }] },
      include: {
        ...contraventionInclude,
        allocations: { include: { payment: true }, where: { payment: { statut: 'confirme' } } },
      },
    });
    if (!c) throw new NotFoundException('Contravention introuvable');
    // Lecture ouverte aux admins de zone (fiche usager / véhicule), actions limitées à leur zone.
    if (actor.kind === 'officer') this.assertVisible(actor, c);
    const scope = zoneScope(actor);
    return {
      ...toContraventionDto(c),
      horsZone: !!scope.zoneId && scope.zoneId !== c.zoneId,
      paiements: c.allocations.map((a) => ({
        numeroRecu: a.payment.numeroRecu,
        mode: a.payment.mode,
        dateHeure: a.payment.dateHeure,
        montant: a.montant,
        canal: a.payment.canal,
      })),
    };
  }

  private assertVisible(actor: Actor, c: { zoneId: string; officerId: string | null }) {
    const scope = zoneScope(actor);
    if (scope.zoneId && scope.zoneId !== c.zoneId) throw new ForbiddenException('Hors de votre zone');
    if (actor.kind === 'officer' && c.officerId !== actor.id) throw new ForbiddenException('Contravention d\'un autre agent');
  }

  async create(actor: Actor, dto: CreateContraventionDto) {
    if (dto.clientUuid) {
      const existing = await this.prisma.contravention.findUnique({ where: { clientUuid: dto.clientUuid }, include: contraventionInclude });
      if (existing) return toContraventionDto(existing);
    }
    const plaque = dto.plaque.trim().toUpperCase();
    const vehicle = await this.prisma.vehicle.findUnique({ where: { plaque }, include: { owner: true } });
    if (!vehicle) throw new NotFoundException(`Véhicule ${plaque} inconnu : enregistrez-le d'abord`);

    const officerId = actor.kind === 'officer' ? actor.id : dto.officerId ?? null;
    const officer = officerId ? await this.prisma.officer.findUnique({ where: { id: officerId } }) : null;
    if (officerId && !officer) throw new BadRequestException('Officier introuvable');
    const zoneId = dto.zoneId ?? officer?.zoneId;
    if (!zoneId) throw new BadRequestException('Zone requise');
    const scope = zoneScope(actor);
    if (scope.zoneId && scope.zoneId !== zoneId) throw new ForbiddenException('Hors de votre zone');

    const types = await this.prisma.infractionType.findMany({
      where: { id: { in: dto.infractionTypeIds }, actif: true, deletedAt: null },
    });
    if (types.length !== new Set(dto.infractionTypeIds).size) {
      throw new BadRequestException('Infraction inconnue ou désactivée : resynchronisez le barème');
    }
    const total = types.reduce((a, t) => a + t.montantDefaut, 0);
    const when = dto.dateHeure ? new Date(dto.dateHeure) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const numero = await this.numbering.next(tx, 'CNT', when);
      return tx.contravention.create({
        data: {
          numero,
          vehicleId: vehicle.id,
          officerId,
          zoneId,
          montantTotal: total,
          lieuTexte: dto.lieuTexte ?? (actor.kind === 'admin' ? 'Saisie manuelle · administration' : null),
          lat: dto.lat,
          lng: dto.lng,
          dateHeure: when,
          photoPreuveUrl: dto.photoPreuveUrl,
          notes: dto.notes,
          canal: actor.kind === 'officer' ? 'mobile' : 'admin',
          clientUuid: dto.clientUuid,
          items: { create: types.map((t) => ({ infractionTypeId: t.id, montant: t.montantDefaut })) },
        },
        include: contraventionInclude,
      });
    });

    const out = toContraventionDto(created);
    const { smsTemplate } = await this.settings.get();
    await this.sms.send(vehicle.owner.telephone, this.sms.render(smsTemplate, { montant: total, numero: out.numero, plaque }));
    const account = await this.prisma.userAccount.findUnique({ where: { ownerId: vehicle.ownerId } });
    if (account) {
      await this.notify.push('user', account.id, {
        type: 'contravention',
        titre: 'Nouvelle amende reçue',
        corps: `${out.infraction} · ${plaque} · ${total.toLocaleString('fr-FR')} F`,
      });
    }
    await this.audit.log(actor, 'create', 'contravention', created.id, { numero: out.numero, total });
    this.rt.toAdmins('contravention.created', out, zoneId);
    return out;
  }

  async update(actor: Actor, id: string, dto: UpdateContraventionDto) {
    const c = await this.prisma.contravention.findUniqueOrThrow({ where: { id } });
    this.assertVisible(actor, c);
    const row = await this.prisma.contravention.update({ where: { id }, data: dto, include: contraventionInclude });
    await this.audit.log(actor, 'update', 'contravention', id, dto);
    const out = toContraventionDto(row);
    this.rt.toAdmins('contravention.updated', out, row.zoneId);
    return out;
  }

  async cancel(actor: Actor, id: string, motif?: string) {
    const c = await this.prisma.contravention.findUniqueOrThrow({ where: { id } });
    this.assertVisible(actor, c);
    if (c.statut === 'payee') throw new BadRequestException('Une amende payée ne peut pas être annulée');
    const row = await this.prisma.contravention.update({ where: { id }, data: { statut: 'annulee' }, include: contraventionInclude });
    await this.audit.log(actor, 'cancel', 'contravention', id, { motif });
    const out = toContraventionDto(row);
    this.rt.toAdmins('contravention.updated', out, row.zoneId);
    return out;
  }
}

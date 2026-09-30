import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vehicle } from '@prisma/client';
import { displayPhone } from '../auth/auth.service';
import { Actor } from '../common/auth.decorators';
import { AuditService, dates, NotifyService, paginate } from '../common/common.services';
import { contraventionInclude, toContraventionDto } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateVehicleDto, VehicleDetailDto, VehicleDocumentDto } from './dto/vehicle.dto';

export function vehicleDocuments(v: Vehicle, now = new Date()): VehicleDocumentDto[] {
  return [
    { code: 'ASS', label: 'Assurance', ok: !!v.assuranceExp && v.assuranceExp > now, expiration: v.assuranceExp },
    { code: 'VT', label: 'Visite technique', ok: !!v.visiteTechExp && v.visiteTechExp > now, expiration: v.visiteTechExp },
    { code: 'CG', label: 'Carte grise', ok: v.carteGriseOk, expiration: null },
  ];
}

const TYPE_LABEL = { VP: 'Voiture', Moto: 'Moto', Camion: 'Camion', Bus: 'Bus' } as const;

@Injectable()
export class VehiclesService {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeGateway,
    private notify: NotifyService,
    private audit: AuditService,
  ) {}

  private alertWhere(now = new Date()): Prisma.VehicleWhereInput {
    return {
      OR: [
        { assuranceExp: { lt: now } },
        { assuranceExp: null },
        { visiteTechExp: { lt: now } },
        { visiteTechExp: null },
        { carteGriseOk: false },
        { flagged: true },
        { contraventions: { some: { statut: 'impayee' } } },
      ],
    };
  }

  async list(q: { q?: string; filter?: string; page?: string; per_page?: string }) {
    const { page, perPage, skip, take } = paginate(q.page, q.per_page);
    const and: Prisma.VehicleWhereInput[] = [];
    const s = q.q?.trim();
    if (s) {
      and.push({
        OR: [
          { plaque: { contains: s, mode: 'insensitive' } },
          { marque: { contains: s, mode: 'insensitive' } },
          { modele: { contains: s, mode: 'insensitive' } },
          { owner: { nom: { contains: s, mode: 'insensitive' } } },
          { owner: { prenom: { contains: s, mode: 'insensitive' } } },
        ],
      });
    }
    if (q.filter === 'alert') and.push(this.alertWhere());
    if (q.filter === 'ok') and.push({ NOT: this.alertWhere() });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { owner: true, _count: { select: { contraventions: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    const unpaid = await this.prisma.contravention.groupBy({
      by: ['vehicleId'],
      where: { vehicleId: { in: rows.map((r) => r.id) }, statut: 'impayee' },
      _count: true,
    });
    const unpaidSet = new Set(unpaid.map((u) => u.vehicleId));
    const now = new Date();
    return {
      data: rows.map((v) => {
        const docs = vehicleDocuments(v, now);
        return {
          id: v.id,
          plaque: v.plaque,
          marque: v.marque,
          modele: v.modele,
          couleur: v.couleur,
          annee: v.annee,
          type: v.type,
          typeLabel: TYPE_LABEL[v.type],
          proprietaire: `${v.owner.prenom} ${v.owner.nom}`,
          ownerId: v.ownerId,
          contraventions: v._count.contraventions,
          documents: docs,
          alerte: docs.some((d) => !d.ok) || v.flagged || unpaidSet.has(v.id),
        };
      }),
      total,
      page,
      perPage,
    };
  }

  async stats() {
    const now = new Date();
    const month = dates.startOfMonth(now);
    const [total, alert, expired, enrolled, byType, assOk, vtOk, cgOk, brands] = await Promise.all([
      this.prisma.vehicle.count(),
      this.prisma.vehicle.count({ where: this.alertWhere(now) }),
      this.prisma.vehicle.count({
        where: { OR: [{ assuranceExp: { lt: now } }, { visiteTechExp: { lt: now } }, { carteGriseOk: false }] },
      }),
      this.prisma.vehicle.count({ where: { createdAt: { gte: month } } }),
      this.prisma.vehicle.groupBy({ by: ['type'], _count: true }),
      this.prisma.vehicle.count({ where: { assuranceExp: { gte: now } } }),
      this.prisma.vehicle.count({ where: { visiteTechExp: { gte: now } } }),
      this.prisma.vehicle.count({ where: { carteGriseOk: true } }),
      this.prisma.$queryRaw<{ marque: string; n: bigint }[]>`
        SELECT v.marque, COUNT(*) AS n FROM "Contravention" c JOIN "Vehicle" v ON v.id = c."vehicleId"
        WHERE c."dateHeure" >= ${month} GROUP BY v.marque ORDER BY n DESC LIMIT 5`,
    ]);
    const brandTotal = await this.prisma.contravention.count({ where: { dateHeure: { gte: month } } });
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    return {
      total,
      enAlerte: alert,
      documentsExpires: expired,
      enrolesCeMois: enrolled,
      parType: (['VP', 'Moto', 'Camion', 'Bus'] as const).map((t) => {
        const n = byType.find((b) => b.type === t)?._count ?? 0;
        return { type: t, count: n, pct: pct(n) };
      }),
      conformite: [
        { code: 'ASS', label: 'Assurance', pct: pct(assOk), nonConformes: total - assOk },
        { code: 'VT', label: 'Visite technique', pct: pct(vtOk), nonConformes: total - vtOk },
        { code: 'CG', label: 'Carte grise', pct: pct(cgOk), nonConformes: total - cgOk },
      ],
      marques: brands.map((b) => ({
        marque: b.marque,
        count: Number(b.n),
        pct: brandTotal ? Math.round((Number(b.n) / brandTotal) * 100) : 0,
      })),
    };
  }

  /** Fiche véhicule (scan OCR de l'App Officier, drawer admin). */
  async detail(plate: string): Promise<VehicleDetailDto> {
    const v = await this.prisma.vehicle.findUnique({
      where: { plaque: plate.trim().toUpperCase() },
      include: { owner: { include: { account: true } } },
    });
    if (!v) throw new NotFoundException('Véhicule non trouvé au fichier national');
    const cs = await this.prisma.contravention.findMany({
      where: { vehicleId: v.id },
      include: contraventionInclude,
      orderBy: { dateHeure: 'desc' },
      take: 50,
    });
    const hist = cs.map(toContraventionDto);
    const impayees = hist.filter((c) => c.statut === 'impayee' || c.statut === 'partielle');
    const docs = vehicleDocuments(v);
    return {
      id: v.id,
      plaque: v.plaque,
      marque: v.marque,
      modele: v.modele,
      couleur: v.couleur,
      annee: v.annee,
      type: v.type,
      carburant: v.carburant,
      chassis: v.chassis,
      flagged: v.flagged,
      flagReason: v.flagReason,
      alerte: docs.some((d) => !d.ok) || v.flagged || impayees.some((c) => c.statut === 'impayee'),
      documents: docs,
      proprietaire: {
        id: v.owner.id,
        prenom: v.owner.prenom,
        nom: v.owner.nom,
        cni: v.owner.cni,
        telephone: v.owner.telephone,
        quartier: v.owner.quartier,
        hasAppAccount: !!v.owner.account,
      },
      totalDu: impayees.reduce((a, c) => a + c.resteAPayer, 0),
      impayees,
      historique: hist,
    };
  }

  async create(actor: Actor, dto: CreateVehicleDto) {
    const plaque = dto.plaque.trim().toUpperCase();
    if (await this.prisma.vehicle.findUnique({ where: { plaque } })) throw new ConflictException(`Le véhicule ${plaque} existe déjà`);
    let ownerId = dto.ownerId;
    if (!ownerId) {
      if (!dto.owner) throw new BadRequestException('Propriétaire requis (ownerId ou owner)');
      const o = dto.owner;
      const owner = await this.prisma.owner.upsert({
        where: { cni: o.cni.trim() },
        create: { ...o, cni: o.cni.trim(), prenom: o.prenom.trim(), nom: o.nom.trim(), telephone: displayPhone(o.telephone) },
        update: {},
      });
      ownerId = owner.id;
    }
    const v = await this.prisma.vehicle.create({
      data: {
        plaque,
        marque: dto.marque.trim(),
        modele: dto.modele.trim(),
        couleur: dto.couleur,
        annee: dto.annee,
        type: dto.type,
        carburant: dto.carburant,
        chassis: dto.chassis,
        assuranceExp: dto.assuranceExp ? new Date(dto.assuranceExp) : null,
        visiteTechExp: dto.visiteTechExp ? new Date(dto.visiteTechExp) : null,
        carteGriseOk: dto.carteGriseOk ?? true,
        ownerId,
      },
    });
    await this.audit.log(actor, 'enroll', 'vehicle', v.id, { plaque });
    this.rt.toAdmins('vehicle.created', { plaque });
    return this.detail(plaque);
  }

  /** Signale un véhicule à toutes les brigades (notification + temps réel). */
  async flag(actor: Actor, plate: string, reason?: string) {
    const v = await this.prisma.vehicle.update({
      where: { plaque: plate.toUpperCase() },
      data: { flagged: true, flagReason: reason ?? 'Signalé par l\'administration' },
    });
    const officers = await this.prisma.officer.findMany({ where: { statut: 'actif' }, select: { id: true } });
    await this.notify.pushMany(
      'officer',
      officers.map((o) => o.id),
      { type: 'vehicule_signale', titre: 'Véhicule signalé', corps: `${v.plaque} · ${v.flagReason}` },
    );
    this.rt.toOfficers('vehicle.flagged', { plaque: v.plaque, reason: v.flagReason });
    await this.audit.log(actor, 'flag', 'vehicle', v.id, { reason });
    return { ok: true, notified: officers.length };
  }
}

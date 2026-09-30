import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Actor, CurrentActor, zoneScope } from '../common/auth.decorators';
import { dates } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type Period = 'jour' | 'semaine' | 'mois';

/** Fenêtre courante et fenêtre précédente de même durée (pour les variations). */
function windows(period: Period, now = new Date()) {
  if (period === 'jour') {
    const s = dates.startOfDay(now);
    return { from: s, to: now, prevFrom: dates.addDays(s, -1), prevTo: dates.addDays(now, -1) };
  }
  if (period === 'semaine') {
    const s = dates.addDays(dates.startOfDay(now), -6);
    return { from: s, to: now, prevFrom: dates.addDays(s, -7), prevTo: dates.addDays(now, -7) };
  }
  const s = dates.startOfMonth(now);
  return { from: s, to: now, prevFrom: dates.addMonths(s, -1), prevTo: dates.addMonths(now, -1) };
}

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeGateway,
  ) {}

  private zoneSql(actor: Actor) {
    const z = zoneScope(actor).zoneId;
    return z ? Prisma.sql`AND c."zoneId" = ${z}` : Prisma.empty;
  }

  private async metrics(actor: Actor, from: Date, to: Date) {
    const scope = zoneScope(actor);
    const base = { ...scope, dateHeure: { gte: from, lte: to }, statut: { not: 'annulee' as const } };
    const [agg, impayees, cash] = await Promise.all([
      this.prisma.contravention.aggregate({ where: base, _count: true, _sum: { montantTotal: true } }),
      this.prisma.contravention.count({ where: { ...base, statut: 'impayee' } }),
      this.prisma.$queryRaw<{ s: bigint | null }[]>`
        SELECT SUM(a.montant) AS s FROM "PaymentAllocation" a
        JOIN "Payment" p ON p.id = a."paymentId" JOIN "Contravention" c ON c.id = a."contraventionId"
        WHERE p.statut = 'confirme' AND p."dateHeure" BETWEEN ${from} AND ${to} ${this.zoneSql(actor)}`,
    ]);
    const emis = agg._sum.montantTotal ?? 0;
    const encaisse = Number(cash[0].s ?? 0);
    return {
      contraventions: agg._count,
      montantEmis: emis,
      montantEncaisse: encaisse,
      tauxRecouvrement: emis ? Math.min(100, Math.round((encaisse / emis) * 100)) : 0,
      impayees,
    };
  }

  /** KPI de la période + valeurs de la période précédente (variations calculées côté client). */
  @Get('kpis')
  async kpis(@CurrentActor() actor: Actor, @Query('period') period: Period = 'mois') {
    const w = windows(period);
    const [current, previous] = await Promise.all([this.metrics(actor, w.from, w.to), this.metrics(actor, w.prevFrom, w.prevTo)]);
    return { period, current, previous };
  }

  @Get('series')
  async series(@CurrentActor() actor: Actor, @Query('days') daysRaw = '30') {
    const days = Math.min(365, Math.max(7, Number(daysRaw) || 30));
    // Journées complètes uniquement (jusqu'à hier) : la journée en cours fausserait la courbe.
    const to = dates.startOfDay();
    const from = dates.addDays(to, -days);
    const rows = await this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
      SELECT date_trunc('day', c."dateHeure") AS d, COUNT(*) AS n FROM "Contravention" c
      WHERE c."dateHeure" >= ${from} AND c."dateHeure" < ${to} AND c.statut <> 'annulee' ${this.zoneSql(actor)}
      GROUP BY 1 ORDER BY 1`;
    const byDay = new Map(rows.map((r) => [new Date(r.d).toDateString(), Number(r.n)]));
    return Array.from({ length: days }, (_, i) => {
      const d = dates.addDays(from, i);
      return { date: d.toISOString(), count: byDay.get(d.toDateString()) ?? 0 };
    });
  }

  @Get('by-type')
  async byType(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.$queryRaw<{ libelle: string; n: bigint }[]>`
      SELECT t.libelle, COUNT(*) AS n FROM "ContraventionItem" i
      JOIN "InfractionType" t ON t.id = i."infractionTypeId" JOIN "Contravention" c ON c.id = i."contraventionId"
      WHERE c."dateHeure" >= ${dates.startOfMonth()} AND c.statut <> 'annulee' ${this.zoneSql(actor)}
      GROUP BY t.libelle ORDER BY n DESC`;
    const total = rows.reduce((a, r) => a + Number(r.n), 0);
    const top = rows.slice(0, 5).map((r) => ({ libelle: r.libelle, count: Number(r.n) }));
    const autres = rows.slice(5).reduce((a, r) => a + Number(r.n), 0);
    if (autres) top.push({ libelle: 'Autres', count: autres });
    const contraventions = await this.prisma.contravention.count({
      where: { ...zoneScope(actor), dateHeure: { gte: dates.startOfMonth() }, statut: { not: 'annulee' } },
    });
    return { total: contraventions, items: top.map((t) => ({ ...t, pct: total ? Math.round((t.count / total) * 100) : 0 })) };
  }

  /** Répartition du mois par zone de Dakar. */
  @Get('by-zone')
  async byZone(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.$queryRaw<{ id: string; nom: string; n: bigint }[]>`
      SELECT z.id, z.nom, COUNT(c.id) AS n FROM "Zone" z
      LEFT JOIN "Contravention" c ON c."zoneId" = z.id AND c."dateHeure" >= ${dates.startOfMonth()} AND c.statut <> 'annulee'
      WHERE z."isDakar" = true ${zoneScope(actor).zoneId ? Prisma.sql`AND z.id = ${zoneScope(actor).zoneId}` : Prisma.empty}
      GROUP BY z.id, z.nom ORDER BY n DESC`;
    return rows.map((r) => ({ zoneId: r.id, zone: r.nom, count: Number(r.n) }));
  }

  /** Lieux les plus verbalisés du mois dans la région de Dakar. */
  @Get('hotspots')
  async hotspots(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.$queryRaw<{ lieu: string; zone: string; n: bigint; top: string }[]>`
      WITH m AS (
        SELECT c.id, c."lieuTexte" AS lieu, z.nom AS zone FROM "Contravention" c JOIN "Zone" z ON z.id = c."zoneId"
        WHERE c."dateHeure" >= ${dates.startOfMonth()} AND c."lieuTexte" IS NOT NULL AND c.canal = 'mobile'
          AND z."isDakar" = true ${this.zoneSql(actor)}
      )
      SELECT lieu, MIN(zone) AS zone, COUNT(*) AS n,
        (SELECT t.libelle FROM "ContraventionItem" i JOIN "InfractionType" t ON t.id = i."infractionTypeId"
          WHERE i."contraventionId" IN (SELECT id FROM m m2 WHERE m2.lieu = m.lieu)
          GROUP BY t.libelle ORDER BY COUNT(*) DESC LIMIT 1) AS top
      FROM m GROUP BY lieu ORDER BY n DESC LIMIT 5`;
    return rows.map((r, i) => ({
      rang: i + 1,
      lieu: r.lieu,
      zone: r.zone,
      infractionPrincipale: r.top,
      count: Number(r.n),
      niveau: i < 2 ? 'critique' : i < 4 ? 'eleve' : 'modere',
    }));
  }

  /** Infos de la sidebar : badge du registre et terminaux connectés. */
  @Get('status')
  async status(@CurrentActor() actor: Actor) {
    const today = await this.prisma.contravention.count({
      where: { ...zoneScope(actor), dateHeure: { gte: dates.startOfDay() } },
    });
    return { contraventionsAujourdhui: today, terminauxConnectes: await this.rt.officersOnline() };
  }
}

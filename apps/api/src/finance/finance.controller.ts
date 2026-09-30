import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/auth.decorators';
import { dates } from '../common/common.services';
import { officerName } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async cash(from: Date, to: Date) {
    const r = await this.prisma.payment.aggregate({
      where: { statut: 'confirme', dateHeure: { gte: from, lt: to } },
      _sum: { montant: true },
      _count: true,
    });
    return { montant: r._sum.montant ?? 0, transactions: r._count };
  }

  private async emitted(from: Date, to: Date) {
    const r = await this.prisma.contravention.aggregate({
      where: { dateHeure: { gte: from, lt: to }, statut: { not: 'annulee' } },
      _sum: { montantTotal: true },
    });
    return r._sum.montantTotal ?? 0;
  }

  async report(month?: string) {
    const now = new Date();
    const start = month ? new Date(`${month}-01T00:00:00`) : dates.startOfMonth(now);
    const end = dates.addMonths(start, 1);
    const prevStart = dates.addMonths(start, -1);
    const today = dates.startOfDay(now);

    const [cur, prev, emis, todayCash, reste, delay, byMode, byZone, topOfficers] = await Promise.all([
      this.cash(start, end),
      this.cash(prevStart, start),
      this.emitted(start, end),
      this.cash(today, dates.addDays(today, 1)),
      this.prisma.$queryRaw<{ s: bigint | null }[]>`
        SELECT SUM("montantTotal" - "montantPaye") AS s FROM "Contravention" WHERE statut IN ('impayee','partielle')`,
      this.prisma.$queryRaw<{ d: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (p."dateHeure" - c."dateHeure")) / 86400)::float AS d
        FROM "Payment" p JOIN "PaymentAllocation" a ON a."paymentId" = p.id JOIN "Contravention" c ON c.id = a."contraventionId"
        WHERE p.statut = 'confirme' AND p."dateHeure" >= ${start} AND p."dateHeure" < ${end}`,
      this.prisma.payment.groupBy({
        by: ['mode'],
        where: { statut: 'confirme', dateHeure: { gte: start, lt: end } },
        _sum: { montant: true },
      }),
      this.prisma.$queryRaw<{ id: string; nom: string; emis: bigint | null; encaisse: bigint | null }[]>`
        WITH c AS (
          SELECT "zoneId", SUM("montantTotal") AS emis FROM "Contravention"
          WHERE "dateHeure" >= ${start} AND "dateHeure" < ${end} AND statut <> 'annulee' GROUP BY 1
        ), p AS (
          SELECT c."zoneId", SUM(a.montant) AS s FROM "Payment" p
          JOIN "PaymentAllocation" a ON a."paymentId" = p.id JOIN "Contravention" c ON c.id = a."contraventionId"
          WHERE p.statut = 'confirme' AND p."dateHeure" >= ${start} AND p."dateHeure" < ${end} GROUP BY 1
        )
        SELECT z.id, z.nom, c.emis, p.s AS encaisse FROM "Zone" z
        LEFT JOIN c ON c."zoneId" = z.id LEFT JOIN p ON p."zoneId" = z.id
        WHERE z."isDakar" = true ORDER BY encaisse DESC NULLS LAST`,
      this.prisma.payment.groupBy({
        by: ['officerId'],
        where: { statut: 'confirme', dateHeure: { gte: start, lt: end }, officerId: { not: null } },
        _sum: { montant: true },
        orderBy: { _sum: { montant: 'desc' } },
        take: 5,
      }),
    ]);

    const officers = await this.prisma.officer.findMany({
      where: { id: { in: topOfficers.map((t) => t.officerId!) } },
      include: { zone: true },
    });

    // 12 derniers mois : émis vs encaissé (deux requêtes groupées par mois)
    const from12 = dates.addMonths(start, -11);
    const [emisM, cashM] = await Promise.all([
      this.prisma.$queryRaw<{ m: Date; s: bigint | null }[]>`
        SELECT date_trunc('month', "dateHeure") AS m, SUM("montantTotal") AS s FROM "Contravention"
        WHERE "dateHeure" >= ${from12} AND "dateHeure" < ${end} AND statut <> 'annulee' GROUP BY 1`,
      this.prisma.$queryRaw<{ m: Date; s: bigint | null }[]>`
        SELECT date_trunc('month', "dateHeure") AS m, SUM(montant) AS s FROM "Payment"
        WHERE "dateHeure" >= ${from12} AND "dateHeure" < ${end} AND statut = 'confirme' GROUP BY 1`,
    ]);
    const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = dates.addMonths(from12, i);
      return {
        mois: m.toISOString(),
        emis: Number(emisM.find((r) => sameMonth(new Date(r.m), m))?.s ?? 0),
        encaisse: Number(cashM.find((r) => sameMonth(new Date(r.m), m))?.s ?? 0),
      };
    });

    const mobile = byMode.filter((m) => m.mode === 'wave' || m.mode === 'orange_money').reduce((a, m) => a + (m._sum.montant ?? 0), 0);
    return {
      mois: start.toISOString(),
      encaisse: cur.montant,
      encaisseMoisPrecedent: prev.montant,
      emis,
      aujourdhui: todayCash.montant,
      transactions: cur.transactions,
      panierMoyen: cur.transactions ? Math.round(cur.montant / cur.transactions) : 0,
      tauxRecouvrement: emis ? Math.round((cur.montant / emis) * 100) : 0,
      resteARecouvrer: Number(reste[0].s ?? 0),
      delaiMoyenJours: Math.round((delay[0].d ?? 0) * 10) / 10,
      partMobileMoney: cur.montant ? Math.round((mobile / cur.montant) * 100) : 0,
      parMode: (['wave', 'orange_money', 'especes', 'carte'] as const).map((mode) => {
        const s = byMode.find((b) => b.mode === mode)?._sum.montant ?? 0;
        return { mode, montant: s, pct: cur.montant ? Math.round((s / cur.montant) * 100) : 0 };
      }),
      mensuel: months,
      parZone: byZone.map((z) => {
        const e = Number(z.emis ?? 0);
        const c = Number(z.encaisse ?? 0);
        return { zoneId: z.id, zone: z.nom, encaisse: c, taux: e ? Math.round((c / e) * 100) : 0 };
      }),
      topOfficiers: topOfficers.map((t) => {
        const o = officers.find((x) => x.id === t.officerId)!;
        return { id: o.id, nomComplet: officerName(o), zone: o.zone.nom, collecte: t._sum.montant ?? 0 };
      }),
    };
  }
}

@ApiTags('Trésor')
@ApiBearerAuth()
@Roles('tresorier')
@Controller('finance')
export class FinanceController {
  constructor(private svc: FinanceService) {}

  /** Rapport financier mensuel (page Paiements & Trésor). `month` au format AAAA-MM. */
  @Get('report')
  report(@Query('month') month?: string) {
    return this.svc.report(month);
  }
}

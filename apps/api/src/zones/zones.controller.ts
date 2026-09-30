import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';
import { Actor, Allow, CurrentActor, Roles } from '../common/auth.decorators';
import { AuditService, dates } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';

class AssignOfficersDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) officerIds: string[];
}

@ApiTags('Zones & commissariats')
@ApiBearerAuth()
@Controller('zones')
export class ZonesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Zones avec statistiques du mois : alimente la carte 3D et les cartes de zones. */
  @Allow('admin', 'officer') @Get()
  async list() {
    const start = dates.startOfMonth();
    const rows = await this.prisma.$queryRaw<
      { id: string; code: string; nom: string; commissariat: string; region: string; isDakar: boolean; lat: number; lng: number; officers: bigint; count: bigint; emis: bigint | null; encaisse: bigint | null }[]
    >`
      WITH c AS (
        SELECT "zoneId", COUNT(*) AS n, SUM("montantTotal") AS emis FROM "Contravention"
        WHERE "dateHeure" >= ${start} AND statut <> 'annulee' GROUP BY 1
      ), p AS (
        SELECT c."zoneId", SUM(a.montant) AS s FROM "Payment" p
        JOIN "PaymentAllocation" a ON a."paymentId" = p.id JOIN "Contravention" c ON c.id = a."contraventionId"
        WHERE p.statut = 'confirme' AND p."dateHeure" >= ${start} GROUP BY 1
      ), o AS (
        SELECT "zoneId", COUNT(*) AS n FROM "Officer" WHERE statut = 'actif' GROUP BY 1
      )
      SELECT z.*, COALESCE(o.n, 0) AS officers, COALESCE(c.n, 0) AS count, c.emis, p.s AS encaisse
      FROM "Zone" z LEFT JOIN c ON c."zoneId" = z.id LEFT JOIN p ON p."zoneId" = z.id LEFT JOIN o ON o."zoneId" = z.id
      ORDER BY z."isDakar" DESC, z.nom`;
    return rows.map((z) => {
      const emis = Number(z.emis ?? 0);
      const encaisse = Number(z.encaisse ?? 0);
      return {
        id: z.id,
        code: z.code,
        nom: z.nom,
        commissariat: z.commissariat,
        region: z.region,
        isDakar: z.isDakar,
        lat: z.lat,
        lng: z.lng,
        officiers: Number(z.officers),
        amendesMois: Number(z.count),
        encaisseMois: encaisse,
        tauxRecouvrement: emis ? Math.round((encaisse / emis) * 100) : 0,
      };
    });
  }

  /** Réaffecte des officiers à une zone. */
  @Roles('commandant') @Post(':id/assign')
  async assign(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: AssignOfficersDto) {
    const r = await this.prisma.officer.updateMany({ where: { id: { in: dto.officerIds } }, data: { zoneId: id } });
    await this.audit.log(actor, 'assign', 'zone', id, dto);
    return { ok: true, assigned: r.count };
  }
}

import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { Actor, Allow, CurrentActor, Roles } from '../common/auth.decorators';
import { AuditService, dates } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateInfractionTypeDto, InfractionTypeDto, UpdateInfractionTypeDto } from './dto/infraction-type.dto';

@ApiTags('Barème des infractions')
@ApiBearerAuth()
@Controller('infraction-types')
export class InfractionTypesController {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeGateway,
    private audit: AuditService,
  ) {}

  /**
   * Barème complet. Les terminaux mettent en cache la réponse et renvoient l'ETag
   * dans If-None-Match : HTTP 304 si rien n'a changé.
   */
  @Allow('admin', 'officer', 'user') @Get()
  @ApiHeader({ name: 'If-None-Match', required: false })
  @ApiOkResponse({ type: [InfractionTypeDto] })
  async list(@Headers('if-none-match') inm: string | undefined, @Res({ passthrough: true }) res: Response) {
    const rows = await this.prisma.infractionType.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, libelle: true, montantDefaut: true, icone: true, actif: true, updatedAt: true },
    });
    const etag = `"${createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 16)}"`;
    res.setHeader('ETag', etag);
    if (inm === etag) {
      res.status(304);
      return;
    }
    return rows;
  }

  /** Barème avec statistiques du mois (page Infractions & montants). */
  @Get('stats')
  async stats() {
    const since = dates.startOfMonth();
    const rows = await this.prisma.$queryRaw<{ id: string; emises: bigint; recettes: number | null }[]>`
      SELECT i."infractionTypeId" AS id, COUNT(*) AS emises,
             SUM(i."montant"::float * c."montantPaye" / NULLIF(c."montantTotal", 0)) AS recettes
      FROM "ContraventionItem" i JOIN "Contravention" c ON c.id = i."contraventionId"
      WHERE c."dateHeure" >= ${since} AND c.statut <> 'annulee'
      GROUP BY i."infractionTypeId"`;
    const by = new Map(rows.map((r) => [r.id, r]));
    const types = await this.prisma.infractionType.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } });
    return types.map((t) => ({
      ...t,
      emisesMois: Number(by.get(t.id)?.emises ?? 0),
      recettesMois: Math.round(by.get(t.id)?.recettes ?? 0),
    }));
  }

  @Roles() @Post()
  async create(@Body() dto: CreateInfractionTypeDto, @CurrentActor() actor: Actor) {
    const count = await this.prisma.infractionType.count({ where: { code: { startsWith: 'INF-' } } });
    let code = `INF-${String(count + 1).padStart(2, '0')}`;
    while (await this.prisma.infractionType.findUnique({ where: { code } })) {
      code = `INF-${String(Number(code.slice(4)) + 1).padStart(2, '0')}`;
    }
    const row = await this.prisma.infractionType.create({
      data: { code, libelle: dto.libelle.trim(), montantDefaut: dto.montantDefaut, icone: dto.icone ?? 'warning' },
    });
    await this.audit.log(actor, 'create', 'infraction_type', row.id, dto);
    this.broadcast();
    return row;
  }

  /** Le nouveau montant s'applique aux prochaines émissions ; les contraventions passées gardent leur montant figé. */
  @Roles() @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInfractionTypeDto, @CurrentActor() actor: Actor) {
    const before = await this.prisma.infractionType.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.infractionType.update({ where: { id }, data: dto as Prisma.InfractionTypeUpdateInput });
    await this.audit.log(actor, 'update', 'infraction_type', id, { before, after: dto });
    this.broadcast();
    return row;
  }

  /** Suppression logique : l'historique des contraventions reste intact. */
  @Roles() @Delete(':id')
  async remove(@Param('id') id: string, @CurrentActor() actor: Actor) {
    await this.prisma.infractionType.update({ where: { id }, data: { deletedAt: new Date(), actif: false } });
    await this.audit.log(actor, 'delete', 'infraction_type', id);
    this.broadcast();
    return { ok: true };
  }

  private broadcast() {
    const payload = { at: new Date().toISOString() };
    this.rt.toOfficers('infraction_types.updated', payload);
    this.rt.toAdmins('infraction_types.updated', payload);
  }
}

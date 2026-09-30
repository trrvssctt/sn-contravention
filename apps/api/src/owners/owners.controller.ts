import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { displayPhone } from '../auth/auth.service';
import { Actor, CurrentActor, Roles } from '../common/auth.decorators';
import { AuditService, fmtAmount, paginate, SmsService } from '../common/common.services';
import { contraventionInclude, toContraventionDto } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';
import { vehicleDocuments } from '../vehicles/vehicles.service';

class UpdateOwnerDto {
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsString() quartier?: string;
  @IsOptional() @IsString() adresse?: string;
  @IsOptional() @IsEmail() email?: string;
}

@ApiTags('Usagers (propriétaires)')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private audit: AuditService,
  ) {}

  /** Montant dû et nombre d'amendes pour un ensemble de propriétaires. */
  private async dues(ownerIds: string[]) {
    if (!ownerIds.length) return new Map<string, { amendes: number; du: number }>();
    const rows = await this.prisma.$queryRaw<{ ownerId: string; amendes: bigint; du: bigint | null }[]>`
      SELECT v."ownerId", COUNT(c.id) AS amendes,
             SUM(CASE WHEN c.statut IN ('impayee','partielle') THEN c."montantTotal" - c."montantPaye" ELSE 0 END) AS du
      FROM "Vehicle" v JOIN "Contravention" c ON c."vehicleId" = v.id
      WHERE v."ownerId" IN (${Prisma.join(ownerIds)})
      GROUP BY v."ownerId"`;
    return new Map(rows.map((r) => [r.ownerId, { amendes: Number(r.amendes), du: Number(r.du ?? 0) }]));
  }

  @Get()
  async list(@Query() q: { q?: string; page?: string; per_page?: string }) {
    const { page, perPage, skip, take } = paginate(q.page, q.per_page);
    const s = q.q?.trim();
    const where: Prisma.OwnerWhereInput = s
      ? {
          OR: [
            { nom: { contains: s, mode: 'insensitive' } },
            { prenom: { contains: s, mode: 'insensitive' } },
            { cni: { contains: s } },
            { telephone: { contains: s } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.owner.findMany({
        where,
        include: { account: { select: { id: true } }, _count: { select: { vehicles: true } } },
        orderBy: { nom: 'asc' },
        skip,
        take,
      }),
      this.prisma.owner.count({ where }),
    ]);
    const dues = await this.dues(rows.map((r) => r.id));
    return {
      data: rows.map((o) => ({
        id: o.id,
        nomComplet: `${o.prenom} ${o.nom}`,
        cni: o.cni,
        telephone: o.telephone,
        quartier: o.quartier,
        vehicules: o._count.vehicles,
        amendes: dues.get(o.id)?.amendes ?? 0,
        du: dues.get(o.id)?.du ?? 0,
        compteApp: !!o.account,
      })),
      total,
      page,
      perPage,
    };
  }

  @Get('stats')
  async stats() {
    const [owners, accounts, agg] = await Promise.all([
      this.prisma.owner.count(),
      this.prisma.userAccount.count(),
      this.prisma.$queryRaw<{ debiteurs: bigint; du: bigint | null }[]>`
        SELECT COUNT(DISTINCT v."ownerId") AS debiteurs, SUM(c."montantTotal" - c."montantPaye") AS du
        FROM "Contravention" c JOIN "Vehicle" v ON v.id = c."vehicleId"
        WHERE c.statut IN ('impayee','partielle')`,
    ]);
    return { proprietaires: owners, comptesApp: accounts, avecImpayes: Number(agg[0].debiteurs), montantDu: Number(agg[0].du ?? 0) };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const o = await this.prisma.owner.findUnique({ where: { id }, include: { account: true, vehicles: true } });
    if (!o) throw new NotFoundException('Usager introuvable');
    const fines = await this.prisma.contravention.findMany({
      where: { vehicle: { ownerId: id } },
      include: contraventionInclude,
      orderBy: { dateHeure: 'desc' },
      take: 20,
    });
    const due = await this.dues([id]);
    return {
      id: o.id,
      nomComplet: `${o.prenom} ${o.nom}`,
      cni: o.cni,
      telephone: o.telephone,
      quartier: o.quartier,
      adresse: o.adresse,
      email: o.email,
      compteApp: !!o.account,
      du: due.get(id)?.du ?? 0,
      amendes: due.get(id)?.amendes ?? 0,
      vehicules: o.vehicles.map((v) => ({
        plaque: v.plaque,
        libelle: `${v.marque} ${v.modele}`,
        type: v.type,
        documentsOk: vehicleDocuments(v).every((d) => d.ok),
      })),
      contraventions: fines.map(toContraventionDto),
    };
  }

  @Roles('commandant', 'tresorier') @Patch(':id')
  async update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: UpdateOwnerDto) {
    const data = { ...dto, email: dto.email || undefined, telephone: dto.telephone ? displayPhone(dto.telephone) : undefined };
    await this.prisma.owner.update({ where: { id }, data });
    await this.audit.log(actor, 'update', 'owner', id, dto);
    return { ok: true };
  }

  /** Relance SMS individuelle. */
  @Roles('commandant', 'tresorier') @Post(':id/remind') @HttpCode(200)
  async remind(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const o = await this.prisma.owner.findUniqueOrThrow({ where: { id } });
    const du = (await this.dues([id])).get(id)?.du ?? 0;
    await this.sms.send(
      o.telephone,
      `SEN Contraventions : vous avez ${fmtAmount(du)} FCFA d'amendes impayées. Réglez-les via Wave ou Orange Money.`,
    );
    await this.audit.log(actor, 'remind', 'owner', id);
    return { ok: true, telephone: o.telephone };
  }

  /**
   * Relance SMS de tous les débiteurs, envoyée en tâche de fond.
   * (Passer à une file BullMQ/Redis quand le volume l'exigera.)
   */
  @Roles('commandant', 'tresorier') @Post('remind-all') @HttpCode(202)
  async remindAll(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.$queryRaw<{ telephone: string; du: bigint }[]>`
      SELECT o.telephone, SUM(c."montantTotal" - c."montantPaye") AS du
      FROM "Contravention" c JOIN "Vehicle" v ON v.id = c."vehicleId" JOIN "Owner" o ON o.id = v."ownerId"
      WHERE c.statut IN ('impayee','partielle') GROUP BY o.id, o.telephone`;
    setImmediate(async () => {
      for (const r of rows) {
        await this.sms.send(r.telephone, `SEN Contraventions : ${fmtAmount(Number(r.du))} FCFA d'amendes impayées. Payez via Wave ou Orange Money.`);
      }
    });
    await this.audit.log(actor, 'remind_all', 'owner', undefined, { count: rows.length });
    return { queued: rows.length };
  }
}

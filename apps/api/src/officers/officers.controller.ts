import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OfficerStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Actor, CurrentActor, Roles, zoneScope } from '../common/auth.decorators';
import { AuditService, dates, SmsService } from '../common/common.services';
import { contraventionInclude, officerName, toContraventionDto } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateOfficerDto, GRADES, SuspendOfficerDto, UpdateOfficerDto } from './dto/officer.dto';

@ApiTags('Officiers')
@ApiBearerAuth()
@Roles('commandant', 'superviseur')
@Controller('officers')
export class OfficersController {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeGateway,
    private sms: SmsService,
    private audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: Actor,
    @Query() q: { q?: string; statut?: string; zone_id?: string },
  ) {
    const where: Prisma.OfficerWhereInput = { ...zoneScope(actor) };
    if (q.statut && q.statut !== 'all') where.statut = q.statut as OfficerStatus;
    if (q.zone_id && q.zone_id !== 'all' && !where.zoneId) where.zoneId = q.zone_id;
    const s = q.q?.trim();
    if (s) {
      where.OR = [
        { nom: { contains: s, mode: 'insensitive' } },
        { prenom: { contains: s, mode: 'insensitive' } },
        { matricule: { contains: s, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.officer.findMany({ where, include: { zone: true }, orderBy: [{ statut: 'asc' }, { nom: 'asc' }] });
    const ids = rows.map((r) => r.id);
    const [counts, collected] = await Promise.all([
      this.prisma.contravention.groupBy({ by: ['officerId'], where: { officerId: { in: ids } }, _count: true }),
      this.prisma.payment.groupBy({ by: ['officerId'], where: { officerId: { in: ids }, statut: 'confirme' }, _sum: { montant: true } }),
    ]);
    const cMap = new Map(counts.map((c) => [c.officerId, c._count]));
    const pMap = new Map(collected.map((c) => [c.officerId, c._sum.montant ?? 0]));
    const data = rows
      .map((o) => ({
        id: o.id,
        nomComplet: officerName(o),
        prenom: o.prenom,
        nom: o.nom,
        grade: o.grade,
        matricule: o.matricule,
        email: o.email,
        telephone: o.telephone,
        zoneId: o.zoneId,
        zone: o.zone.nom,
        statut: o.statut,
        amendes: cMap.get(o.id) ?? 0,
        collecte: pMap.get(o.id) ?? 0,
        suspensionMotif: o.suspensionMotif,
        lastSeenAt: o.lastSeenAt,
      }))
      .sort((a, b) => b.amendes - a.amendes);
    return { data, total: data.length };
  }

  @Get('stats')
  async stats(@CurrentActor() actor: Actor) {
    const scope = zoneScope(actor);
    const month = dates.startOfMonth();
    const [total, actifs, suspendus, monthCount] = await Promise.all([
      this.prisma.officer.count({ where: scope }),
      this.prisma.officer.count({ where: { ...scope, statut: 'actif' } }),
      this.prisma.officer.count({ where: { ...scope, statut: 'suspendu' } }),
      this.prisma.contravention.count({ where: { ...scope, dateHeure: { gte: month }, officerId: { not: null } } }),
    ]);
    const days = Math.max(1, new Date().getDate());
    return {
      total,
      actifs,
      suspendus,
      grades: GRADES,
      amendesParAgentJour: actifs ? Math.round((monthCount / actifs / days) * 10) / 10 : 0,
      enLigne: await this.rt.officersOnline(),
    };
  }

  @Get(':id')
  async detail(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const o = await this.prisma.officer.findUnique({ where: { id }, include: { zone: true } });
    if (!o) throw new NotFoundException('Officier introuvable');
    this.assertZone(actor, o.zoneId);
    const since = dates.startOfMonth(dates.addMonths(new Date(), -8));
    const [count, collected, pays, recent, monthly] = await Promise.all([
      this.prisma.contravention.count({ where: { officerId: id } }),
      this.prisma.payment.aggregate({ where: { officerId: id, statut: 'confirme' }, _sum: { montant: true } }),
      this.prisma.payment.count({ where: { officerId: id, statut: 'confirme' } }),
      this.prisma.contravention.findMany({ where: { officerId: id }, include: contraventionInclude, orderBy: { dateHeure: 'desc' }, take: 5 }),
      this.prisma.$queryRaw<{ m: Date; n: bigint }[]>`
        SELECT date_trunc('month', "dateHeure") AS m, COUNT(*) AS n FROM "Contravention"
        WHERE "officerId" = ${id} AND "dateHeure" >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);
    const activity = Array.from({ length: 9 }, (_, i) => {
      const m = dates.addMonths(dates.startOfMonth(), i - 8);
      const row = monthly.find((r) => new Date(r.m).getMonth() === m.getMonth() && new Date(r.m).getFullYear() === m.getFullYear());
      return { mois: m.toISOString(), count: Number(row?.n ?? 0) };
    });
    const { passwordHash, tokenVersion, ...rest } = o;
    return {
      ...rest,
      nomComplet: officerName(o),
      zoneNom: o.zone.nom,
      amendes: count,
      collecte: collected._sum.montant ?? 0,
      paiements: pays,
      activite: activity,
      recentes: recent.map(toContraventionDto),
    };
  }

  @Roles('commandant') @Post()
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateOfficerDto) {
    this.assertZone(actor, dto.zoneId);
    const matricule = dto.matricule.trim().toUpperCase();
    if (await this.prisma.officer.findUnique({ where: { matricule } })) throw new ConflictException(`Le matricule ${matricule} existe déjà`);
    const password = dto.password ?? randomBytes(6).toString('base64url');
    const o = await this.prisma.officer.create({
      data: {
        prenom: dto.prenom.trim(),
        nom: dto.nom.trim(),
        matricule,
        grade: dto.grade,
        zoneId: dto.zoneId,
        telephone: dto.telephone,
        email: dto.email,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    if (dto.telephone) {
      await this.sms.send(dto.telephone, `SEN Contraventions : votre compte agent est actif. Matricule ${matricule}, mot de passe ${password}.`);
    }
    await this.audit.log(actor, 'create', 'officer', o.id, { matricule });
    return { id: o.id, nomComplet: officerName(o) };
  }

  @Roles('commandant') @Patch(':id')
  async update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: UpdateOfficerDto) {
    const o = await this.prisma.officer.findUniqueOrThrow({ where: { id } });
    this.assertZone(actor, o.zoneId);
    if (dto.zoneId) this.assertZone(actor, dto.zoneId);
    await this.prisma.officer.update({ where: { id }, data: dto });
    await this.audit.log(actor, 'update', 'officer', id, dto);
    return { ok: true };
  }

  /** Suspend l'agent : révoque ses jetons et verrouille son terminal (HTTP 423 à la prochaine requête). */
  @Roles('commandant') @Post(':id/suspend')
  async suspend(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: SuspendOfficerDto) {
    const o = await this.prisma.officer.findUniqueOrThrow({ where: { id } });
    this.assertZone(actor, o.zoneId);
    const motif = dto.motif.trim();
    await this.prisma.officer.update({
      where: { id },
      data: { statut: 'suspendu', tokenVersion: { increment: 1 }, suspensionMotif: motif, suspendedAt: new Date(), suspendedBy: actor.name },
    });
    await this.rt.kickOfficer(id);
    this.rt.toAdmins('officer.suspended', { id }, o.zoneId);
    await this.audit.log(actor, 'suspend', 'officer', id, { motif });
    return { ok: true, statut: 'suspendu' };
  }

  @Roles('commandant') @Post(':id/reactivate')
  async reactivate(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const o = await this.prisma.officer.findUniqueOrThrow({ where: { id } });
    this.assertZone(actor, o.zoneId);
    await this.prisma.officer.update({ where: { id }, data: { statut: 'actif', suspensionMotif: null, suspendedAt: null, suspendedBy: null } });
    await this.audit.log(actor, 'reactivate', 'officer', id, { motifPrecedent: o.suspensionMotif });
    return { ok: true, statut: 'actif' };
  }

  @Roles('commandant') @Post(':id/reset-password')
  async resetPassword(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const o = await this.prisma.officer.findUniqueOrThrow({ where: { id } });
    this.assertZone(actor, o.zoneId);
    if (!o.telephone) throw new BadRequestException("Aucun téléphone enregistré pour l'envoi du mot de passe");
    const password = randomBytes(6).toString('base64url');
    await this.prisma.officer.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } },
    });
    await this.sms.send(o.telephone, `SEN Contraventions : nouveau mot de passe temporaire ${password}.`);
    await this.audit.log(actor, 'reset_password', 'officer', id);
    return { ok: true };
  }

  private assertZone(actor: Actor, zoneId: string) {
    const scope = zoneScope(actor);
    if (scope.zoneId && scope.zoneId !== zoneId) throw new ForbiddenException('Hors de votre zone');
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Actor, Allow, CurrentActor } from '../common/auth.decorators';
import { AuditService, dates, paginate } from '../common/common.services';
import { contraventionInclude, toContraventionDto } from '../contraventions/contraventions.service';
import { ContraventionDto } from '../contraventions/dto/contravention.dto';
import { toPaymentDto } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto, VehicleDetailDto } from '../vehicles/dto/vehicle.dto';
import { VehiclesService, vehicleDocuments } from '../vehicles/vehicles.service';

class SecurityDto {
  @IsOptional() @IsBoolean() twoFactor?: boolean;
  @IsOptional() @IsBoolean() biometric?: boolean;
  @IsOptional() @IsIn(['fr', 'wo']) lang?: 'fr' | 'wo';
}

class UserPasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

/** Endpoints propres à l'Espace Usager (Flutter). Tout est limité aux véhicules du compte. */
@ApiTags('Espace Usager')
@ApiBearerAuth()
@Allow('user')
@Controller('me')
export class UserAppController {
  constructor(
    private prisma: PrismaService,
    private vehicles: VehiclesService,
    private audit: AuditService,
  ) {}

  private async ownerId(actor: Actor) {
    const u = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id } });
    return u.ownerId;
  }

  /** Écran d'accueil : total dû, véhicules, amendes récentes. */
  @Get('summary')
  async summary(@CurrentActor() actor: Actor) {
    const ownerId = await this.ownerId(actor);
    const [owner, vehicles, fines, unread] = await Promise.all([
      this.prisma.owner.findUniqueOrThrow({ where: { id: ownerId } }),
      this.prisma.vehicle.findMany({ where: { ownerId }, include: { contraventions: { select: { statut: true } } } }),
      this.prisma.contravention.findMany({
        where: { vehicle: { ownerId } },
        include: contraventionInclude,
        orderBy: { dateHeure: 'desc' },
        take: 3,
      }),
      this.prisma.notification.count({ where: { destinataireType: 'user', destinataireId: actor.id, lu: false } }),
    ]);
    const due = await this.prisma.contravention.aggregate({
      where: { vehicle: { ownerId }, statut: { in: ['impayee', 'partielle'] } },
      _sum: { montantTotal: true, montantPaye: true },
      _count: true,
    });
    return {
      proprietaire: { prenom: owner.prenom, nom: owner.nom },
      totalDu: (due._sum.montantTotal ?? 0) - (due._sum.montantPaye ?? 0),
      amendesImpayees: due._count,
      notificationsNonLues: unread,
      vehicules: vehicles.map((v) => ({
        plaque: v.plaque,
        libelle: `${v.marque} ${v.modele}`,
        detail: [v.couleur, v.annee].filter(Boolean).join(' · '),
        type: v.type,
        documentsOk: vehicleDocuments(v).every((d) => d.ok),
        amendesImpayees: v.contraventions.filter((c) => c.statut === 'impayee' || c.statut === 'partielle').length,
      })),
      recentes: fines.map(toContraventionDto),
    };
  }

  @Get('vehicles')
  async myVehicles(@CurrentActor() actor: Actor) {
    const ownerId = await this.ownerId(actor);
    const plates = await this.prisma.vehicle.findMany({ where: { ownerId }, select: { plaque: true }, orderBy: { createdAt: 'asc' } });
    return Promise.all(plates.map((p) => this.vehicles.detail(p.plaque)));
  }

  @Get('vehicles/:plate')
  @ApiOkResponse({ type: VehicleDetailDto })
  async myVehicle(@CurrentActor() actor: Actor, @Param('plate') plate: string) {
    const d = await this.vehicles.detail(plate);
    if (d.proprietaire.id !== (await this.ownerId(actor))) throw new ForbiddenException('Ce véhicule n\'est pas lié à votre compte');
    return d;
  }

  /** Ajout d'un véhicule : s'il existe au fichier national, il doit déjà appartenir à l'usager. */
  @Post('vehicles')
  @ApiOkResponse({ type: VehicleDetailDto })
  async addVehicle(@CurrentActor() actor: Actor, @Body() dto: CreateVehicleDto) {
    const ownerId = await this.ownerId(actor);
    const existing = await this.prisma.vehicle.findUnique({ where: { plaque: dto.plaque.trim().toUpperCase() } });
    if (existing) {
      if (existing.ownerId !== ownerId) throw new ConflictException('Ce véhicule est enregistré au nom d\'un autre propriétaire');
      return this.vehicles.detail(existing.plaque);
    }
    return this.vehicles.create(actor, { ...dto, ownerId, owner: undefined });
  }

  @Get('fines')
  async fines(@CurrentActor() actor: Actor, @Query() q: { statut?: string; page?: string; per_page?: string }) {
    const ownerId = await this.ownerId(actor);
    const { page, perPage, skip, take } = paginate(q.page, q.per_page);
    const where = {
      vehicle: { ownerId },
      ...(q.statut === 'dues' ? { statut: { in: ['impayee' as const, 'partielle' as const] } } : {}),
      ...(q.statut === 'payee' ? { statut: 'payee' as const } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.contravention.findMany({ where, include: contraventionInclude, orderBy: { dateHeure: 'desc' }, skip, take }),
      this.prisma.contravention.count({ where }),
    ]);
    return { data: rows.map(toContraventionDto), total, page, perPage };
  }

  @Get('fines/:ref')
  @ApiOkResponse({ type: ContraventionDto })
  async fine(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    const c = await this.prisma.contravention.findFirst({
      where: { OR: [{ id: ref }, { numero: ref }], vehicle: { ownerId: await this.ownerId(actor) } },
      include: contraventionInclude,
    });
    if (!c) throw new NotFoundException('Amende introuvable');
    return toContraventionDto(c);
  }

  /** Écran Finances : total payé par mois (6 derniers mois) et reçus. */
  @Get('finances')
  async finances(@CurrentActor() actor: Actor) {
    const ownerId = await this.ownerId(actor);
    const since = dates.addMonths(dates.startOfMonth(), -5);
    const payments = await this.prisma.payment.findMany({
      where: { ownerId, statut: 'confirme' },
      include: { officer: true, allocations: { include: { contravention: { include: { vehicle: true } } } } },
      orderBy: { dateHeure: 'desc' },
    });
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = dates.addMonths(since, i);
      const n = dates.addMonths(m, 1);
      const total = payments.filter((p) => p.dateHeure >= m && p.dateHeure < n).reduce((a, p) => a + p.montant, 0);
      return { mois: m.toISOString(), montant: total };
    });
    return {
      totalPaye: payments.reduce((a, p) => a + p.montant, 0),
      mensuel: months,
      recus: payments.slice(0, 20).map(toPaymentDto),
    };
  }

  @Patch('security')
  async security(@CurrentActor() actor: Actor, @Body() dto: SecurityDto) {
    await this.prisma.userAccount.update({ where: { id: actor.id }, data: dto });
    await this.audit.log(actor, 'update', 'security', actor.id, dto);
    return { ok: true };
  }

  @Post('password') @HttpCode(200)
  async password(@CurrentActor() actor: Actor, @Body() dto: UserPasswordDto) {
    const u = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(dto.currentPassword, u.passwordHash))) throw new BadRequestException('Mot de passe actuel incorrect');
    await this.prisma.userAccount.update({
      where: { id: actor.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), tokenVersion: { increment: 1 } },
    });
    return { ok: true, reconnect: true };
  }
}

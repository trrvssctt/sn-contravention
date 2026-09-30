import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcryptjs';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Actor, Allow, CurrentActor } from '../common/auth.decorators';
import { dates } from '../common/common.services';
import { contraventionInclude, officerName, toContraventionDto } from '../contraventions/contraventions.service';
import { PrismaService } from '../prisma/prisma.service';

class UpdateOfficerPrefsDto {
  /** Langue de l'interface : français ou wolof */
  @IsOptional() @IsIn(['fr', 'wo']) lang?: 'fr' | 'wo';
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

const DAILY_TARGET = 15;

/** Endpoints propres à l'App Officier (Flutter). */
@ApiTags('App Officier')
@ApiBearerAuth()
@Allow('officer')
@Controller('officer/me')
export class OfficerAppController {
  constructor(private prisma: PrismaService) {}

  /** Écran d'accueil : stats du jour, objectif et dernières contraventions. */
  @Get('dashboard')
  async dashboard(@CurrentActor() actor: Actor) {
    const today = dates.startOfDay();
    const [o, count, cash, recent, unread] = await Promise.all([
      this.prisma.officer.findUniqueOrThrow({ where: { id: actor.id }, include: { zone: true } }),
      this.prisma.contravention.count({ where: { officerId: actor.id, dateHeure: { gte: today } } }),
      this.prisma.payment.aggregate({
        where: { officerId: actor.id, statut: 'confirme', dateHeure: { gte: today } },
        _sum: { montant: true },
        _count: true,
      }),
      this.prisma.contravention.findMany({
        where: { officerId: actor.id },
        include: contraventionInclude,
        orderBy: { dateHeure: 'desc' },
        take: 3,
      }),
      this.prisma.notification.count({ where: { destinataireType: 'officer', destinataireId: actor.id, lu: false } }),
    ]);
    return {
      officier: {
        id: o.id,
        nomComplet: officerName(o),
        grade: o.grade,
        matricule: o.matricule,
        zone: o.zone.nom,
        lang: o.lang,
      },
      aujourdhui: {
        contraventions: count,
        objectif: DAILY_TARGET,
        encaisse: cash._sum.montant ?? 0,
        paiements: cash._count,
      },
      notificationsNonLues: unread,
      recentes: recent.map(toContraventionDto),
    };
  }

  @Patch()
  async prefs(@CurrentActor() actor: Actor, @Body() dto: UpdateOfficerPrefsDto) {
    await this.prisma.officer.update({ where: { id: actor.id }, data: dto });
    return { ok: true };
  }

  @Post('password') @HttpCode(200)
  async password(@CurrentActor() actor: Actor, @Body() dto: ChangePasswordDto) {
    const o = await this.prisma.officer.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(dto.currentPassword, o.passwordHash))) throw new BadRequestException('Mot de passe actuel incorrect');
    await this.prisma.officer.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) } });
    return { ok: true };
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Allow, CurrentActor, Roles, zoneScope } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentDto, MarkPaidDto } from '../payments/dto/payment.dto';
import { PaymentsService } from '../payments/payments.service';
import { ContraventionsService } from './contraventions.service';
import {
  ContraventionDto,
  ContraventionPageDto,
  CreateContraventionDto,
  ListContraventionsQuery,
  UpdateContraventionDto,
} from './dto/contravention.dto';

@ApiTags('Contraventions')
@ApiBearerAuth()
@Controller('contraventions')
export class ContraventionsController {
  constructor(
    private svc: ContraventionsService,
    private payments: PaymentsService,
    private prisma: PrismaService,
  ) {}

  /** Registre filtrable. Un officier ne voit que ses propres contraventions ; un commandant sa zone. */
  @Allow('admin', 'officer') @Get()
  @ApiOkResponse({ type: ContraventionPageDto })
  list(@CurrentActor() actor: Actor, @Query() q: ListContraventionsQuery) {
    return this.svc.list(actor, q);
  }

  @Get('counts')
  counts(@CurrentActor() actor: Actor) {
    return this.svc.counts(actor);
  }

  @Allow('admin', 'officer') @Get(':id')
  @ApiOkResponse({ type: ContraventionDto })
  get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.svc.get(actor, id);
  }

  /**
   * Émission d'une contravention. Mobile : l'officier connecté est le verbalisateur,
   * `clientUuid` rend l'appel idempotent pour la synchronisation hors-ligne.
   * Le propriétaire reçoit un SMS (modèle défini dans Admin › Paramètres).
   */
  @Allow('admin', 'officer') @Roles('commandant') @Post()
  @ApiOkResponse({ type: ContraventionDto })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateContraventionDto) {
    return this.svc.create(actor, dto);
  }

  @Roles('commandant') @Patch(':id')
  update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: UpdateContraventionDto) {
    return this.svc.update(actor, id, dto);
  }

  @Roles('commandant') @Post(':id/cancel')
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: { motif?: string }) {
    return this.svc.cancel(actor, id, body?.motif);
  }

  /** Enregistre un paiement du reste dû (guichet / régularisation administrative). */
  @Roles('commandant', 'tresorier') @Post(':id/mark-paid')
  @ApiOkResponse({ type: PaymentDto })
  async markPaid(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() dto: MarkPaidDto) {
    const c = await this.prisma.contravention.findUniqueOrThrow({ where: { id } });
    const scope = zoneScope(actor);
    if (scope.zoneId && scope.zoneId !== c.zoneId) throw new ForbiddenException('Hors de votre zone');
    return this.payments.record(actor, { contraventions: [id], mode: dto.mode ?? 'especes', referenceExterne: dto.referenceExterne });
  }
}

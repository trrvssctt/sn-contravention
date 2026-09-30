import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Actor, Allow, CurrentActor, Public, Roles } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntentDto, PaymentDto, PaymentIntentDto, RecordPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Paiements')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private svc: PaymentsService,
    private prisma: PrismaService,
  ) {}

  /** Journal des paiements confirmés (Trésor). Un officier ne voit que ses encaissements. */
  @Allow('admin', 'officer') @Roles('tresorier') @Get('payments')
  list(@CurrentActor() actor: Actor, @Query() q: { mode?: string; page?: string; per_page?: string; from?: string; to?: string }) {
    return this.svc.list(q, actor);
  }

  /** Encaissement terrain par l'officier (espèces, Wave, OM, carte). */
  @Allow('officer') @Post('payments')
  @ApiOkResponse({ type: PaymentDto })
  record(@CurrentActor() actor: Actor, @Body() dto: RecordPaymentDto) {
    return this.svc.record(actor, dto);
  }

  /** Reçu RCU-… (usager : uniquement ses propres reçus). */
  @Allow('admin', 'officer', 'user') @Get('payments/:ref')
  @ApiOkResponse({ type: PaymentDto })
  async receipt(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    const p = await this.svc.receipt(ref);
    if (actor.kind === 'user') {
      const account = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: actor.id } });
      const pay = await this.prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
      if (pay.ownerId !== account.ownerId) throw new ForbiddenException();
    }
    return p;
  }

  /**
   * Espace Usager : crée une intention de paiement Wave / Orange Money pour une ou plusieurs amendes.
   * Ouvrir `checkoutUrl`, puis suivre le statut via GET /payments/intents/:id ou l'événement `payment.confirmed`.
   */
  @Allow('user') @Post('payments/intents')
  @ApiOkResponse({ type: PaymentIntentDto })
  createIntent(@CurrentActor() actor: Actor, @Body() dto: CreateIntentDto) {
    return this.svc.createIntent(actor, dto.contraventions, dto.provider);
  }

  @Allow('user', 'admin') @Get('payments/intents/:id')
  @ApiOkResponse({ type: PaymentIntentDto })
  getIntent(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.svc.getIntent(actor, id);
  }

  /** Webhook Wave. Signature HMAC-SHA256 du corps brut dans l'en-tête `x-signature`. */
  @Public() @Post('webhooks/wave') @HttpCode(200) @ApiExcludeEndpoint()
  wave(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-signature') sig: string, @Body() body: WebhookBody) {
    this.verify(req.rawBody, sig, process.env.WAVE_WEBHOOK_SECRET!);
    return this.svc.settleIntent(body.client_reference, body.payment_status === 'succeeded', body.transaction_id);
  }

  /** Webhook Orange Money. */
  @Public() @Post('webhooks/orange-money') @HttpCode(200) @ApiExcludeEndpoint()
  orange(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-signature') sig: string, @Body() body: WebhookBody) {
    this.verify(req.rawBody, sig, process.env.ORANGE_WEBHOOK_SECRET!);
    return this.svc.settleIntent(body.client_reference, body.payment_status === 'succeeded', body.transaction_id);
  }

  private verify(raw: Buffer | undefined, sig: string | undefined, secret: string) {
    const expected = createHmac('sha256', secret).update(raw ?? Buffer.alloc(0)).digest('hex');
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new UnauthorizedException('Signature invalide');
    }
  }
}

interface WebhookBody {
  client_reference: string;
  payment_status: 'succeeded' | 'failed';
  transaction_id?: string;
}

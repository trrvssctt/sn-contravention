import { Controller, Get, Header, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth.decorators';
import { fmtAmount } from '../common/common.services';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Simulateur d'opérateur mobile money (hors production).
 * Permet à l'équipe Flutter de tester le parcours de paiement de bout en bout
 * sans compte marchand Wave / Orange Money.
 */
@ApiTags('Dev · simulateur opérateur')
@Controller('dev')
export class DevController {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  @Public() @Get('checkout/:id') @Header('Content-Type', 'text/html; charset=utf-8')
  async checkout(@Param('id') id: string) {
    this.guard();
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException();
    const wave = p.mode === 'wave';
    const color = wave ? '#1DC8F0' : '#FF7900';
    const done = p.statut !== 'en_attente';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${wave ? 'Wave' : 'Orange Money'} · simulateur</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F0F5F1;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border-radius:22px;padding:28px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 50px -24px rgba(12,40,25,.4)}
.l{width:64px;height:64px;border-radius:18px;background:${color};margin:0 auto 14px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px}
.a{font-size:34px;font-weight:800;margin:6px 0}.s{color:#6E8378;font-weight:600;font-size:14px}
button{width:100%;height:52px;border:0;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;margin-top:12px}
.ok{background:${color};color:#fff}.ko{background:#FDEDEE;color:#C93642}</style></head><body><div class="c">
<div class="l">${wave ? 'W' : 'OM'}</div><div class="s">SEN Contraventions · Trésor public</div>
<div class="a">${fmtAmount(p.montant)} F</div><div class="s">${done ? 'Statut : ' + p.statut : 'Simulateur de paiement (environnement de développement)'}</div>
${done ? '' : `<form method="post" action="${id}/result?success=1"><button class="ok">Confirmer le paiement</button></form>
<form method="post" action="${id}/result?success=0"><button class="ko">Refuser</button></form>`}
</div></body></html>`;
  }

  /** Équivaut au webhook opérateur (succès ou échec). */
  @Public() @Post('checkout/:id/result')
  async result(@Param('id') id: string, @Query('success') success: string, @Res() res: Response) {
    this.guard();
    await this.payments.settleIntent(id, success === '1', `SIM-${Date.now()}`);
    res.redirect(303, `../${id}`);
  }

  /** Désactivé en production, sauf PAYMENT_SIMULATOR=true (en attendant les comptes marchands). */
  private guard() {
    if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_SIMULATOR !== 'true') throw new NotFoundException();
  }
}

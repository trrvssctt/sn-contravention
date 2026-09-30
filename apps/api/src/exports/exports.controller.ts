import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Actor, CurrentActor, Roles } from '../common/auth.decorators';
import { fmtAmount, SettingsStore } from '../common/common.services';
import { contraventionInclude, ContraventionsService, toContraventionDto } from '../contraventions/contraventions.service';
import { ListContraventionsQuery } from '../contraventions/dto/contravention.dto';
import { FinanceService } from '../finance/finance.controller';
import { PrismaService } from '../prisma/prisma.service';

const STATUT = { impayee: 'Impayée', partielle: 'Partielle', payee: 'Payée', annulee: 'Annulée' } as const;
const MODE = { wave: 'Wave', orange_money: 'Orange Money', especes: 'Espèces', carte: 'Carte bancaire' } as const;
const GREEN = '#0E8C57';

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(
    private prisma: PrismaService,
    private contraventions: ContraventionsService,
    private finance: FinanceService,
    private settings: SettingsStore,
  ) {}

  private async rows(actor: Actor, q: ListContraventionsQuery, max: number) {
    const rows = await this.prisma.contravention.findMany({
      where: this.contraventions.where(actor, q),
      include: contraventionInclude,
      orderBy: { dateHeure: 'desc' },
      take: max,
    });
    return rows.map(toContraventionDto);
  }

  @Get('contraventions.xlsx')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async xlsx(@CurrentActor() actor: Actor, @Query() q: ListContraventionsQuery, @Res() res: Response) {
    const data = await this.rows(actor, q, 50_000);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SEN Contraventions';
    const ws = wb.addWorksheet('Contraventions', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'N°', key: 'numero', width: 18 },
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Plaque', key: 'plaque', width: 14 },
      { header: 'Véhicule', key: 'vehicule', width: 20 },
      { header: 'Propriétaire', key: 'proprietaire', width: 22 },
      { header: 'Infraction', key: 'infraction', width: 30 },
      { header: 'Officier', key: 'officier', width: 22 },
      { header: 'Zone', key: 'zone', width: 18 },
      { header: 'Lieu', key: 'lieu', width: 26 },
      { header: 'Montant (F)', key: 'montant', width: 13 },
      { header: 'Payé (F)', key: 'paye', width: 13 },
      { header: 'Statut', key: 'statut', width: 12 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A86E' } };
    for (const c of data) {
      ws.addRow({
        numero: c.numero,
        date: c.dateHeure,
        plaque: c.plaque,
        vehicule: c.vehicule,
        proprietaire: c.proprietaire,
        infraction: c.infraction,
        officier: c.officier ?? 'Administration',
        zone: c.zone,
        lieu: c.lieuTexte ?? '',
        montant: c.montantTotal,
        paye: c.montantPaye,
        statut: STATUT[c.statut],
      });
    }
    ws.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';
    ws.getColumn('montant').numFmt = '# ##0';
    ws.getColumn('paye').numFmt = '# ##0';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contraventions_${stamp()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }

  @Get('contraventions.pdf')
  @ApiProduces('application/pdf')
  async pdf(@CurrentActor() actor: Actor, @Query() q: ListContraventionsQuery, @Res() res: Response) {
    const data = await this.rows(actor, q, 500);
    const doc = await this.doc(res, `contraventions_${stamp()}.pdf`, 'Registre des contraventions', true);
    const cols = [
      ['N°', 95],
      ['Date', 80],
      ['Plaque', 70],
      ['Infraction', 170],
      ['Officier', 120],
      ['Zone', 90],
      ['Montant', 65],
      ['Statut', 60],
    ] as const;
    const row = (vals: string[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = 36;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? '#8a9b91' : '#16271E');
      vals.forEach((v, i) => {
        doc.text(v, x, y, { width: cols[i][1] - 6, ellipsis: true, lineBreak: false });
        x += cols[i][1];
      });
      doc.moveDown(0.9);
      doc.moveTo(36, doc.y - 3).lineTo(doc.page.width - 36, doc.y - 3).strokeColor('#EEF3EF').stroke();
    };
    row(cols.map((c) => c[0].toUpperCase()), true);
    for (const c of data) {
      row([c.numero, fmtDate(c.dateHeure), c.plaque, c.infraction, c.officier ?? 'Administration', c.zone, `${fmtAmount(c.montantTotal)} F`, STATUT[c.statut]]);
    }
    doc.end();
  }

  @Roles('tresorier') @Get('finance.pdf')
  @ApiProduces('application/pdf')
  async financePdf(@Query('month') month: string | undefined, @Res() res: Response) {
    const r = await this.finance.report(month);
    const label = new Date(r.mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const doc = await this.doc(res, `rapport_financier_${stamp()}.pdf`, `Rapport financier · ${label}`, false);
    const line = (k: string, v: string) => {
      doc.font('Helvetica').fontSize(11).fillColor('#6E8378').text(k, 50, doc.y, { continued: true, width: 300 });
      doc.font('Helvetica-Bold').fillColor('#16271E').text(`  ${v}`);
      doc.moveDown(0.3);
    };
    doc.moveDown();
    line('Montant encaissé', `${fmtAmount(r.encaisse)} FCFA`);
    line('Montant émis', `${fmtAmount(r.emis)} FCFA`);
    line('Taux de recouvrement', `${r.tauxRecouvrement} %`);
    line('Transactions', fmtAmount(r.transactions));
    line('Panier moyen', `${fmtAmount(r.panierMoyen)} F`);
    line('Reste à recouvrer (global)', `${fmtAmount(r.resteARecouvrer)} FCFA`);
    line('Délai moyen de paiement', `${r.delaiMoyenJours} jours`);
    doc.moveDown().font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text('Répartition par mode de paiement', 50);
    doc.moveDown(0.5);
    for (const m of r.parMode) line(MODE[m.mode], `${fmtAmount(m.montant)} F (${m.pct} %)`);
    doc.moveDown().font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text('Encaissements par zone', 50);
    doc.moveDown(0.5);
    for (const z of r.parZone) line(z.zone, `${fmtAmount(z.encaisse)} F · ${z.taux} % recouvré`);
    doc.end();
  }

  private async doc(res: Response, filename: string, title: string, landscape: boolean) {
    const { institution } = await this.settings.get();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
    doc.pipe(res);
    doc.rect(0, 0, doc.page.width, 6).fill('#00853F');
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#16271E').text('SEN Contraventions', 36, 24);
    doc.font('Helvetica').fontSize(9).fillColor('#6E8378').text(institution);
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor(GREEN).text(title);
    doc.font('Helvetica').fontSize(8).fillColor('#8a9b91').text(`Généré le ${fmtDate(new Date())}`);
    doc.moveDown();
    return doc;
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

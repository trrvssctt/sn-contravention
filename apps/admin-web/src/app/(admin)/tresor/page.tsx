'use client';

import { Bank, FileArrowDown, MicrosoftExcelLogo } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { MonthlyBars, Ring } from '@/components/charts/charts';
import { AnimatedNumber, Button, CardTitle, Chip, Empty, ErrorBanner, PageHeader, Pagination, ProgressBar, SkeletonRows } from '@/components/ui/primitives';
import { api, qs } from '@/lib/api';
import { delta, fmt, fmtDateTime, fmtM, initials, rateColor } from '@/lib/format';
import { useExport } from '@/lib/hooks';
import { MODES } from '@/lib/modes';
import type { Page, Payment, PaymentMode } from '@/lib/types';

interface Report {
  mois: string;
  encaisse: number;
  encaisseMoisPrecedent: number;
  emis: number;
  aujourdhui: number;
  transactions: number;
  panierMoyen: number;
  tauxRecouvrement: number;
  resteARecouvrer: number;
  delaiMoyenJours: number;
  partMobileMoney: number;
  parMode: { mode: PaymentMode; montant: number; pct: number }[];
  mensuel: { mois: string; emis: number; encaisse: number }[];
  parZone: { zone: string; encaisse: number; taux: number }[];
  topOfficiers: { id: string; nomComplet: string; zone: string; collecte: number }[];
}


const P_COLS = '150px 130px 118px minmax(160px,1fr) 150px 110px 120px';
const PER_PAGE = 12;

export default function TresorPage() {
  const exp = useExport();
  const [mode, setMode] = useState<'all' | PaymentMode>('all');
  const [page, setPage] = useState(1);
  const r = useQuery({ queryKey: ['finance', 'report'], queryFn: () => api<Report>('/finance/report') });
  const pays = useQuery({
    queryKey: ['payments', mode, page],
    queryFn: () => api<Page<Payment>>(`/payments${qs({ mode, page, per_page: PER_PAGE })}`),
    placeholderData: keepPreviousData,
  });
  const d = r.data;
  const monthLabel = d ? new Date(d.mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
  const month = d ? new Date(d.mois).toLocaleDateString('fr-FR', { month: 'long' }) : '';
  const prevMonth = d ? new Date(new Date(d.mois).setMonth(new Date(d.mois).getMonth() - 1)).toLocaleDateString('fr-FR', { month: 'long' }) : '';
  const up = d ? d.encaisse >= d.encaisseMoisPrecedent : true;

  return (
    <>
      <PageHeader
        title="Paiements & Trésor"
        subtitle={`Rapport financier · ${monthLabel}`}
        actions={
          <>
            <Button icon={MicrosoftExcelLogo} loading={exp.busy?.includes('xlsx')} onClick={() => exp.run('/exports/contraventions.xlsx?statut=payee', 'paiements.xlsx')}>
              Excel
            </Button>
            <Button kind="primary" icon={FileArrowDown} loading={exp.busy?.includes('finance')} onClick={() => exp.run('/exports/finance.pdf', 'rapport_financier.pdf')}>
              Rapport PDF
            </Button>
          </>
        }
      />
      {r.error && <ErrorBanner error={r.error} onRetry={() => r.refetch()} />}

      <div className="flex flex-wrap gap-4">
        <div className="relative min-w-0 flex-[1.3_1_380px] overflow-hidden rounded-[20px] bg-[linear-gradient(140deg,#1FB87E_0%,#0E8C57_60%,#0B6E45_100%)] p-6 text-white">
          <div className="absolute -top-[60px] -right-[60px] h-[220px] w-[220px] rounded-full bg-white/[.07]" />
          <div className="absolute right-10 -bottom-20 h-40 w-40 rounded-full bg-white/[.05]" />
          <div className="flex items-center gap-2 text-[12.5px] font-extrabold tracking-[.5px] text-[#D3F2E3] uppercase">
            <Bank weight="fill" size={17} /> Encaissé au Trésor · {month}
          </div>
          <div className="mt-2.5 font-mono text-[40px] font-extrabold tracking-[-1px]">
            {d ? <AnimatedNumber value={d.encaisse} format={fmt} /> : '—'} <span className="text-[18px] text-[#D3F2E3]">FCFA</span>
          </div>
          {d && (
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <span className="rounded-[20px] bg-white/[.18] px-2.5 py-[3px] text-[12px] font-extrabold">
                {up ? '▲' : '▼'} {delta(d.encaisse, d.encaisseMoisPrecedent).replace(/^[+−]/, '')} vs {prevMonth}
              </span>
              <span className="text-[12.5px] font-semibold text-[#D3F2E3]">sur {fmt(d.emis)} F émis</span>
            </div>
          )}
          <div className="relative mt-5 grid grid-cols-3 gap-3">
            {[
              ["Aujourd'hui", d ? fmtM(d.aujourdhui) : '—'],
              ['Transactions', d ? fmt(d.transactions) : '—'],
              ['Panier moyen', d ? `${fmt(d.panierMoyen)} F` : '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-[14px] bg-white/[.12] p-3">
                <div className="text-[11px] font-bold text-[#D3F2E3]">{l}</div>
                <div className="mt-0.5 font-mono text-[17px] font-extrabold">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card flex min-w-0 flex-[1_1_320px] flex-col rounded-[20px] p-[22px]">
          <CardTitle title="Taux de recouvrement" subtitle="Encaissé / émis sur le mois" />
          <div className="mt-4 flex flex-1 items-center gap-5">
            <Ring pct={d?.tauxRecouvrement ?? 0} label={d ? `${d.tauxRecouvrement}%` : '—'} sub="objectif 80%" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Metric label="Reste à recouvrer" value={d ? `${fmtM(d.resteARecouvrer)} F` : '—'} color="#E84A57" />
              <Metric label="Délai moyen de paiement" value={d ? `${String(d.delaiMoyenJours).replace('.', ',')} jours` : '—'} />
              <Metric label="Payé via mobile money" value={d ? `${d.partMobileMoney} %` : '—'} />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <CardTitle title="Répartition par mode de paiement" right={<span className="text-[12.5px] font-bold text-muted">{d ? `${fmtM(d.encaisse)} FCFA` : ''}</span>} />
        <div className="mt-4 flex h-4 gap-[3px] overflow-hidden rounded-[10px]">
          {d?.parMode.map((m, i) => (
            <motion.div key={m.mode} className="h-full" style={{ background: MODES[m.mode].color }} initial={{ width: 0 }} animate={{ width: `${m.pct}%` }} transition={{ duration: 0.8, delay: i * 0.06 }} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {(d?.parMode ?? []).map((m) => {
            const M = MODES[m.mode];
            return (
              <div key={m.mode} className="flex items-center gap-3 rounded-[14px] border border-line-3 p-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: M.color }}>
                  <M.icon weight="fill" size={21} color="#fff" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-extrabold">{M.label}</div>
                  <div className="mt-px font-mono text-[15px] font-extrabold">{fmt(m.montant)} F</div>
                </div>
                <span className="font-mono text-[13px] font-extrabold text-muted">{m.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="card min-w-0 flex-[2_1_520px] p-5">
          <CardTitle
            title="Émis vs encaissé"
            subtitle="12 derniers mois · millions FCFA"
            right={
              <div className="flex gap-3.5 text-[12px] font-bold text-ink-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-mint-2" />
                  Émis
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
                  Encaissé
                </span>
              </div>
            }
          />
          <div className="mt-2">{d ? <MonthlyBars data={d.mensuel} /> : <div className="skeleton mt-4 h-[190px] rounded-xl" />}</div>
        </div>
        <div className="card min-w-0 flex-[1_1_320px] p-5">
          <CardTitle title="Top officiers · encaissements" subtitle="Ce mois, sur le terrain" />
          <div className="mt-3 flex flex-col">
            {d?.topOfficiers.map((o) => (
              <div key={o.id} className="flex items-center gap-[11px] border-t border-line-3 py-2.5">
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-mint text-[12px] font-extrabold text-brand-600">{initials(o.nomComplet)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-extrabold">{o.nomComplet}</div>
                  <div className="text-[11.5px] font-semibold text-faint">{o.zone}</div>
                </div>
                <span className="font-mono text-[13px] font-extrabold text-brand-600">{fmtM(o.collecte)} F</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <CardTitle title="Encaissements par zone" subtitle="Région de Dakar · ce mois" />
        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {d?.parZone.map((z) => (
            <div key={z.zone} className="rounded-[14px] border border-line-3 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-extrabold">{z.zone}</span>
                <span className="font-mono text-[12px] font-extrabold" style={{ color: rateColor(z.taux) }}>
                  {z.taux}%
                </span>
              </div>
              <div className="mt-1.5 font-mono text-[17px] font-extrabold">{fmtM(z.encaisse)} F</div>
              <div className="mt-[9px]">
                <ProgressBar pct={z.taux} color={rateColor(z.taux)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-3 px-[18px] py-3.5">
          <div className="mr-auto text-[15px] font-extrabold">Journal des paiements</div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'Tous'],
                ['wave', 'Wave'],
                ['orange_money', 'Orange Money'],
                ['especes', 'Espèces'],
                ['carte', 'Carte'],
              ] as const
            ).map(([id, l]) => (
              <Chip
                key={id}
                on={mode === id}
                onClick={() => {
                  setMode(id);
                  setPage(1);
                }}
              >
                {l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="scroll-x">
          <div className={`min-w-[940px] ${pays.isPlaceholderData ? 'opacity-60' : ''}`}>
            <div className="th grid gap-3" style={{ gridTemplateColumns: P_COLS }}>
              <span>N° reçu</span>
              <span>Date</span>
              <span>Plaque</span>
              <span>Encaissé par</span>
              <span>Mode</span>
              <span>Amendes</span>
              <span>Montant</span>
            </div>
            {pays.isLoading && <SkeletonRows rows={8} cols={P_COLS} />}
            {pays.data?.data.map((p) => {
              const M = MODES[p.mode];
              return (
                <div key={p.id} className="tr grid items-center gap-3" style={{ gridTemplateColumns: P_COLS }}>
                  <span className="font-mono text-[12.5px] font-bold text-brand-600">{p.numeroRecu}</span>
                  <span className="text-[12.5px] font-semibold text-muted">{fmtDateTime(p.dateHeure)}</span>
                  <span className="font-mono text-[13px] font-extrabold">{p.plaque}</span>
                  <span className="truncate font-semibold text-ink-2">{p.encaissePar}</span>
                  <span className="flex items-center gap-2 text-[13px] font-extrabold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[7px]" style={{ background: M.color }}>
                      <M.icon weight="fill" size={13} color="#fff" />
                    </span>
                    {M.label}
                  </span>
                  <span className="font-bold text-ink-2">
                    {p.allocations.length} amende{p.allocations.length > 1 ? 's' : ''}
                  </span>
                  <span className="font-mono font-extrabold text-brand-600">{fmt(p.montant)} F</span>
                </div>
              );
            })}
            {pays.data && !pays.data.data.length && <Empty>Aucun paiement</Empty>}
          </div>
        </div>
        <Pagination page={page} pages={Math.ceil((pays.data?.total ?? 0) / PER_PAGE)} total={pays.data?.total ?? 0} onChange={setPage} />
      </div>
    </>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold text-muted">{label}</div>
      <div className="font-mono text-[17px] font-extrabold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

'use client';

import { ArrowRight, Bank, ChartPieSlice, ClockCountdown, Fire, Receipt, Scroll, Icon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { DailyArea, Donut, HBars } from '@/components/charts/charts';
import { ContraventionHeader, ContraventionRows } from '@/components/ContraventionRows';
import { AnimatedNumber, CardTitle, ErrorBanner, PageHeader, Pill, ProgressBar, Segmented } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { delta, deltaPts, fmt, fmtM } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Contravention, Page } from '@/lib/types';

type Period = 'jour' | 'semaine' | 'mois';
interface Metrics {
  contraventions: number;
  montantEmis: number;
  montantEncaisse: number;
  tauxRecouvrement: number;
  impayees: number;
}

const LEVEL = {
  critique: { label: 'Critique', color: '#C93642', bg: '#FDEDEE' },
  eleve: { label: 'Élevé', color: '#B4701A', bg: '#FBF0DF' },
  modere: { label: 'Modéré', color: '#0E8C57', bg: '#E7F7EF' },
} as const;

export default function DashboardPage() {
  const { me } = useSession();
  const [period, setPeriod] = useState<Period>('mois');
  const kpis = useQuery({ queryKey: ['dashboard', 'kpis', period], queryFn: () => api<{ current: Metrics; previous: Metrics }>(`/dashboard/kpis?period=${period}`) });
  const series = useQuery({ queryKey: ['dashboard', 'series'], queryFn: () => api<{ date: string; count: number }[]>('/dashboard/series?days=30') });
  const byType = useQuery({ queryKey: ['dashboard', 'by-type'], queryFn: () => api<{ total: number; items: { libelle: string; count: number; pct: number }[] }>('/dashboard/by-type') });
  const byZone = useQuery({ queryKey: ['dashboard', 'by-zone'], queryFn: () => api<{ zone: string; count: number }[]>('/dashboard/by-zone') });
  const hot = useQuery({
    queryKey: ['dashboard', 'hotspots'],
    queryFn: () => api<{ rang: number; lieu: string; zone: string; infractionPrincipale: string; count: number; niveau: keyof typeof LEVEL }[]>('/dashboard/hotspots'),
  });
  const recent = useQuery({ queryKey: ['contraventions', 'recent'], queryFn: () => api<Page<Contravention>>('/contraventions?per_page=6') });

  const seriesTotal = series.data?.reduce((a, d) => a + d.count, 0) ?? 0;
  const k = kpis.data;

  return (
    <>
      <PageHeader
        title={me?.zone ? `Tableau de bord · ${me.zone.nom}` : 'Tableau de bord national'}
        subtitle="Activité des brigades et recouvrement des amendes"
        actions={<Segmented value={period} onChange={setPeriod} options={[['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']]} />}
      />
      {kpis.error && <ErrorBanner error={kpis.error} onRetry={() => kpis.refetch()} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Kpi icon={Receipt} iconBg="#E7F7EF" iconColor="#16A86E" label="Contraventions émises" value={k?.current.contraventions} format={fmt} delta={k && delta(k.current.contraventions, k.previous.contraventions)} />
        <Kpi icon={Scroll} iconBg="#EEF3EF" iconColor="#0E6B47" label="Montant total émis" unit="F" value={k?.current.montantEmis} format={fmtM} delta={k && delta(k.current.montantEmis, k.previous.montantEmis)} />
        <Kpi icon={Bank} iconBg="#E7F7EF" iconColor="#16A86E" label="Montant encaissé" unit="F" value={k?.current.montantEncaisse} format={fmtM} delta={k && delta(k.current.montantEncaisse, k.previous.montantEncaisse)} />
        <Kpi
          icon={ChartPieSlice}
          iconBg="#E7F7EF"
          iconColor="#16A86E"
          label="Taux de recouvrement"
          unit="%"
          value={k?.current.tauxRecouvrement}
          format={(n) => String(Math.round(n))}
          delta={k && deltaPts(k.current.tauxRecouvrement, k.previous.tauxRecouvrement)}
          good={k ? k.current.tauxRecouvrement >= k.previous.tauxRecouvrement : true}
          bar={k?.current.tauxRecouvrement}
        />
        <Kpi
          icon={ClockCountdown}
          iconBg="#FDEDEE"
          iconColor="#E84A57"
          label="Contraventions impayées"
          value={k?.current.impayees}
          format={fmt}
          delta={k && delta(k.current.impayees, k.previous.impayees)}
          good={k ? k.current.impayees <= k.previous.impayees : true}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="card min-w-0 flex-[2_1_520px] p-5">
          <CardTitle
            title="Contraventions émises"
            subtitle={`30 derniers jours · ${me?.zone ? `zone ${me.zone.nom}` : 'toutes zones'}`}
            right={
              <div className="text-right">
                <div className="font-mono text-[20px] font-extrabold">{fmt(seriesTotal)}</div>
                <div className="text-[11.5px] font-bold text-brand-600">moy. {fmt(seriesTotal / 30)} / jour</div>
              </div>
            }
          />
          <div className="mt-4">{series.data ? <DailyArea data={series.data} /> : <div className="skeleton h-[200px] rounded-xl" />}</div>
        </div>
        <div className="card min-w-0 flex-[1_1_300px] p-5">
          <CardTitle title="Par type d'infraction" subtitle="Ce mois" />
          {byType.data ? <Donut items={byType.data.items} total={byType.data.total} /> : <div className="skeleton mt-5 h-[148px] rounded-xl" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="card min-w-0 flex-[1_1_420px] p-5">
          <CardTitle title="Contraventions par zone" subtitle="Commissariats de la région de Dakar · ce mois" />
          {byZone.data ? <HBars rows={byZone.data.map((z) => ({ label: z.zone, value: z.count }))} /> : <div className="skeleton mt-4 h-[200px] rounded-xl" />}
        </div>
        <div className="card min-w-0 flex-[1_1_360px] p-5">
          <CardTitle title="Points chauds · Dakar" subtitle="Lieux les plus verbalisés ce mois" right={<Fire weight="fill" size={22} color="#E84A57" />} />
          <div className="mt-3.5 flex flex-col">
            {hot.data?.map((h, i) => (
              <motion.div
                key={h.lieu}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 border-t border-line-3 py-2.5"
              >
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-neutral font-mono text-[12px] font-extrabold text-brand-600">{h.rang}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-extrabold">{h.lieu}</div>
                  <div className="text-[11.5px] font-semibold text-faint">
                    {h.zone} · {h.infractionPrincipale}
                  </div>
                </div>
                <span className="font-mono text-[13px] font-extrabold">{fmt(h.count)}</span>
                <Pill color={LEVEL[h.niveau].color} bg={LEVEL[h.niveau].bg} size="sm">
                  {LEVEL[h.niveau].label}
                </Pill>
              </motion.div>
            ))}
            {hot.data && !hot.data.length && <div className="py-6 text-center text-[13px] font-bold text-faint">Aucune donnée ce mois</div>}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-[18px]">
          <div className="flex items-center gap-2.5">
            <div className="text-[15px] font-extrabold">Dernières contraventions</div>
            <span className="flex items-center gap-1.5 rounded-[20px] bg-mint px-[9px] py-[3px] text-[11.5px] font-extrabold text-brand-600">
              <span className="live-dot h-[7px] w-[7px] rounded-full bg-brand" />
              Temps réel
            </span>
          </div>
          <Link href="/contraventions" className="flex items-center gap-1.5 text-[13px] font-extrabold text-brand-600 hover:text-brand">
            Voir le registre <ArrowRight weight="bold" />
          </Link>
        </div>
        <div className="scroll-x">
          <div className="min-w-[1000px]">
            <ContraventionHeader />
            <ContraventionRows rows={recent.data?.data} loading={recent.isLoading} perPage={6} />
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({
  icon: I,
  iconBg,
  iconColor,
  label,
  value,
  unit,
  format,
  delta,
  good = true,
  bar,
}: {
  icon: Icon;
  iconBg: string;
  iconColor: string;
  label: string;
  value?: number;
  unit?: string;
  format: (n: number) => string;
  delta?: string;
  good?: boolean;
  bar?: number;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} className="card p-[18px] transition-shadow hover:shadow-float">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: iconBg }}>
          <I weight="fill" size={21} color={iconColor} />
        </div>
        {delta && (
          <span className="rounded-[20px] px-2 py-[3px] text-[11.5px] font-extrabold" style={good ? { color: '#0E8C57', background: '#E7F7EF' } : { color: '#C93642', background: '#FDEDEE' }}>
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3.5 font-mono text-[26px] font-extrabold tracking-[-.5px]">
        {value === undefined ? <span className="skeleton inline-block h-7 w-24 rounded" /> : <AnimatedNumber value={value} format={format} />}{' '}
        {unit && <span className="text-[13px] text-faint-2">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[12.5px] font-bold text-muted">{label}</div>
      {bar !== undefined && (
        <div className="mt-2.5">
          <ProgressBar pct={bar} color="linear-gradient(90deg,#1FB87E,#0E8C57)" />
        </div>
      )}
    </motion.div>
  );
}

'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt, fmtDay, monthShort } from '@/lib/format';

const tooltipStyle = {
  background: '#16271E',
  border: 'none',
  borderRadius: 10,
  color: '#fff',
  fontFamily: 'Manrope, system-ui, sans-serif',
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 11px',
};

/** Courbe des contraventions émises sur 30 jours (aire + ligne). */
export function DailyArea({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1FB87E" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#1FB87E" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#EEF3EF" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => fmtDay(d)}
          interval={Math.ceil(data.length / 5) - 1}
          padding={{ left: 14, right: 14 }}
          tick={{ fontSize: 11, fontWeight: 700, fill: '#9CB0A4' }}
          axisLine={{ stroke: '#E3EBE5' }}
          tickLine={false}
        />
        <YAxis hide domain={['dataMin - 20', 'dataMax + 20']} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: '#A7C7B6', fontWeight: 600 }}
          itemStyle={{ color: '#fff' }}
          labelFormatter={(d) => fmtDay(d as string)}
          formatter={(v) => [`${fmt(v as number)} amendes`, '']}
          separator=""
          cursor={{ stroke: '#16A86E', strokeDasharray: '3 3' }}
        />
        <Area type="monotone" dataKey="count" stroke="#16A86E" strokeWidth={2.5} fill="url(#area)" animationDuration={900} activeDot={{ r: 5, fill: '#16A86E', stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ['#16A86E', '#3CC48B', '#8FDDB9', '#0E6B47', '#DB8B2A', '#C9D8CF'];

/** Donut « par type d'infraction » — survol d'une part = mise en avant + total au centre. */
export function Donut({ items, total }: { items: { libelle: string; count: number; pct: number }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const R = 62;
  const r = 38;
  const C = 74;
  const sum = items.reduce((a, i) => a + i.count, 0) || 1;
  let acc = 0;
  const arcs = items.map((it, i) => {
    const a0 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
    acc += it.count;
    const a1 = (acc / sum) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const d = `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
    return { d, color: DONUT_COLORS[i % DONUT_COLORS.length], i };
  });
  const h = hover !== null ? items[hover] : null;
  return (
    <div className="mt-[18px] flex flex-wrap items-center gap-5">
      <svg width={148} height={148} viewBox="0 0 148 148" className="flex-none overflow-visible">
        {arcs.map((a) => (
          <motion.path
            key={a.i}
            d={a.d}
            fill={a.color}
            stroke="#fff"
            strokeWidth={1.5}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: hover === null || hover === a.i ? 1 : 0.35, scale: hover === a.i ? 1.05 : 1 }}
            transition={{ duration: 0.35, delay: hover === null ? a.i * 0.05 : 0 }}
            style={{ transformOrigin: '74px 74px', cursor: 'pointer' }}
            onMouseEnter={() => setHover(a.i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" className="font-mono" fontSize={19} fontWeight={800} fill="#16271E">
          {h ? `${h.pct}%` : fmt(total)}
        </text>
        <text x={C} y={C + 15} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#9CB0A4">
          {h ? fmt(h.count) : 'amendes'}
        </text>
      </svg>
      <div className="flex min-w-[130px] flex-1 flex-col gap-[9px]">
        {items.map((it, i) => (
          <div
            key={it.libelle}
            className="flex cursor-default items-center gap-2 text-[12.5px] transition-opacity"
            style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="flex-1 truncate font-bold text-ink-2">{it.libelle}</span>
            <span className="font-mono font-extrabold">{it.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barres horizontales (dégradé #7FD9B1 → #16A86E). */
export function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="mt-4 flex flex-col gap-[11px]">
      {rows.map((z, i) => (
        <div key={z.label} className="grid grid-cols-[120px_minmax(0,1fr)_56px] items-center gap-3" title={`${z.label} : ${fmt(z.value)}`}>
          <span className="truncate text-[13px] font-bold text-ink-2">{z.label}</span>
          <div className="h-2.5 overflow-hidden rounded-[10px] bg-neutral">
            <motion.div
              className="h-full rounded-[10px] bg-[linear-gradient(90deg,#7FD9B1,#16A86E)]"
              initial={{ width: 0 }}
              animate={{ width: `${(z.value / max) * 100}%` }}
              transition={{ duration: 0.8, delay: i * 0.04, ease: [0.2, 0.8, 0.25, 1] }}
            />
          </div>
          <span className="text-right font-mono text-[12.5px] font-extrabold">{fmt(z.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Émis vs encaissé sur 12 mois (barres jumelées, en millions). */
export function MonthlyBars({ data }: { data: { mois: string; emis: number; encaisse: number }[] }) {
  const rows = data.map((d, i) => ({ ...d, m: monthShort(d.mois), last: i === data.length - 1 }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={rows} margin={{ top: 18, right: 0, left: 0, bottom: 0 }} barGap={3} barCategoryGap="22%">
        <XAxis dataKey="m" tick={{ fontSize: 10.5, fontWeight: 700, fill: '#9CB0A4' }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: '#F1F5F2', radius: 6 }}
          contentStyle={tooltipStyle}
          labelStyle={{ color: '#A7C7B6', fontWeight: 600 }}
          itemStyle={{ color: '#fff' }}
          formatter={(v, n) => [`${(Number(v) / 1e6).toFixed(1).replace('.', ',')} M F`, n === 'emis' ? 'Émis' : 'Encaissé']}
        />
        <Bar dataKey="emis" fill="#CDEEDD" radius={[5, 5, 2, 2]} maxBarSize={16} animationDuration={800} />
        <Bar dataKey="encaisse" fill="#16A86E" radius={[5, 5, 2, 2]} maxBarSize={16} animationDuration={800} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Anneau de progression (taux de recouvrement). */
export function Ring({ pct, size = 130, label, sub }: { pct: number; size?: number; label: string; sub: string }) {
  const stroke = 16;
  const rad = (size - stroke) / 2;
  const circ = 2 * Math.PI * rad;
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#EEF3EF" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={rad}
          fill="none"
          stroke="#16A86E"
          strokeWidth={stroke}
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - Math.min(100, pct) / 100) }}
          transition={{ duration: 1, ease: [0.2, 0.8, 0.25, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[26px] font-extrabold text-brand-600">{label}</div>
        <div className="text-[10.5px] font-bold text-faint-2">{sub}</div>
      </div>
    </div>
  );
}

/** Mini-histogramme vertical (activité mensuelle d'un officier). */
export function MiniBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="mt-3 flex h-[90px] items-end gap-[7px]">
      {data.map((b, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[5px]" title={`${b.label} : ${b.value}`}>
          <motion.div
            className="w-full rounded-[5px]"
            style={{ background: i === data.length - 1 ? '#0E8C57' : '#8FDDB9' }}
            initial={{ height: 0 }}
            animate={{ height: Math.max(3, Math.round((b.value / max) * 70)) }}
            transition={{ duration: 0.6, delay: i * 0.04 }}
          />
          <span className="text-[9.5px] font-bold text-faint-2">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

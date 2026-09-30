'use client';

import * as d3 from 'd3';
import type { Feature, Geometry } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { fmt, rateColor } from '@/lib/format';
import type { Zone } from '@/lib/types';

/**
 * Carte 3D des commissariats (port React de « Carte Commissariats.html »).
 * Géométrie réelle Natural Earth (world-atlas), projection Mercator comprimée (×0.6)
 * + extrusion par couches ; colonnes : hauteur = √amendes du mois, couleur = recouvrement.
 */

interface Station {
  id: string;
  name: string;
  ville: string;
  ll: [number, number];
  count: number;
  officers: number;
  cash: number;
  rate: number;
  subs?: Zone[];
}

const NEIGH = new Set(['478', '466', '324', '624']);
const LABELS: [string, [number, number]][] = [
  ['MAURITANIE', [-13.6, 17.45]],
  ['MALI', [-11.75, 14.2]],
  ['GUINÉE', [-12.9, 12.15]],
  ['GUINÉE-BISSAU', [-15.6, 12.05]],
  ['OCÉAN', [-17.75, 13.2]],
];
const MAJOR = new Set(['dakar', 'thies', 'stlouis', 'ziguinchor', 'tamba', 'kedougou', 'matam']);
const shade = (c: string, k: number) => d3.color(c)![k > 0 ? 'brighter' : 'darker'](Math.abs(k)).formatHex();

const geo = (() => {
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const all = (feature(topo, topo.objects.countries) as unknown as { features: Feature<Geometry>[] }).features;
  return {
    sen: all.find((f) => f.id === '686')!,
    gam: all.find((f) => f.id === '270')!,
    neigh: all.filter((f) => NEIGH.has(String(f.id))),
  };
})();

function toStations(zones: Zone[]): Station[] {
  const dakar = zones.filter((z) => z.isDakar);
  const dCount = d3.sum(dakar, (z) => z.amendesMois);
  const out: Station[] = [];
  if (dakar.length) {
    out.push({
      id: 'dakar',
      name: 'Région de Dakar',
      ville: 'Dakar',
      ll: [-17.44, 14.7],
      count: dCount,
      officers: d3.sum(dakar, (z) => z.officiers),
      cash: d3.sum(dakar, (z) => z.encaisseMois),
      rate: dCount ? Math.round(d3.sum(dakar, (z) => z.tauxRecouvrement * z.amendesMois) / dCount) : 0,
      subs: [...dakar].sort((a, b) => b.amendesMois - a.amendesMois),
    });
  }
  for (const z of zones.filter((x) => !x.isDakar)) {
    out.push({ id: z.code, name: z.commissariat, ville: z.nom, ll: [z.lng, z.lat], count: z.amendesMois, officers: z.officiers, cash: z.encaisseMois, rate: z.tauxRecouvrement });
  }
  return out;
}

const fmtCash = (n: number) => `${(n / 1e6).toFixed(1).replace('.', ',')} M`;

export function SenegalMap3D({ zones }: { zones: Zone[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [mode3d, setMode3d] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const firstDraw = useRef(true);
  const stations = useMemo(() => toStations(zones), [zones]);

  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const { w: W, h: H } = size;
    if (!W || !H || !stations.length) return;
    const svg = d3.select(svgRef.current!);
    const stage = stageRef.current!;
    const tip = tipRef.current!;
    svg.attr('viewBox', `0 0 ${W} ${H}`).selectAll('*').remove();

    const tilt = mode3d ? 0.6 : 1;
    const depth = mode3d ? 16 : 0;
    const topPad = mode3d ? 150 : 90;
    const pad = 36;
    const base = d3.geoMercator().fitExtent(
      [
        [pad, pad],
        [W - pad, pad + (H - topPad - pad - depth - 60) / tilt],
      ],
      geo.sen,
    );
    const P = (ll: [number, number]): [number, number] => {
      const p = base(ll)!;
      return [p[0], topPad + (p[1] - pad) * tilt];
    };
    const path = d3.geoPath(
      d3.geoTransform({
        point(x, y) {
          const p = P([x, y]);
          this.stream.point(p[0], p[1]);
        },
      }),
    );

    const defs = svg.append('defs');
    const tg = defs.append('linearGradient').attr('id', 'top').attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 1);
    tg.append('stop').attr('offset', '0').attr('stop-color', '#D9F3E6');
    tg.append('stop').attr('offset', '1').attr('stop-color', '#9EDFC0');
    defs.append('filter').attr('id', 'soft').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '160%').append('feGaussianBlur').attr('stdDeviation', mode3d ? 10 : 5);

    const g = svg.append('g');
    g.append('g').selectAll('path').data(geo.neigh).join('path').attr('d', path).attr('transform', `translate(0,${depth})`).attr('fill', '#EEF2EF').attr('stroke', '#D2DCD5');
    g.append('path').attr('d', path(geo.sen)).attr('transform', `translate(${mode3d ? 14 : 4},${depth + (mode3d ? 16 : 4)})`).attr('fill', 'rgba(10,60,40,.28)').attr('filter', 'url(#soft)');
    for (let i = depth; i > 0; i--) g.append('path').attr('d', path(geo.sen)).attr('transform', `translate(0,${i})`).attr('fill', d3.interpolateRgb('#0A5E3B', '#0F8A57')(1 - i / depth));
    g.append('path').attr('d', path(geo.sen)).attr('fill', 'url(#top)').attr('stroke', '#fff').attr('stroke-width', 1.6).attr('stroke-linejoin', 'round');
    g.append('path').attr('d', path(geo.gam)).attr('fill', '#F3F6F4').attr('stroke', '#C9D6CE');
    const gp = P([-15.45, 13.47]);
    g.append('text').attr('x', gp[0]).attr('y', gp[1] + 3).attr('text-anchor', 'middle').attr('fill', '#9CB0A4').attr('font-size', 8.5).attr('font-weight', 800).attr('letter-spacing', 1.5).text('GAMBIE');
    LABELS.forEach(([t, ll]) => {
      const p = P(ll);
      g.append('text')
        .attr('x', Math.max(46, Math.min(W - 46, p[0])))
        .attr('y', t === 'MAURITANIE' ? Math.max(95, p[1] - 6) : p[1] + depth)
        .attr('text-anchor', 'middle')
        .attr('fill', t === 'OCÉAN' ? '#7FA9B8' : '#9AAEA2')
        .attr('font-size', 10.5)
        .attr('font-weight', 800)
        .attr('letter-spacing', 2.5)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(255,255,255,.7)')
        .attr('stroke-width', 3)
        .text(t);
    });

    const maxC = d3.max(stations, (s) => s.count) || 1;
    const hs = d3.scaleSqrt().domain([0, maxC]).range([6, mode3d ? 120 : 0]);
    const rs = d3.scaleSqrt().domain([0, maxC]).range([4, 16]);
    const pins = stations.map((s) => ({ ...s, p: P(s.ll) })).sort((a, b) => a.p[1] - b.p[1]);
    const anim = firstDraw.current;
    const moveTip = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top - 14}px`;
    };
    const node = g
      .append('g')
      .selectAll<SVGGElement, (typeof pins)[number]>('g')
      .data(pins)
      .join('g')
      .attr('transform', (d) => `translate(${d.p[0]},${d.p[1]})`)
      .style('cursor', 'pointer')
      .on('mouseenter', (e, d) => {
        tip.innerHTML = `${d.ville}<small>${fmt(d.count)} amendes · ${d.rate}% recouvré</small>`;
        tip.style.opacity = '1';
        moveTip(e);
      })
      .on('mousemove', moveTip)
      .on('mouseleave', () => (tip.style.opacity = '0'))
      .on('click', (_e, d) => setSelected(d.id));

    node.each(function (d, idx) {
      const el = d3.select(this);
      const c = rateColor(d.rate);
      const sel = selected === d.id;
      const show = MAJOR.has(d.id) || sel;
      if (mode3d) {
        const h = hs(d.count);
        const w = d.id === 'dakar' ? 9 : 6.5;
        const gid = `pg-${d.id}`;
        const lg = defs.append('linearGradient').attr('id', gid);
        lg.append('stop').attr('offset', '0').attr('stop-color', shade(c, 0.5));
        lg.append('stop').attr('offset', '.55').attr('stop-color', c);
        lg.append('stop').attr('offset', '1').attr('stop-color', shade(c, -0.9));
        el.append('ellipse').attr('rx', w + 6).attr('ry', (w + 6) * 0.42).attr('fill', 'rgba(8,50,32,.25)');
        if (sel) el.append('ellipse').attr('rx', w + 12).attr('ry', (w + 12) * 0.42).attr('fill', 'none').attr('stroke', '#16271E').attr('stroke-width', 1.6).attr('stroke-dasharray', '3 3');
        const delay = anim ? idx * 40 : 0;
        el.append('rect')
          .attr('x', -w)
          .attr('width', w * 2)
          .attr('y', anim ? 0 : -h)
          .attr('height', anim ? 0 : h)
          .attr('fill', `url(#${gid})`)
          .transition()
          .duration(anim ? 900 : 0)
          .delay(delay)
          .ease(d3.easeCubicOut)
          .attr('y', -h)
          .attr('height', h);
        el.append('ellipse')
          .attr('rx', w)
          .attr('ry', w * 0.42)
          .attr('cy', anim ? 0 : -h)
          .attr('fill', shade(c, 0.8))
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.8)
          .transition()
          .duration(anim ? 900 : 0)
          .delay(delay)
          .ease(d3.easeCubicOut)
          .attr('cy', -h);
        const lbl = el.append('g').attr('transform', `translate(0,${-h - 12})`).attr('opacity', show ? (anim ? 0 : 1) : 0);
        el.on('mouseenter.l', () => lbl.interrupt().attr('opacity', 1)).on('mouseleave.l', () => !show && lbl.attr('opacity', 0));
        lbl.append('text').attr('text-anchor', 'middle').attr('font-size', d.id === 'dakar' ? 12 : 10.5).attr('font-weight', 800).attr('fill', '#16271E').attr('paint-order', 'stroke').attr('stroke', 'rgba(255,255,255,.9)').attr('stroke-width', 3).text(d.ville);
        if (d.count >= 1000 || sel)
          lbl.append('text').attr('y', -13).attr('text-anchor', 'middle').attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 10).attr('font-weight', 800).attr('fill', shade(c, -0.6)).attr('paint-order', 'stroke').attr('stroke', 'rgba(255,255,255,.9)').attr('stroke-width', 3).text(fmt(d.count));
        if (anim && show) lbl.transition().delay(700 + idx * 40).duration(300).attr('opacity', 1);
      } else {
        const r = rs(d.count);
        el.append('circle').attr('r', r + 4).attr('fill', c).attr('opacity', 0.18);
        el.append('circle').attr('r', r).attr('fill', c).attr('stroke', sel ? '#16271E' : '#fff').attr('stroke-width', sel ? 2.4 : 1.6);
        const lbl = el.append('g').attr('opacity', show ? 1 : 0);
        el.on('mouseenter.l', () => lbl.attr('opacity', 1)).on('mouseleave.l', () => !show && lbl.attr('opacity', 0));
        lbl.append('text').attr('y', -r - 7).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('font-weight', 800).attr('fill', '#16271E').attr('paint-order', 'stroke').attr('stroke', 'rgba(255,255,255,.9)').attr('stroke-width', 3).text(d.ville);
      }
    });
    firstDraw.current = false;
  }, [size, mode3d, selected, stations]);

  const s = stations.find((x) => x.id === selected);
  const tot = d3.sum(stations, (x) => x.count);
  const cashTot = d3.sum(stations, (x) => x.cash);
  const rateTot = tot ? Math.round(d3.sum(stations, (x) => x.rate * x.count) / tot) : 0;

  return (
    <div className="flex h-full min-h-[520px] flex-col md:flex-row">
      <div ref={stageRef} className="relative h-[460px] min-w-0 flex-none overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,#EAF6FB_0%,#DDEFF5_55%,#D2E8EF_100%)] md:h-auto md:flex-1">
        <svg ref={svgRef} className="block h-full w-full" role="img" aria-label="Carte 3D du Sénégal avec les commissariats" />
        <div className="pointer-events-none absolute top-4 right-[18px] left-[18px] flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-[14px] border border-line-2 bg-white/90 px-3.5 py-2.5 backdrop-blur-[8px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flag-senegal.svg" alt="" className="h-5 w-[30px] rounded-[3px] object-cover" />
            <div>
              <b className="block text-[14px] font-extrabold">Réseau des commissariats</b>
              <span className="text-[11.5px] font-bold text-muted">Hauteur = amendes du mois · couleur = recouvrement</span>
            </div>
          </div>
          <div className="pointer-events-auto flex gap-1.5 rounded-xl border border-line-2 bg-white/90 p-1 backdrop-blur-[8px]">
            {[
              [true, 'Vue 3D'],
              [false, 'Vue plane'],
            ].map(([v, l]) => (
              <button
                key={String(l)}
                onClick={() => {
                  if (v) firstDraw.current = true;
                  setMode3d(v as boolean);
                }}
                className={`h-8 cursor-pointer rounded-[9px] px-3 text-[12.5px] ${mode3d === v ? 'bg-brand font-extrabold text-white' : 'font-bold text-ink-2'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="absolute bottom-4 left-[18px] flex flex-wrap gap-3.5 rounded-xl border border-line-2 bg-white/90 px-3 py-2.5 text-[11.5px] font-bold text-ink-2 backdrop-blur-[8px]">
          {[
            ['#16A86E', '≥ 75 % recouvré'],
            ['#DB8B2A', '65–74 %'],
            ['#E84A57', '< 65 %'],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
        <div
          ref={tipRef}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[10px] bg-toast px-[11px] py-2 text-[12px] font-bold whitespace-nowrap text-white opacity-0 transition-opacity [&_small]:block [&_small]:text-[11px] [&_small]:font-semibold [&_small]:text-[#A7C7B6]"
        />
      </div>

      <aside className="w-auto flex-none overflow-y-auto border-t border-line bg-white p-[18px] md:w-[300px] md:border-t-0 md:border-l">
        {!s ? (
          <>
            <div className="text-[10.5px] font-extrabold tracking-[.7px] text-faint-2">COUVERTURE NATIONALE</div>
            <div className="mt-[3px] mb-0.5 text-[18px] font-extrabold">Sénégal</div>
            <div className="text-[12px] font-semibold text-muted">{stations.length} commissariats · 14 régions</div>
            <PanelStats items={[[fmt(tot), 'Amendes (mois)'], [fmt(d3.sum(stations, (x) => x.officers)), 'Officiers'], [fmtCash(cashTot), 'Encaissé (F)', '#0E8C57'], [`${rateTot} %`, 'Recouvrement']]} />
            <div className="mb-1 text-[10.5px] font-extrabold tracking-[.7px] text-faint-2">CLASSEMENT</div>
            {[...stations]
              .sort((a, b) => b.count - a.count)
              .map((x) => (
                <button key={x.id} onClick={() => setSelected(x.id)} className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-3 py-[9px] text-left text-[12.5px] hover:bg-hover">
                  <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: rateColor(x.rate) }} />
                  <span className="flex-1 font-extrabold">{x.ville}</span>
                  <span className="font-mono font-extrabold">{fmt(x.count)}</span>
                </button>
              ))}
          </>
        ) : (
          <>
            <button onClick={() => setSelected(null)} className="mb-2.5 cursor-pointer text-[12px] font-extrabold text-brand-600">
              ← Vue nationale
            </button>
            <div className="text-[10.5px] font-extrabold tracking-[.7px] text-faint-2">{s.subs ? 'RÉGION' : 'COMMISSARIAT'}</div>
            <div className="mt-[3px] mb-0.5 text-[18px] font-extrabold">{s.name}</div>
            <div className="text-[12px] font-semibold text-muted">
              {s.ll[1].toFixed(2)}° N · {Math.abs(s.ll[0]).toFixed(2)}° O
            </div>
            <PanelStats items={[[fmt(s.count), 'Amendes (mois)'], [String(s.officers), 'Officiers'], [fmtCash(s.cash), 'Encaissé (F)', '#0E8C57'], [`${s.rate} %`, 'Recouvrement', rateColor(s.rate)]]} />
            <div className="flex justify-between text-[12px] font-semibold text-muted">
              <span>Objectif 80 %</span>
              <b style={{ color: rateColor(s.rate) }}>{s.rate} %</b>
            </div>
            <div className="mt-1.5 h-[7px] overflow-hidden rounded-[7px] bg-line-3">
              <div className="h-full rounded-[7px] transition-[width] duration-700" style={{ width: `${s.rate}%`, background: rateColor(s.rate) }} />
            </div>
            {s.subs && (
              <>
                <div className="mt-5 mb-1 text-[10.5px] font-extrabold tracking-[.7px] text-faint-2">COMMISSARIATS DE ZONE</div>
                {s.subs.map((z) => (
                  <div key={z.id} className="flex items-center gap-2.5 border-t border-line-3 py-[9px] text-[12.5px]">
                    <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: rateColor(z.tauxRecouvrement) }} />
                    <span className="flex-1 font-extrabold">{z.nom}</span>
                    <span className="font-mono font-extrabold">{fmt(z.amendesMois)}</span>
                    <span className="w-[34px] text-right text-[11px] font-extrabold" style={{ color: rateColor(z.tauxRecouvrement) }}>
                      {z.tauxRecouvrement}%
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function PanelStats({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="my-3.5 grid grid-cols-2 gap-2">
      {items.map(([v, l, c]) => (
        <div key={l} className="rounded-xl bg-head px-[11px] py-2.5">
          <b className="block font-mono text-[16px] font-extrabold" style={{ color: c }}>
            {v}
          </b>
          <span className="text-[10.5px] font-bold text-faint">{l}</span>
        </div>
      ))}
    </div>
  );
}

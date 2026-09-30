'use client';

import { MapPin } from '@phosphor-icons/react';

/**
 * Mini-carte GPS légère : tuiles OpenStreetMap (zoom 16) sans dépendance cartographique.
 * Attribution « © OpenStreetMap contributors » obligatoire.
 */
export function MiniMap({ lat, lng, height = 150 }: { lat: number; lng: number; height?: number }) {
  const z = 16;
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const x0 = Math.floor(xf) - 1;
  const y0 = Math.floor(yf) - 1;
  // Position du point dans la mosaïque 3×3 de tuiles de 256 px, centrée par translation.
  const px = (xf - x0) * 256;
  const py = (yf - y0) * 256;

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line bg-[#eaf5ee]" style={{ height }}>
      <div className="absolute" style={{ left: `calc(50% - ${px}px)`, top: `calc(50% - ${py}px)`, width: 768, height: 768 }}>
        {[0, 1, 2].flatMap((dy) =>
          [0, 1, 2].map((dx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${dx}-${dy}`}
              src={`https://tile.openstreetmap.org/${z}/${x0 + dx}/${y0 + dy}.png`}
              alt=""
              width={256}
              height={256}
              className="absolute select-none"
              style={{ left: dx * 256, top: dy * 256 }}
              draggable={false}
            />
          )),
        )}
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full drop-shadow-[0_4px_6px_rgba(0,0,0,.25)]">
        <MapPin weight="fill" size={34} color="#16A86E" />
      </div>
      <div className="absolute top-2 left-2 rounded-lg bg-white/90 px-2 py-1 font-mono text-[11px] font-bold text-mint-ink">
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </div>
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
        className="absolute right-1 bottom-1 rounded bg-white/85 px-1.5 text-[9.5px] font-semibold text-ink-2"
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}

export function PhotoPlaceholder({ url, label }: { url: string | null; label: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} className="h-[150px] w-full rounded-[14px] border border-line object-cover" />;
  }
  return (
    <div className="flex h-[150px] flex-col items-center justify-center gap-1.5 rounded-[14px] border border-line bg-[repeating-linear-gradient(135deg,#eef2ee_0_12px,#e6ece7_12px_24px)]">
      <span className="font-mono text-[11px] font-bold text-muted">{label} · non fournie</span>
    </div>
  );
}

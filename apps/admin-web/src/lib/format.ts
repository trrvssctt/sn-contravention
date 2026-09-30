/** Formats d'affichage des maquettes : « 20 000 F », « 52,8 M », « 30 sept. · 09:05 ». */

export function fmt(n: number | null | undefined) {
  return String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function fmtM(n: number) {
  return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',') + ' M';
}

/** Montant compact : sous le million en entier, au-delà en millions. */
export function fmtCompact(n: number) {
  return n >= 1e6 ? fmtM(n) : fmt(n);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

export function fmtDateTime(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDay(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthShort(iso: string | Date) {
  return MONTHS_SHORT[new Date(iso).getMonth()];
}

export function fmtLongDate(d = new Date()) {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtRelative(iso: string | Date | null) {
  if (!iso) return 'Jamais';
  const d = new Date(iso);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return `Aujourd'hui · ${hm}`;
  if (days === 1) return `Hier · ${hm}`;
  return `${fmtDay(d)} · ${hm}`;
}

export function initials(name: string) {
  return name
    .replace(/^(Sgt\.|Brig\.|Off\.|Adj\.|Lt\.|Cpt\.|Col\.|Com\.)\s*/, '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Variation en % entre deux valeurs, au format « +8,2 % ». */
export function delta(cur: number, prev: number) {
  if (!prev) return cur ? '+100 %' : '0 %';
  const v = ((cur - prev) / prev) * 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')} %`;
}

export function deltaPts(cur: number, prev: number) {
  const v = cur - prev;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)} pt${Math.abs(v) > 1 ? 's' : ''}`;
}

/** Couleur du taux de recouvrement (≥ 75 % vert, 65–74 % orange, < 65 % rouge). */
export function rateColor(r: number) {
  return r >= 75 ? '#16A86E' : r >= 65 ? '#DB8B2A' : '#E84A57';
}

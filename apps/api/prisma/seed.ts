/**
 * Données de démonstration réalistes : 12 mois d'activité sur 23 commissariats.
 * Les volumes du mois courant reprennent ceux des maquettes (ex. Plateau ≈ 1 240 amendes).
 *   npm run seed -w api
 * Tous les comptes de démo utilisent le mot de passe : Passer123!
 */
import { PrismaClient, Prisma, PaymentMode, VehicleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const PASSWORD = 'Passer123!';

let seed = 20260930;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const weighted = <T>(items: readonly (readonly [T, number])[]) => {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
};

// ── Référentiels ────────────────────────────────────────────────────────────
const ZONES = [
  // code, nom, commissariat, région, dakar, lat, lng, amendes/mois, officiers, taux
  ['plateau', 'Plateau', 'Commissariat central de Dakar', 'Dakar', true, 14.6708, -17.4381, 1240, 24, 81],
  ['medina', 'Médina', 'Commissariat de la Médina', 'Dakar', true, 14.6832, -17.4485, 860, 18, 76],
  ['parcelles', 'Parcelles Assainies', 'Commissariat des Parcelles', 'Dakar', true, 14.764, -17.442, 720, 15, 72],
  ['pikine', 'Pikine', 'Commissariat de Pikine', 'Dakar', true, 14.755, -17.39, 690, 17, 66],
  ['guediawaye', 'Guédiawaye', 'Commissariat de Guédiawaye', 'Dakar', true, 14.778, -17.395, 540, 13, 63],
  ['grandyoff', 'Grand Yoff', 'Commissariat de Grand Yoff', 'Dakar', true, 14.737, -17.46, 510, 14, 71],
  ['almadies', 'Almadies', 'Commissariat des Almadies', 'Dakar', true, 14.745, -17.513, 430, 12, 84],
  ['rufisque', 'Rufisque', 'Commissariat de Rufisque', 'Dakar', true, 14.716, -17.273, 328, 11, 58],
  ['thies', 'Thiès', 'Commissariat de Thiès', 'Thiès', false, 14.79, -16.93, 1420, 46, 77],
  ['mbour', 'Mbour', 'Commissariat de Mbour', 'Thiès', false, 14.42, -16.96, 980, 31, 72],
  ['stlouis', 'Saint-Louis', 'Commissariat de Saint-Louis', 'Saint-Louis', false, 16.03, -16.49, 760, 28, 76],
  ['touba', 'Touba', 'Commissariat de Touba', 'Diourbel', false, 14.86, -15.88, 690, 26, 62],
  ['kaolack', 'Kaolack', 'Commissariat de Kaolack', 'Kaolack', false, 14.15, -16.07, 640, 24, 70],
  ['ziguinchor', 'Ziguinchor', 'Commissariat de Ziguinchor', 'Ziguinchor', false, 12.56, -16.27, 410, 19, 68],
  ['louga', 'Louga', 'Commissariat de Louga', 'Louga', false, 15.62, -16.22, 380, 15, 75],
  ['diourbel', 'Diourbel', 'Commissariat de Diourbel', 'Diourbel', false, 14.65, -16.23, 350, 14, 64],
  ['tamba', 'Tambacounda', 'Commissariat de Tambacounda', 'Tambacounda', false, 13.77, -13.67, 330, 16, 61],
  ['fatick', 'Fatick', 'Commissariat de Fatick', 'Fatick', false, 14.34, -16.41, 290, 12, 73],
  ['kolda', 'Kolda', 'Commissariat de Kolda', 'Kolda', false, 12.89, -14.94, 240, 11, 59],
  ['kaffrine', 'Kaffrine', 'Commissariat de Kaffrine', 'Kaffrine', false, 14.11, -15.55, 210, 10, 66],
  ['matam', 'Matam', 'Commissariat de Matam', 'Matam', false, 15.66, -13.25, 180, 9, 71],
  ['sedhiou', 'Sédhiou', 'Commissariat de Sédhiou', 'Sédhiou', false, 12.71, -15.56, 150, 8, 57],
  ['kedougou', 'Kédougou', 'Commissariat de Kédougou', 'Kédougou', false, 12.56, -12.18, 120, 7, 63],
] as const;

const INFRACTIONS = [
  ['INF-01', 'Excès de vitesse', 20000, 'gauge', 28],
  ['INF-02', 'Téléphone au volant', 10000, 'device-mobile', 19],
  ['INF-03', 'Stationnement interdit', 12000, 'traffic-cone', 17],
  ['INF-04', 'Feu rouge grillé', 15000, 'traffic-signal', 12],
  ['INF-05', 'Défaut de ceinture', 8000, 'seatbelt', 10],
  ['INF-06', 'Défaut de documents', 25000, 'file-text', 9],
  ['INF-07', 'Alcool au volant', 50000, 'beer-bottle', 3],
  ['INF-99', 'Autre infraction', 5000, 'pencil-simple', 2],
] as const;

const HOTSPOTS: Record<string, string[]> = {
  plateau: ['Marché Sandaga', 'Av. L. S. Senghor', 'Place de l’Indépendance', 'Av. Pompidou'],
  medina: ['Av. Blaise Diagne', 'Rond-point Médina', 'Rue 6 Médina'],
  parcelles: ['Rond-point Case-Bi', 'Unité 15 · Parcelles', 'Route de Cambérène'],
  pikine: ['Autoroute · sortie Pikine', 'Marché Zinc', 'Rond-point Pikine Icotaf'],
  guediawaye: ['Route de Golf', 'Marché Bou Bess', 'Rond-point Hamo'],
  grandyoff: ['Rond-point Liberté 6', 'VDN · Sacré-Cœur', 'Route du Front de Terre'],
  almadies: ['Corniche Ouest', 'Route des Almadies', 'Rond-point Ngor'],
  rufisque: ['Route nationale 1 · Rufisque', 'Centre-ville Rufisque', 'Marché Rufisque'],
};

const PRENOMS_H = ['Mamadou', 'Ibrahima', 'Cheikh', 'Moussa', 'Pape', 'Ousmane', 'Abdoulaye', 'Babacar', 'Serigne', 'Aliou', 'Modou', 'Assane', 'Lamine', 'Omar', 'Malick', 'Souleymane', 'Amadou', 'Idrissa', 'Mouhamed', 'Saliou'];
const PRENOMS_F = ['Fatou', 'Aminata', 'Awa', 'Mariama', 'Khady', 'Ndeye', 'Rokhaya', 'Seynabou', 'Aïssatou', 'Coumba', 'Adama', 'Astou', 'Binta', 'Dieynaba', 'Sokhna', 'Marième', 'Oumou', 'Yacine'];
const NOMS = ['Diallo', 'Sow', 'Ba', 'Fall', 'Diop', 'Mbaye', 'Gueye', 'Ndiaye', 'Seck', 'Cissé', 'Sarr', 'Faye', 'Kane', 'Sy', 'Thiam', 'Mbacké', 'Diouf', 'Niang', 'Dieng', 'Sène', 'Touré', 'Camara', 'Kébé', 'Sall', 'Wade', 'Ly', 'Diagne', 'Mané', 'Badji', 'Coly'];
const GRADES = [['Sergent', 30], ['Brigadier', 30], ['Adjudant', 15], ['Officier', 12], ['Lieutenant', 8], ['Capitaine', 5]] as const;
const MARQUES: [string, string[], VehicleType, number][] = [
  ['Toyota', ['Corolla', 'Hilux', 'Yaris', 'Land Cruiser', 'RAV4'], 'VP', 22],
  ['Peugeot', ['308', '208', '406', 'Partner', '3008'], 'VP', 14],
  ['Hyundai', ['Accent', 'H1', 'Tucson', 'i10'], 'VP', 11],
  ['Renault', ['Logan', 'Clio', 'Duster', 'Kangoo'], 'VP', 9],
  ['Yamaha', ['XTZ', 'Crypton', 'YBR 125'], 'Moto', 8],
  ['Kia', ['Picanto', 'Rio', 'Sportage'], 'VP', 6],
  ['Suzuki', ['Alto', 'Swift', 'Vitara'], 'VP', 5],
  ['Nissan', ['Almera', 'Navara', 'Patrol'], 'VP', 5],
  ['TVS', ['Apache', 'HLX 125'], 'Moto', 5],
  ['Jakarta', ['JK 125', 'Super'], 'Moto', 4],
  ['Mercedes', ['Actros', 'Sprinter', 'Classe C'], 'Camion', 4],
  ['Isuzu', ['NPR', 'D-Max'], 'Camion', 3],
  ['Tata', ['LPO 1618', 'Ultra'], 'Bus', 2],
  ['King Long', ['XMQ6', 'Minibus'], 'Bus', 2],
];
const COULEURS = ['Blanc', 'Gris', 'Noir', 'Bleu', 'Rouge', 'Jaune', 'Vert', 'Argent'];
const PLATE_PREFIX = ['DK', 'DK', 'DK', 'DK', 'AA', 'TH', 'SL', 'MB', 'ZG', 'KL'];
const MODES: [PaymentMode, number][] = [['wave', 44], ['orange_money', 31], ['especes', 19], ['carte', 6]];

const NOW = new Date();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const pad = (n: number, l: number) => String(n).padStart(l, '0');
const phone = () => `+221 ${pick(['77', '78', '76', '70'])} ${pad(Math.floor(rnd() * 1000), 3)} ${pad(Math.floor(rnd() * 100), 2)} ${pad(Math.floor(rnd() * 100), 2)}`;
const plate = () => `${pick(PLATE_PREFIX)}-${pad(1000 + Math.floor(rnd() * 9000), 4)}-${String.fromCharCode(65 + Math.floor(rnd() * 26))}${String.fromCharCode(65 + Math.floor(rnd() * 26))}`;
const cni = (i: number, female: boolean) => `${female ? 2 : 1} ${pad(1000 + Math.floor(rnd() * 9000), 4)} ${1960 + Math.floor(rnd() * 45)} ${pad(i % 100000, 5)}`;
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');

async function chunked<T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  console.log('→ Nettoyage');
  await prisma.$executeRawUnsafe(
    `TRUNCATE "PaymentAllocation","Payment","ContraventionItem","Contravention","Vehicle","OtpCode","UserAccount","Owner","Officer","Admin","Zone","InfractionType","Notification","AuditLog","Setting","Counter" CASCADE`,
  );
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Zones
  const zones = ZONES.map((z) => ({ id: randomUUID(), code: z[0], nom: z[1], commissariat: z[2], region: z[3], isDakar: z[4], lat: z[5], lng: z[6], monthly: z[7], officerCount: z[8], rate: z[9] / 100 }));
  await prisma.zone.createMany({ data: zones.map(({ monthly, officerCount, rate, ...z }) => z) });
  const zoneByCode = Object.fromEntries(zones.map((z) => [z.code, z]));

  // Barème
  const infTypes = INFRACTIONS.map((i) => ({ id: randomUUID(), code: i[0], libelle: i[1], montantDefaut: i[2], icone: i[3], weight: i[4] }));
  await prisma.infractionType.createMany({ data: infTypes.map(({ weight, ...t }) => t) });

  // Officiers : ceux des maquettes, puis effectif complet par zone
  console.log('→ Officiers');
  const named: [string, string, string, string, string, 'actif' | 'suspendu' | 'inactif', string][] = [
    ['Mamadou', 'Diallo', 'Sergent', 'PN-4471', 'plateau', 'actif', '+221 77 441 20 11'],
    ['Fatou', 'Sow', 'Brigadier', 'PN-3310', 'medina', 'actif', '+221 77 530 18 42'],
    ['Aliou', 'Ba', 'Officier', 'PN-2208', 'almadies', 'actif', '+221 78 220 61 09'],
    ['Ibrahima', 'Fall', 'Adjudant', 'PN-1987', 'pikine', 'actif', '+221 76 118 44 70'],
    ['Aminata', 'Diop', 'Sergent', 'PN-4520', 'parcelles', 'actif', '+221 77 902 33 15'],
    ['Cheikh', 'Mbaye', 'Brigadier', 'PN-3875', 'guediawaye', 'actif', '+221 70 645 12 88'],
    ['Moussa', 'Gueye', 'Lieutenant', 'PN-1204', 'grandyoff', 'actif', '+221 77 311 90 02'],
    ['Khady', 'Ndiaye', 'Sergent', 'PN-4602', 'rufisque', 'suspendu', '+221 78 404 27 63'],
    ['Pape', 'Seck', 'Brigadier', 'PN-3942', 'plateau', 'actif', '+221 76 870 55 31'],
    ['Seynabou', 'Cissé', 'Adjudant', 'PN-2051', 'medina', 'inactif', '+221 77 256 14 97'],
  ];
  const officers: Prisma.OfficerCreateManyInput[] = named.map(([prenom, nom, grade, matricule, zone, statut, tel]) => ({
    id: randomUUID(), prenom, nom, grade, matricule, zoneId: zoneByCode[zone].id, statut, telephone: tel,
    email: `${slug(prenom)}.${slug(nom)}@police.sn`, passwordHash: hash,
  }));
  const usedMat = new Set(officers.map((o) => o.matricule));
  for (const z of zones) {
    const already = officers.filter((o) => o.zoneId === z.id).length;
    for (let i = already; i < z.officerCount; i++) {
      const female = rnd() < 0.3;
      const prenom = pick(female ? PRENOMS_F : PRENOMS_H);
      const nom = pick(NOMS);
      let matricule: string;
      do matricule = `PN-${1000 + Math.floor(rnd() * 9000)}`; while (usedMat.has(matricule));
      usedMat.add(matricule);
      officers.push({
        id: randomUUID(), prenom, nom, grade: weighted(GRADES), matricule, zoneId: z.id,
        statut: rnd() < 0.03 ? 'suspendu' : rnd() < 0.03 ? 'inactif' : 'actif', telephone: phone(),
        email: `${slug(prenom)}.${slug(nom)}${i}@police.sn`, passwordHash: hash,
      });
    }
  }
  await prisma.officer.createMany({ data: officers });
  const officersByZone = new Map<string, string[]>();
  for (const o of officers) officersByZone.set(o.zoneId, [...(officersByZone.get(o.zoneId) ?? []), o.id!]);

  // Admins
  await prisma.admin.createMany({
    data: [
      { nom: 'Aïssatou Diagne', email: 'a.diagne@interieur.gouv.sn', role: 'super_admin', passwordHash: hash, lastLoginAt: addDays(NOW, -0.05) },
      { nom: 'Col. Mamadou Thiaw', email: 'm.thiaw@police.sn', role: 'commandant', zoneId: zoneByCode.plateau.id, passwordHash: hash, lastLoginAt: addDays(NOW, -0.1) },
      { nom: 'Ndèye Fatou Kébé', email: 'nf.kebe@tresor.gouv.sn', role: 'tresorier', passwordHash: hash, lastLoginAt: addDays(NOW, -0.6) },
      { nom: 'Lt. Omar Sall', email: 'o.sall@police.sn', role: 'superviseur', zoneId: zoneByCode.pikine.id, passwordHash: hash, lastLoginAt: addDays(NOW, -2) },
    ],
  });

  // Propriétaires et véhicules
  console.log('→ Propriétaires & véhicules');
  const QUARTIERS = ['Médina', 'Grand Yoff', 'Almadies', 'Pikine', 'Rufisque', 'Parcelles Assainies', 'Guédiawaye', 'Plateau', 'Mermoz', 'Ouakam', 'Yoff', 'HLM', 'Sicap Liberté', 'Point E', 'Thiaroye'];
  const owners: Prisma.OwnerCreateManyInput[] = [
    ['Ousmane', 'Ndiaye', '1 2345 1990 00123', '+221 77 123 45 67', 'Médina'],
    ['Awa', 'Sarr', '1 7654 1992 00456', '+221 78 456 78 90', 'Grand Yoff'],
    ['Mariama', 'Faye', '2 1098 1988 00871', '+221 76 332 10 45', 'Almadies'],
    ['Abdoulaye', 'Kane', '1 5521 1979 00312', '+221 77 820 64 13', 'Pikine'],
    ['Babacar', 'Sy', '1 8830 1983 00907', '+221 70 118 39 52', 'Rufisque'],
    ['Ndeye', 'Thiam', '2 4412 1995 00288', '+221 77 675 02 81', 'Parcelles Assainies'],
    ['Serigne', 'Mbacké', '1 3307 1976 00654', '+221 78 209 77 36', 'Guédiawaye'],
    ['Rokhaya', 'Diouf', '2 6190 1998 00123', '+221 76 540 81 29', 'Plateau'],
  ].map(([prenom, nom, c, tel, q]) => ({ id: randomUUID(), prenom, nom, cni: c, telephone: tel, quartier: q, adresse: `${q}, Dakar` }));
  const usedCni = new Set(owners.map((o) => o.cni));
  for (let i = 0; i < 30000; i++) {
    const female = rnd() < 0.4;
    let c: string;
    do c = cni(i, female); while (usedCni.has(c));
    usedCni.add(c);
    const q = pick(QUARTIERS);
    owners.push({ id: randomUUID(), prenom: pick(female ? PRENOMS_F : PRENOMS_H), nom: pick(NOMS), cni: c, telephone: phone(), quartier: q, adresse: `${q}, Dakar` });
  }
  await chunked(owners, 3000, (c) => prisma.owner.createMany({ data: c }));

  const docDate = (validRate: number) => (rnd() < validRate ? addDays(NOW, 20 + rnd() * 340) : addDays(NOW, -(5 + rnd() * 300)));
  const vehicles: Prisma.VehicleCreateManyInput[] = [
    ['DK-1234-AB', 'Toyota', 'Corolla', 'VP', 'Gris', 2018, 0, [1, 0, 1]],
    ['DK-5567-MT', 'Yamaha', 'XTZ', 'Moto', 'Noir', 2021, 0, [1, 1, 1]],
    ['DK-9087-ZX', 'Renault', 'Logan', 'VP', 'Blanc', 2020, 1, [1, 1, 1]],
    ['AA-882-GT', 'Peugeot', '308', 'VP', 'Bleu', 2019, 2, [1, 1, 1]],
    ['TH-4521-CD', 'Hyundai', 'H1', 'Bus', 'Blanc', 2016, 3, [0, 0, 1]],
    ['SL-1290-BK', 'Mercedes', 'Actros', 'Camion', 'Rouge', 2015, 4, [1, 0, 1]],
    ['MB-3344-AA', 'Kia', 'Picanto', 'VP', 'Jaune', 2022, 5, [1, 1, 1]],
    ['DK-7788-CV', 'Toyota', 'Hilux', 'VP', 'Gris', 2017, 6, [0, 1, 0]],
    ['DK-6612-BB', 'Suzuki', 'Alto', 'VP', 'Vert', 2020, 7, [1, 1, 1]],
    ['ZG-4410-CE', 'TVS', 'Apache', 'Moto', 'Noir', 2023, 2, [1, 0, 1]],
  ].map(([p, marque, modele, type, couleur, annee, oi, d]) => {
    const docs = d as number[];
    return {
      id: randomUUID(), plaque: p as string, marque: marque as string, modele: modele as string, type: type as VehicleType,
      couleur: couleur as string, annee: annee as number, ownerId: owners[oi as number].id!, carburant: type === 'Moto' ? 'Essence' : pick(['Essence', 'Diesel']),
      chassis: `VF${randomUUID().replace(/-/g, '').slice(0, 15).toUpperCase()}`,
      assuranceExp: docs[0] ? addDays(NOW, 120) : addDays(NOW, -40), visiteTechExp: docs[1] ? addDays(NOW, 200) : addDays(NOW, -25), carteGriseOk: !!docs[2],
      createdAt: addDays(NOW, -400),
    };
  });
  const usedPlates = new Set(vehicles.map((v) => v.plaque));
  for (let i = 0; i < 45000; i++) {
    const [marque, modeles, baseType, ] = weighted(MARQUES.map((m) => [m, m[3]] as const));
    let p: string;
    do p = plate(); while (usedPlates.has(p));
    usedPlates.add(p);
    vehicles.push({
      id: randomUUID(), plaque: p, marque, modele: pick(modeles), type: baseType, couleur: pick(COULEURS), annee: 2005 + Math.floor(rnd() * 20),
      carburant: baseType === 'Moto' ? 'Essence' : pick(['Essence', 'Diesel', 'Diesel', 'Hybride']),
      chassis: `VF${randomUUID().replace(/-/g, '').slice(0, 15).toUpperCase()}`,
      ownerId: owners[i < 700 ? 8 + i : Math.floor(rnd() * owners.length)].id!,
      assuranceExp: docDate(0.91), visiteTechExp: docDate(0.76), carteGriseOk: rnd() < 0.97,
      createdAt: addDays(NOW, -Math.floor(rnd() * 900)),
    });
  }
  await chunked(vehicles, 3000, (c) => prisma.vehicle.createMany({ data: c }));
  const plainVehicles = vehicles.slice(10);

  // Comptes Espace Usager (≈ 25 % des propriétaires)
  const accounts: Prisma.UserAccountCreateManyInput[] = [];
  owners.forEach((o, i) => {
    const demo = [0, 2, 4, 5, 7].includes(i);
    if (demo || (i >= 8 && rnd() < 0.25)) {
      accounts.push({
        id: randomUUID(), ownerId: o.id!, telephone: '+' + o.telephone.replace(/[^\d]/g, ''), passwordHash: hash,
        // Compte de démo Mariama Faye sans 2FA, Ousmane Ndiaye avec 2FA (OTP affiché dans la console API).
        twoFactor: i !== 2,
      });
    }
  });
  const seenPhones = new Set<string>();
  await prisma.userAccount.createMany({ data: accounts.filter((a) => !seenPhones.has(a.telephone) && seenPhones.add(a.telephone)) });

  // Contraventions sur 12 mois
  console.log('→ Contraventions & paiements (12 mois)');
  const growth = [52, 55, 61, 58, 54, 60, 63, 66, 64, 68, 67, 71.4].map((v) => v / 71.4);
  const contraventions: Prisma.ContraventionCreateManyInput[] = [];
  const items: Prisma.ContraventionItemCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const allocations: Prisma.PaymentAllocationCreateManyInput[] = [];
  const seq: Record<number, number> = {};
  const rcu: Record<number, number> = {};
  const nextNum = (store: Record<number, number>, prefix: string, d: Date) => {
    const y = d.getFullYear();
    store[y] = (store[y] ?? 0) + 1;
    return `${prefix}-${y}-${pad(store[y], 5)}`;
  };
  const events: { date: Date; zone: (typeof zones)[number] }[] = [];
  const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
  for (let m = 11; m >= 0; m--) {
    const start = new Date(monthStart.getFullYear(), monthStart.getMonth() - m, 1);
    const end = m === 0 ? NOW : new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const days = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
    for (const z of zones) {
      // Les mois passés suivent la courbe de croissance des maquettes (émis sur 12 mois).
      const n = Math.round(z.monthly * growth[11 - m] * (0.94 + rnd() * 0.12));
      for (let i = 0; i < n; i++) {
        let d: Date;
        do {
          d = new Date(start.getTime() + rnd() * days * 86400000);
          d.setHours(7 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
        } while (d > NOW || (d.getDay() % 6 === 0 && rnd() < 0.3));
        events.push({ date: d, zone: z });
      }
    }
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const { date, zone } of events) {
    const id = randomUUID();
    const pool = officersByZone.get(zone.id)!;
    const officerId = pick(pool);
    const types = [weighted(infTypes.map((t) => [t, t.weight] as const))];
    if (rnd() < 0.08) {
      const extra = weighted(infTypes.map((t) => [t, t.weight] as const));
      if (extra.id !== types[0].id) types.push(extra);
    }
    const total = types.reduce((a, t) => a + t.montantDefaut, 0);
    const vehicle = rnd() < 0.0004 ? pick(vehicles.slice(0, 10)) : pick(plainVehicles);
    const lieu = zone.isDakar ? pick(HOTSPOTS[zone.code]) : pick([`Centre-ville ${zone.nom}`, `Route nationale · ${zone.nom}`, `Gare routière ${zone.nom}`, `Marché central ${zone.nom}`]);

    // Paiement : probabilité liée au taux de recouvrement de la zone, délai moyen ≈ 3 jours
    let paid = 0;
    const r = rnd();
    let payDate = new Date(date.getTime() + -Math.log(1 - rnd()) * 3.2 * 86400000);
    if (payDate <= NOW) {
      if (r < zone.rate * 0.93) paid = total;
      else if (r < zone.rate * 0.93 + 0.07) paid = Math.round(total / 2 / 500) * 500;
    }
    // Régularisations tardives (relances SMS, contrôles) : d'autant plus fréquentes que la zone recouvre bien.
    if (paid === 0 && rnd() < Math.max(0.05, (zone.rate - 0.55) * 1.6)) {
      const late = new Date(date.getTime() + (14 + rnd() * 56) * 86400000);
      if (late <= NOW) {
        paid = total;
        payDate = late;
      }
    }
    const statut = paid >= total ? 'payee' : paid > 0 ? 'partielle' : rnd() < 0.012 ? 'annulee' : 'impayee';
    if (statut === 'annulee') paid = 0;

    contraventions.push({
      id, numero: nextNum(seq, 'CNT', date), vehicleId: vehicle.id!, officerId, zoneId: zone.id, montantTotal: total, montantPaye: paid,
      lieuTexte: lieu, lat: zone.lat + (rnd() - 0.5) * 0.03, lng: zone.lng + (rnd() - 0.5) * 0.03, dateHeure: date, statut, canal: 'mobile', createdAt: date,
    });
    for (const t of types) items.push({ id: randomUUID(), contraventionId: id, infractionTypeId: t.id, montant: t.montantDefaut });

    if (paid > 0) {
      const mode = weighted(MODES);
      const mobile = mode === 'wave' || mode === 'orange_money';
      const byUser = mobile && rnd() < 0.6;
      const pid = randomUUID();
      payments.push({
        id: pid, numeroRecu: nextNum(rcu, 'RCU', payDate), mode, montant: paid, dateHeure: payDate, statut: 'confirme',
        canal: byUser ? 'usager' : 'officer', officerId: byUser ? null : officerId, ownerId: vehicle.ownerId,
        referenceExterne: mode === 'especes' ? null : `${mode === 'wave' ? 'WV' : mode === 'orange_money' ? 'OM' : 'TPE'}-${randomUUID().slice(0, 8).toUpperCase()}`,
        createdAt: payDate,
      });
      allocations.push({ paymentId: pid, contraventionId: id, montant: paid });
    }
  }
  await chunked(contraventions, 2500, (c) => prisma.contravention.createMany({ data: c }));
  await chunked(items, 5000, (c) => prisma.contraventionItem.createMany({ data: c }));
  payments.sort((a, b) => +new Date(a.dateHeure!) - +new Date(b.dateHeure!));
  await chunked(payments, 2500, (c) => prisma.payment.createMany({ data: c }));
  await chunked(allocations, 5000, (c) => prisma.paymentAllocation.createMany({ data: c }));
  await prisma.counter.createMany({
    data: [
      ...Object.entries(seq).map(([y, v]) => ({ key: `CNT-${y}`, value: v })),
      ...Object.entries(rcu).map(([y, v]) => ({ key: `RCU-${y}`, value: v })),
    ],
  });

  // Notifications de démo
  const admins = await prisma.admin.findMany();
  const diallo = officers[0].id!;
  const ousmane = await prisma.userAccount.findUnique({ where: { ownerId: owners[0].id! } });
  await prisma.notification.createMany({
    data: [
      ...admins.flatMap((a) => [
        { destinataireType: 'admin' as const, destinataireId: a.id, type: 'vehicule_signale', titre: 'Véhicule signalé', corps: 'DK-7788-CV · document falsifié suspecté', createdAt: addDays(NOW, -0.1) },
        { destinataireType: 'admin' as const, destinataireId: a.id, type: 'caisse', titre: 'Écart de caisse', corps: 'Zone Rufisque · 12 000 F à justifier', createdAt: addDays(NOW, -0.3) },
        { destinataireType: 'admin' as const, destinataireId: a.id, type: 'vehicule_signale', titre: 'Véhicule signalé', corps: 'TH-4521-CD · visite technique falsifiée', createdAt: addDays(NOW, -0.5) },
      ]),
      { destinataireType: 'officer', destinataireId: diallo, type: 'objectif', titre: 'Objectif du jour', corps: '12 / 15 contraventions · bonne progression', createdAt: addDays(NOW, -0.04) },
      { destinataireType: 'officer', destinataireId: diallo, type: 'directive', titre: 'Directive brigade', corps: 'Contrôle renforcé Corniche ce week-end', lu: true, createdAt: addDays(NOW, -2) },
      ...(ousmane
        ? [
            { destinataireType: 'user' as const, destinataireId: ousmane.id, type: 'document', titre: 'Document à renouveler', corps: 'Visite technique expirée · DK-1234-AB', createdAt: addDays(NOW, -3) },
            { destinataireType: 'user' as const, destinataireId: ousmane.id, type: 'rappel', titre: 'Rappel de paiement', corps: 'Pensez à régler vos amendes sous 15 jours', lu: true, createdAt: addDays(NOW, -5) },
          ]
        : []),
    ],
  });

  // Pour la démo : deux amendes impayées récentes sur le véhicule d'Ousmane Ndiaye
  const vit = infTypes[0];
  const sta = infTypes[2];
  for (const [t, days, statut, paye, lieu] of [
    [vit, -0.1, 'impayee', 0, 'Av. L. S. Senghor'],
    [sta, -4, 'partielle', 6000, 'Marché Sandaga'],
  ] as const) {
    const d = addDays(NOW, days);
    const c = await prisma.contravention.create({
      data: {
        numero: `CNT-${d.getFullYear()}-${pad(++seq[d.getFullYear()], 5)}`, vehicleId: vehicles[0].id!, officerId: officers[0].id, zoneId: zoneByCode.plateau.id,
        montantTotal: t.montantDefaut, montantPaye: paye, lieuTexte: lieu, lat: 14.6708, lng: -17.4381, dateHeure: d, statut, canal: 'mobile',
        items: { create: [{ infractionTypeId: t.id, montant: t.montantDefaut }] },
      },
    });
    if (paye) {
      await prisma.payment.create({
        data: {
          numeroRecu: `RCU-${d.getFullYear()}-${pad(++rcu[d.getFullYear()], 5)}`, mode: 'especes', montant: paye, statut: 'confirme', canal: 'officer',
          officerId: officers[1].id, ownerId: owners[0].id, dateHeure: d, allocations: { create: [{ contraventionId: c.id, montant: paye }] },
        },
      });
    }
  }
  for (const [k, v] of Object.entries(seq)) await prisma.counter.update({ where: { key: `CNT-${k}` }, data: { value: v } });
  for (const [k, v] of Object.entries(rcu)) await prisma.counter.update({ where: { key: `RCU-${k}` }, data: { value: v } });

  console.log(`✔ ${zones.length} zones · ${officers.length} officiers · ${owners.length} propriétaires · ${vehicles.length} véhicules`);
  console.log(`✔ ${contraventions.length + 2} contraventions · ${payments.length + 1} paiements · ${accounts.length} comptes usagers`);
  console.log(`\nComptes de démo (mot de passe « ${PASSWORD} ») :`);
  console.log('  Admin Web  : a.diagne@interieur.gouv.sn (Super Admin) · m.thiaw@police.sn (Commandant Plateau)');
  console.log('               nf.kebe@tresor.gouv.sn (Trésorier) · o.sall@police.sn (Superviseur Pikine)');
  console.log('  Officier   : PN-4471 (Sgt. Mamadou Diallo) · PN-4602 = suspendu (test HTTP 423)');
  console.log('  Usager     : +221 76 332 10 45 (Mariama Faye, sans 2FA) · +221 77 123 45 67 (Ousmane Ndiaye, OTP en console)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

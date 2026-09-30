export type Statut = 'impayee' | 'partielle' | 'payee' | 'annulee';
export type AdminRole = 'super_admin' | 'commandant' | 'tresorier' | 'superviseur';
export type PaymentMode = 'wave' | 'orange_money' | 'especes' | 'carte';
export type VehicleType = 'VP' | 'Moto' | 'Camion' | 'Bus';

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface Me {
  kind: 'admin';
  id: string;
  nom: string;
  email: string;
  role: AdminRole;
  zone: { id: string; nom: string } | null;
}

export interface Contravention {
  id: string;
  numero: string;
  dateHeure: string;
  plaque: string;
  vehicule: string;
  proprietaire: string;
  infraction: string;
  items: { infractionTypeId: string; code: string; libelle: string; icone: string; montant: number }[];
  officierId: string | null;
  officier: string | null;
  zoneId: string;
  zone: string;
  montantTotal: number;
  montantPaye: number;
  resteAPayer: number;
  statut: Statut;
  canal: 'mobile' | 'admin';
  lieuTexte: string | null;
  lat: number | null;
  lng: number | null;
  photoPreuveUrl: string | null;
  notes: string | null;
}

export interface ContraventionDetail extends Contravention {
  /** Amende d'une autre zone consultée par un admin de zone : lecture seule */
  horsZone?: boolean;
  paiements: { numeroRecu: string; mode: PaymentMode; dateHeure: string; montant: number; canal: string }[];
}

export interface Payment {
  id: string;
  numeroRecu: string | null;
  mode: PaymentMode;
  montant: number;
  statut: string;
  canal: 'officer' | 'usager' | 'admin';
  dateHeure: string;
  plaque: string | null;
  encaissePar: string;
  allocations: { contraventionId: string; numero: string; montant: number }[];
}

export interface Zone {
  id: string;
  code: string;
  nom: string;
  commissariat: string;
  region: string;
  isDakar: boolean;
  lat: number;
  lng: number;
  officiers: number;
  amendesMois: number;
  encaisseMois: number;
  tauxRecouvrement: number;
}

export interface InfractionType {
  id: string;
  code: string;
  libelle: string;
  montantDefaut: number;
  icone: string;
  actif: boolean;
  emisesMois: number;
  recettesMois: number;
}

export interface OfficerRow {
  id: string;
  nomComplet: string;
  prenom: string;
  nom: string;
  grade: string;
  matricule: string;
  email: string | null;
  telephone: string | null;
  zoneId: string;
  zone: string;
  statut: 'actif' | 'suspendu' | 'inactif';
  amendes: number;
  collecte: number;
  suspensionMotif: string | null;
}

export interface OfficerDetail extends OfficerRow {
  suspendedAt: string | null;
  suspendedBy: string | null;
  zoneNom: string;
  paiements: number;
  activite: { mois: string; count: number }[];
  recentes: Contravention[];
}

export interface OwnerRow {
  id: string;
  nomComplet: string;
  cni: string;
  telephone: string;
  quartier: string | null;
  vehicules: number;
  amendes: number;
  du: number;
  compteApp: boolean;
}

export interface OwnerDetail extends Omit<OwnerRow, 'vehicules'> {
  adresse: string | null;
  email: string | null;
  vehicules: { plaque: string; libelle: string; type: VehicleType; documentsOk: boolean }[];
  contraventions: Contravention[];
}

export interface VehicleDoc {
  code: 'ASS' | 'VT' | 'CG';
  label: string;
  ok: boolean;
  expiration: string | null;
}

export interface VehicleRow {
  id: string;
  plaque: string;
  marque: string;
  modele: string;
  couleur: string | null;
  annee: number | null;
  type: VehicleType;
  typeLabel: string;
  proprietaire: string;
  ownerId: string;
  contraventions: number;
  documents: VehicleDoc[];
  alerte: boolean;
}

export interface VehicleDetail {
  id: string;
  plaque: string;
  marque: string;
  modele: string;
  couleur: string | null;
  annee: number | null;
  type: VehicleType;
  flagged: boolean;
  flagReason: string | null;
  alerte: boolean;
  documents: VehicleDoc[];
  proprietaire: { id: string; prenom: string; nom: string; cni: string; telephone: string; quartier: string | null; hasAppAccount: boolean };
  totalDu: number;
  historique: Contravention[];
}

export interface AdminRow {
  id: string;
  nom: string;
  email: string;
  role: AdminRole;
  perimetre: string;
  statut: 'actif' | 'en_attente' | 'revoque';
  lastLoginAt: string | null;
}

export interface Settings {
  institution: string;
  devise: string;
  dateFormat: string;
  autoBackup: boolean;
  smsTemplate: string;
  delaiPaiementJours: number;
  objectifRecouvrement: number;
}

export interface Notification {
  id: string;
  type: string;
  titre: string;
  corps: string;
  lu: boolean;
  createdAt: string;
}

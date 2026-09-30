import type { AdminRole } from './types';

export type PageId =
  | 'dashboard'
  | 'contraventions'
  | 'tresor'
  | 'officiers'
  | 'usagers'
  | 'vehicules'
  | 'infractions'
  | 'zones'
  | 'parametres';

/** Pages visibles par rôle (README · RBAC). Le filtrage réel est fait côté API. */
export const PAGES_BY_ROLE: Record<AdminRole, PageId[]> = {
  super_admin: ['dashboard', 'contraventions', 'tresor', 'officiers', 'usagers', 'vehicules', 'infractions', 'zones', 'parametres'],
  tresorier: ['dashboard', 'contraventions', 'tresor', 'usagers'],
  commandant: ['dashboard', 'contraventions', 'officiers', 'usagers', 'vehicules', 'zones'],
  superviseur: ['dashboard', 'contraventions', 'officiers', 'usagers', 'vehicules', 'zones'],
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  commandant: 'Commandant',
  tresorier: 'Trésorier',
  superviseur: 'Superviseur',
};

export const ROLE_COLORS: Record<AdminRole, [string, string]> = {
  super_admin: ['#0E6B47', '#E1F2E9'],
  commandant: ['#1B6FB8', '#E4F0FA'],
  tresorier: ['#B4701A', '#FBF0DF'],
  superviseur: ['#4F6358', '#EEF2EF'],
};

export const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Tableau de bord',
  contraventions: 'Contraventions',
  tresor: 'Paiements & Trésor',
  officiers: 'Officiers',
  usagers: 'Usagers',
  vehicules: 'Véhicules',
  infractions: 'Infractions & montants',
  zones: 'Zones & commissariats',
  parametres: 'Admins & paramètres',
};

/** Droits d'action fins, alignés sur les @Roles de l'API. */
export function can(role: AdminRole | undefined, action: 'write' | 'emit' | 'collect' | 'manageOfficers' | 'remind' | 'flag') {
  if (!role) return false;
  if (role === 'super_admin') return true;
  switch (action) {
    case 'write':
      return role !== 'superviseur';
    case 'emit':
    case 'manageOfficers':
    case 'flag':
      return role === 'commandant';
    case 'collect':
    case 'remind':
      return role === 'commandant' || role === 'tresorier';
  }
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateContraventionDto {
  /** Plaque du véhicule (ex. DK-1234-AB). Le véhicule doit exister ou avoir été enrôlé. */
  @IsString() @IsNotEmpty() plaque: string;
  /** Identifiants des infractions constatées (multi-sélection) */
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) infractionTypeIds: string[];
  /** Zone : déduite de l'officier si absente */
  @IsOptional() @IsString() zoneId?: string;
  /** Officier verbalisateur (saisie admin uniquement ; côté mobile = l'officier connecté) */
  @IsOptional() @IsString() officerId?: string;
  @IsOptional() @IsString() lieuTexte?: string;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  /** Horodatage du constat (utile en mode hors-ligne). Par défaut : maintenant. */
  @IsOptional() @IsDateString() dateHeure?: string;
  /** URL de la photo preuve renvoyée par POST /uploads */
  @IsOptional() @IsString() photoPreuveUrl?: string;
  @IsOptional() @IsString() notes?: string;
  /** UUID généré par le terminal pour la synchronisation hors-ligne (idempotence) */
  @IsOptional() @IsUUID() clientUuid?: string;
}

export class UpdateContraventionDto {
  @IsOptional() @IsString() lieuTexte?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() zoneId?: string;
}

export class ListContraventionsQuery {
  /** Recherche : N°, plaque ou nom d'officier */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['impayee', 'partielle', 'payee', 'annulee']) statut?: string;
  @IsOptional() @IsString() zone_id?: string;
  @IsOptional() @IsString() officer_id?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() per_page?: string;
}

export class ContraventionItemDto {
  infractionTypeId: string;
  code: string;
  libelle: string;
  icone: string;
  montant: number;
}

export class ContraventionDto {
  id: string;
  numero: string;
  dateHeure: Date;
  plaque: string;
  vehicule: string;
  proprietaire: string;
  infraction: string;
  items: ContraventionItemDto[];
  officierId: string | null;
  officier: string | null;
  zoneId: string;
  zone: string;
  montantTotal: number;
  montantPaye: number;
  resteAPayer: number;
  statut: 'impayee' | 'partielle' | 'payee' | 'annulee';
  canal: 'mobile' | 'admin';
  lieuTexte: string | null;
  lat: number | null;
  lng: number | null;
  photoPreuveUrl: string | null;
  notes: string | null;
  /** Contenu à encoder dans le QR code de l'avis */
  qrPayload: string;
}

export class ContraventionPageDto {
  data: ContraventionDto[];
  total: number;
  page: number;
  perPage: number;
}

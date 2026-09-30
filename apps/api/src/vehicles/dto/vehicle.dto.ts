import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ContraventionDto } from '../../contraventions/dto/contravention.dto';

export class OwnerInputDto {
  @IsString() @IsNotEmpty() prenom: string;
  @IsString() @IsNotEmpty() nom: string;
  /** Si un propriétaire avec cette CNI existe déjà, il est réutilisé. */
  @IsString() @IsNotEmpty() cni: string;
  @IsString() @IsNotEmpty() telephone: string;
  @IsOptional() @IsString() adresse?: string;
  @IsOptional() @IsString() quartier?: string;
  @IsOptional() @IsString() email?: string;
  /** URL de la photo de la CNI (POST /uploads) */
  @IsOptional() @IsString() photoCniUrl?: string;
}

export class CreateVehicleDto {
  @IsString() @IsNotEmpty() plaque: string;
  @IsString() @IsNotEmpty() marque: string;
  @IsString() @IsNotEmpty() modele: string;
  @IsOptional() @IsString() couleur?: string;
  @IsOptional() @IsInt() annee?: number;
  @IsIn(['VP', 'Moto', 'Camion', 'Bus']) type: 'VP' | 'Moto' | 'Camion' | 'Bus';
  @IsOptional() @IsString() carburant?: string;
  @IsOptional() @IsString() chassis?: string;
  @IsOptional() @IsDateString() assuranceExp?: string;
  @IsOptional() @IsDateString() visiteTechExp?: string;
  @IsOptional() @IsBoolean() carteGriseOk?: boolean;
  /** Propriétaire existant… */
  @IsOptional() @IsString() ownerId?: string;
  /** …ou nouveau propriétaire (enrôlement terrain, étape 2) */
  @IsOptional() @ValidateNested() @Type(() => OwnerInputDto) owner?: OwnerInputDto;
}

export class FlagVehicleDto {
  @IsOptional() @IsString() reason?: string;
}

export class VehicleDocumentDto {
  code: 'ASS' | 'VT' | 'CG';
  label: string;
  ok: boolean;
  expiration: Date | null;
}

export class OwnerSummaryDto {
  id: string;
  prenom: string;
  nom: string;
  cni: string;
  telephone: string;
  quartier: string | null;
  hasAppAccount: boolean;
}

export class VehicleDetailDto {
  id: string;
  plaque: string;
  marque: string;
  modele: string;
  couleur: string | null;
  annee: number | null;
  type: 'VP' | 'Moto' | 'Camion' | 'Bus';
  carburant: string | null;
  chassis: string | null;
  flagged: boolean;
  flagReason: string | null;
  /** Document expiré, amende impayée ou véhicule signalé */
  alerte: boolean;
  documents: VehicleDocumentDto[];
  proprietaire: OwnerSummaryDto;
  /** Somme restant due sur les amendes impayées / partielles */
  totalDu: number;
  impayees: ContraventionDto[];
  historique: ContraventionDto[];
}

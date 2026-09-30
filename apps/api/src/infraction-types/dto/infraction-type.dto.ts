import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateInfractionTypeDto {
  @IsString() @IsNotEmpty() libelle: string;
  /** Montant par défaut en FCFA */
  @IsInt() @Min(0) montantDefaut: number;
  /** Nom d'icône Phosphor (ex. gauge, traffic-signal) */
  @IsOptional() @IsString() icone?: string;
}

export class UpdateInfractionTypeDto {
  @IsOptional() @IsString() @IsNotEmpty() libelle?: string;
  @IsOptional() @IsInt() @Min(0) montantDefaut?: number;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() icone?: string;
}

export class InfractionTypeDto {
  id: string;
  code: string;
  libelle: string;
  montantDefaut: number;
  icone: string;
  actif: boolean;
  updatedAt: Date;
}

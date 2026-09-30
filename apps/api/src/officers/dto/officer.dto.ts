import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const GRADES = ['Sergent', 'Brigadier', 'Officier', 'Adjudant', 'Lieutenant', 'Capitaine', 'Commissaire'];

export class CreateOfficerDto {
  @IsString() @IsNotEmpty() prenom: string;
  @IsString() @IsNotEmpty() nom: string;
  @IsString() @IsNotEmpty() matricule: string;
  @IsIn(GRADES) grade: string;
  @IsString() @IsNotEmpty() zoneId: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsEmail() email?: string;
  /** Mot de passe initial. Si absent, un mot de passe est généré et envoyé par SMS. */
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

export class UpdateOfficerDto {
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsIn(GRADES) grade?: string;
  @IsOptional() @IsString() zoneId?: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class SuspendOfficerDto {
  /** Motif obligatoire (motif prédéfini ou texte libre), conservé dans la fiche et le journal d'audit */
  @IsString({ message: 'Le motif de suspension est obligatoire' })
  @MinLength(3, { message: 'Le motif de suspension est obligatoire (3 caractères minimum)' })
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères' })
  motif: string;
}

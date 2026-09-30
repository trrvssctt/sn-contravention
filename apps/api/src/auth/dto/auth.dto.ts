import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class OfficerLoginDto {
  /** Matricule de l'agent, ex. PN-4471 */
  @IsString() @IsNotEmpty() matricule: string;
  @IsString() @IsNotEmpty() password: string;
}

export class AdminLoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() password: string;
}

export class UserLoginDto {
  /** Téléphone au format +221XXXXXXXXX (espaces tolérés) */
  @IsString() @IsNotEmpty() telephone: string;
  @IsString() @IsNotEmpty() password: string;
}

export class UserRegisterDto {
  /** Numéro de CNI du propriétaire tel qu'enregistré au fichier national */
  @IsString() @IsNotEmpty() cni: string;
  @IsString() @IsNotEmpty() telephone: string;
  @IsString() @MinLength(8) password: string;
}

export class VerifyOtpDto {
  @IsString() @IsNotEmpty() challengeId: string;
  @IsString() @Length(6, 6) code: string;
}

export class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}

export class ActivateAdminDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(8) password: string;
}

export class TokensDto {
  accessToken: string;
  refreshToken: string;
  /** Durée de validité du jeton d'accès, en secondes */
  expiresIn: number;
  kind: 'admin' | 'officer' | 'user';
}

export class OtpChallengeDto {
  otpRequired: true;
  challengeId: string;
  /** Téléphone masqué, ex. +221 77 *** ** 67 */
  maskedPhone: string;
}

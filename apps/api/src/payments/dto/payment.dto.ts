import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export type PaymentModeValue = 'especes' | 'wave' | 'orange_money' | 'carte';

export class RecordPaymentDto {
  /** Contraventions réglées (N° CNT-… ou identifiants) */
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) contraventions: string[];
  @IsIn(['especes', 'wave', 'orange_money', 'carte']) mode: PaymentModeValue;
  /** Montant encaissé. Par défaut : le reste dû total (paiement partiel si inférieur). */
  @IsOptional() @IsInt() @Min(1) montant?: number;
  /** Référence de transaction Wave / OM / TPE */
  @IsOptional() @IsString() referenceExterne?: string;
}

export class MarkPaidDto {
  @IsOptional() @IsIn(['especes', 'wave', 'orange_money', 'carte']) mode?: PaymentModeValue;
  @IsOptional() @IsString() referenceExterne?: string;
}

export class CreateIntentDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) contraventions: string[];
  @IsIn(['wave', 'orange_money']) provider: 'wave' | 'orange_money';
}

export class PaymentAllocationDto {
  contraventionId: string;
  numero: string;
  montant: number;
}

export class PaymentDto {
  id: string;
  /** N° de reçu RCU-AAAA-NNNNN (null tant que le paiement n'est pas confirmé) */
  numeroRecu: string | null;
  mode: PaymentModeValue;
  montant: number;
  statut: 'en_attente' | 'confirme' | 'echoue';
  canal: 'officer' | 'usager' | 'admin';
  dateHeure: Date;
  referenceExterne: string | null;
  plaque: string | null;
  encaissePar: string;
  allocations: PaymentAllocationDto[];
}

export class PaymentIntentDto extends PaymentDto {
  /** URL de paiement à ouvrir (Wave : lien de checkout ; OM : page de validation USSD) */
  checkoutUrl: string;
}

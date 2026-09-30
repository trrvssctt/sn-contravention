import { CreditCard, DeviceMobile, Icon, Money, WaveSine } from '@phosphor-icons/react';
import type { PaymentMode } from './types';

/** Couleurs opérateurs des maquettes : Wave #1DC8F0, Orange Money #FF7900. */
export const MODES: Record<PaymentMode, { label: string; color: string; icon: Icon }> = {
  wave: { label: 'Wave', color: '#1DC8F0', icon: WaveSine },
  orange_money: { label: 'Orange Money', color: '#FF7900', icon: DeviceMobile },
  especes: { label: 'Espèces', color: '#16A86E', icon: Money },
  carte: { label: 'Carte bancaire', color: '#0E6B47', icon: CreditCard },
};

import {
  BeerBottle,
  DeviceMobile,
  FileText,
  Gauge,
  Icon,
  PencilSimple,
  Seatbelt,
  TrafficCone,
  TrafficSignal,
  Warning,
} from '@phosphor-icons/react';

/** Icônes Phosphor du barème (champ `icone` renvoyé par l'API). */
const ICONS: Record<string, Icon> = {
  gauge: Gauge,
  'device-mobile': DeviceMobile,
  'traffic-cone': TrafficCone,
  'traffic-signal': TrafficSignal,
  seatbelt: Seatbelt,
  'file-text': FileText,
  'beer-bottle': BeerBottle,
  'pencil-simple': PencilSimple,
};

export const infractionIcon = (name: string): Icon => ICONS[name] ?? Warning;

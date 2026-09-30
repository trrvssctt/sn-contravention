import { Bus, CarProfile, Motorcycle, Truck } from '@phosphor-icons/react';
import type { VehicleType } from '@/lib/types';

export function vehicleIcon(t: VehicleType) {
  return { VP: CarProfile, Moto: Motorcycle, Camion: Truck, Bus }[t] ?? CarProfile;
}

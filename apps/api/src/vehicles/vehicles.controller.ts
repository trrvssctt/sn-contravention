import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Allow, CurrentActor, Roles } from '../common/auth.decorators';
import { CreateVehicleDto, FlagVehicleDto, VehicleDetailDto } from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('Véhicules')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private svc: VehiclesService) {}

  @Roles('commandant', 'superviseur') @Get()
  list(@Query() q: { q?: string; filter?: 'all' | 'alert' | 'ok'; page?: string; per_page?: string }) {
    return this.svc.list(q);
  }

  @Roles('commandant', 'superviseur') @Get('stats')
  stats() {
    return this.svc.stats();
  }

  /** Recherche par plaque (scan OCR). 404 → proposer l'enrôlement. */
  @Allow('admin', 'officer') @Get(':plate')
  @ApiOkResponse({ type: VehicleDetailDto })
  detail(@Param('plate') plate: string) {
    return this.svc.detail(plate);
  }

  /** Enrôlement véhicule + propriétaire (App Officier) ou enregistrement admin. */
  @Allow('admin', 'officer') @Roles('commandant') @Post()
  @ApiOkResponse({ type: VehicleDetailDto })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateVehicleDto) {
    return this.svc.create(actor, dto);
  }

  @Roles('commandant') @Post(':plate/flag')
  flag(@CurrentActor() actor: Actor, @Param('plate') plate: string, @Body() dto: FlagVehicleDto) {
    return this.svc.flag(actor, plate, dto.reason);
  }
}

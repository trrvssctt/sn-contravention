import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AdminsController } from './admins/admins.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './common/auth.guard';
import { AuditService, NotifyService, NumberingService, SettingsStore, SmsService } from './common/common.services';
import { ContraventionsController } from './contraventions/contraventions.controller';
import { ContraventionsService } from './contraventions/contraventions.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DevController } from './dev/dev.controller';
import { ExportsController } from './exports/exports.controller';
import { FinanceController, FinanceService } from './finance/finance.controller';
import { InfractionTypesController } from './infraction-types/infraction-types.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { OfficerAppController } from './officer-app/officer-app.controller';
import { OfficersController } from './officers/officers.controller';
import { OwnersController } from './owners/owners.controller';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PrismaModule } from './prisma/prisma.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { UPLOAD_DIR, UploadsController } from './uploads/uploads.controller';
import { UserAppController } from './user-app/user-app.controller';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { ZonesController } from './zones/zones.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET ?? 'dev-change-me-access' }),
    ServeStaticModule.forRoot({ rootPath: UPLOAD_DIR, serveRoot: '/uploads' }),
    PrismaModule,
  ],
  controllers: [
    AuthController,
    DashboardController,
    ContraventionsController,
    PaymentsController,
    FinanceController,
    OfficersController,
    OwnersController,
    VehiclesController,
    InfractionTypesController,
    ZonesController,
    AdminsController,
    NotificationsController,
    UploadsController,
    ExportsController,
    OfficerAppController,
    UserAppController,
    DevController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    RealtimeGateway,
    AuthService,
    ContraventionsService,
    PaymentsService,
    VehiclesService,
    FinanceService,
    NumberingService,
    SettingsStore,
    SmsService,
    AuditService,
    NotifyService,
  ],
})
export class AppModule {}

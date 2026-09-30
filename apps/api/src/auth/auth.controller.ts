import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, getSchemaPath, ApiExtraModels } from '@nestjs/swagger';
import { Actor, Allow, CurrentActor, Public } from '../common/auth.decorators';
import { AuthService } from './auth.service';
import {
  ActivateAdminDto,
  AdminLoginDto,
  OfficerLoginDto,
  OtpChallengeDto,
  RefreshDto,
  TokensDto,
  UserLoginDto,
  UserRegisterDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@ApiExtraModels(TokensDto, OtpChallengeDto)
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** Connexion App Officier (matricule + mot de passe). HTTP 423 si l'agent est suspendu. */
  @Public() @Post('officer/login') @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  officerLogin(@Body() dto: OfficerLoginDto) {
    return this.auth.officerLogin(dto.matricule, dto.password);
  }

  /** Connexion Espace Usager. Si la 2FA est active, renvoie un défi OTP (SMS) à valider via /auth/user/verify-otp. */
  @Public() @Post('user/login') @HttpCode(200)
  @ApiOkResponse({ schema: { oneOf: [{ $ref: getSchemaPath(TokensDto) }, { $ref: getSchemaPath(OtpChallengeDto) }] } })
  userLogin(@Body() dto: UserLoginDto) {
    return this.auth.userLogin(dto.telephone, dto.password);
  }

  /** Création de compte usager : lie le compte au propriétaire (CNI + téléphone), puis OTP SMS. */
  @Public() @Post('user/register')
  @ApiOkResponse({ type: OtpChallengeDto })
  userRegister(@Body() dto: UserRegisterDto) {
    return this.auth.userRegister(dto.cni, dto.telephone, dto.password);
  }

  @Public() @Post('user/verify-otp') @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.challengeId, dto.code);
  }

  @Public() @Post('admin/login') @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto.email, dto.password);
  }

  /** Activation d'un compte admin invité (lien reçu par email). */
  @Public() @Post('admin/activate') @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  activate(@Body() dto: ActivateAdminDto) {
    return this.auth.activateAdmin(dto.token, dto.password);
  }

  /** Renouvelle la paire de jetons (tous profils). */
  @Public() @Post('refresh') @HttpCode(200)
  @ApiOkResponse({ type: TokensDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Profil de l'acteur connecté. */
  @ApiBearerAuth() @Allow('admin', 'officer', 'user') @Get('me')
  me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor);
  }
}

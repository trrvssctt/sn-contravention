import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Actor, Allow, CurrentActor } from '../common/auth.decorators';
import { paginate } from '../common/common.services';
import { PrismaService } from '../prisma/prisma.service';

/** Notifications de l'acteur connecté (admin, officier ou usager). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Allow('admin', 'officer', 'user')
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  private mine(actor: Actor) {
    return { destinataireType: actor.kind as ActorType, destinataireId: actor.id };
  }

  @Get()
  async list(@CurrentActor() actor: Actor, @Query() q: { page?: string; per_page?: string }) {
    const { page, perPage, skip, take } = paginate(q.page, q.per_page, 50);
    const where = this.mine(actor);
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, lu: false } }),
    ]);
    return { data, total, unread, page, perPage };
  }

  @Patch(':id/read')
  async read(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, ...this.mine(actor) }, data: { lu: true } });
    return { ok: true };
  }

  @Post('read-all') @HttpCode(200)
  async readAll(@CurrentActor() actor: Actor) {
    const r = await this.prisma.notification.updateMany({ where: { ...this.mine(actor), lu: false }, data: { lu: true } });
    return { ok: true, count: r.count };
  }
}

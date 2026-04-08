import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    return this.prisma.service.findMany({
      where: {
        companyId: user.companyId,
      },
      include: {
        barbers: true,
        locals: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: any, user: any) {
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          duration: dto.duration,
          companyId: user.companyId,

          barbers: dto.barberIds
            ? { connect: dto.barberIds.map((id) => ({ id })) }
            : undefined,

          locals: dto.localIds
            ? { connect: dto.localIds.map((id) => ({ id })) }
            : undefined,
        },
      });

      return { success: true, data: service };
    });
  }

  async update(id: number, dto: any, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description && { description: dto.description }),
        ...(dto.price && { price: dto.price }),
        ...(dto.duration && { duration: dto.duration }),

        ...(dto.barberIds && {
          barbers: {
            set: dto.barberIds.map((id) => ({ id })),
          },
        }),

        ...(dto.localIds && {
          locals: {
            set: dto.localIds.map((id) => ({ id })),
          },
        }),
      },
    });
  }

  async remove(id: number, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    await this.prisma.service.delete({ where: { id } });

    return { success: true, message: 'Servicio eliminado' };
  }
}

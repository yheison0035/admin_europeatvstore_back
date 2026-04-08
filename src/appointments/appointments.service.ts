import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  private async validateAvailability(dto: any, tx) {
    const exists = await tx.appointment.findFirst({
      where: {
        barberId: dto.barberId,
        localId: dto.localId,
        date: dto.date,
        OR: [
          {
            startTime: { lt: dto.endTime },
            endTime: { gt: dto.startTime },
          },
        ],
      },
    });

    if (exists) {
      throw new BadRequestException('Horario ocupado');
    }
  }

  async create(dto: any, user: any) {
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.findFirst({
        where: {
          id: dto.serviceId,
          companyId: user.companyId,
        },
      });

      if (!service) throw new NotFoundException();

      const startTime = new Date(dto.startTime);
      const endTime = new Date(startTime.getTime() + service.duration * 60000);

      await this.validateAvailability(
        {
          ...dto,
          startTime,
          endTime,
        },
        tx,
      );

      const appointment = await tx.appointment.create({
        data: {
          date: new Date(dto.date),
          startTime,
          endTime,
          serviceId: dto.serviceId,
          barberId: dto.barberId,
          customerId: dto.customerId,
          localId: dto.localId,
          companyId: user.companyId,
          notes: dto.notes,
        },
        include: {
          service: true,
          barber: true,
          customer: true,
        },
      });

      return { success: true, data: appointment };
    });
  }

  async findAll(user: any) {
    return this.prisma.appointment.findMany({
      where: {
        companyId: user.companyId,
      },
      include: {
        service: true,
        barber: true,
        customer: true,
      },
      orderBy: { date: 'desc' },
    });
  }
}

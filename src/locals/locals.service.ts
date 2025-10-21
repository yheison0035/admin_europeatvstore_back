import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';

@Injectable()
export class LocalsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.local.findMany({
      include: {
        user: true,
        inventories: true,
        expenses: true,
        sales: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const local = await this.prisma.local.findUnique({
      where: { id },
      include: {
        user: true,
        inventories: true,
        expenses: true,
        sales: true,
      },
    });
    if (!local) throw new NotFoundException(`Local con ID ${id} no encontrado`);
    return local;
  }

  async create(dto: CreateLocalDto) {
    return this.prisma.local.create({ data: dto });
  }

  async update(id: number, dto: UpdateLocalDto) {
    await this.findOne(id);
    return this.prisma.local.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.local.delete({ where: { id } });
  }
}

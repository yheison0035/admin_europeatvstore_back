import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.provider.findMany({
      include: { inventories: true, expenses: true },

      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: { inventories: true, expenses: true },
    });
    if (!provider)
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    return provider;
  }

  async create(dto: CreateProviderDto) {
    return this.prisma.provider.create({ data: dto });
  }

  async update(id: number, dto: UpdateProviderDto) {
    await this.findOne(id);
    return this.prisma.provider.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.provider.delete({ where: { id } });
  }
}

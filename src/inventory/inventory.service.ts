import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.inventory.findMany({
      include: {
        local: true,
        provider: true,
        category: true,
        brand: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const item = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        local: true,
        provider: true,
        category: true,
        brand: true,
      },
    });
    if (!item)
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    return item;
  }

  async create(dto: CreateInventoryDto) {
    return this.prisma.inventory.create({ data: dto });
  }

  async update(id: number, dto: UpdateInventoryDto) {
    await this.findOne(id);
    return this.prisma.inventory.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.inventory.delete({ where: { id } });
  }

  /**
   * Ajusta el stock en base a `amount`.
   * amount puede ser positivo (incrementar) o negativo (decrementar).
   */
  async adjustStock(id: number, amount: number) {
    if (!Number.isInteger(amount))
      throw new BadRequestException('El importe debe ser entero');
    const item = await this.findOne(id);

    const newStock = item.stock + amount;
    if (newStock < 0)
      throw new BadRequestException('El stock no puede ser negativo');

    return this.prisma.inventory.update({
      where: { id },
      data: { stock: newStock },
    });
  }
}

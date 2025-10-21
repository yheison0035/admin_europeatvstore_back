import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateExpenseDto } from './dto/create-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.expense.findMany({
      include: {
        provider: true,
        local: true,
      },
      orderBy: {
        expenseDate: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { provider: true, local: true },
    });

    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        concept: dto.concept,
        category: dto.category,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        providerId: dto.providerId,
        localId: dto.localId,
      },
    });
  }

  async update(id: number, dto: UpdateExpenseDto) {
    await this.findOne(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        concept: dto.concept,
        category: dto.category,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        providerId: dto.providerId,
        localId: dto.localId,
        status: dto.status,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.expense.delete({ where: { id } });
  }
}

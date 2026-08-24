import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/prisma.service';
import { parseBankSms } from './bank-sms.parser';

@Injectable()
export class BankService {
  constructor(private prisma: PrismaService) {}

  // Webhook PÚBLICO: el reenviador de SMS del celular manda aquí cada SMS del
  // banco. Se identifica la empresa por el token secreto de la URL.
  async receiveSms(token: string, body: any) {
    if (!token) throw new NotFoundException();
    const company = await this.prisma.company.findFirst({
      where: { bankNotifyToken: token, bankNotifyEnabled: true },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Token no válido');

    const p = parseBankSms(body);
    const deposit = await this.prisma.bankDeposit.create({
      data: {
        companyId: company.id,
        amount: p.amount,
        senderName: p.senderName,
        reference: p.reference,
        raw: p.raw,
      },
    });
    return { success: true, data: { id: deposit.id, amount: deposit.amount } };
  }

  // Activa las notificaciones y genera (o reutiliza) el token del webhook.
  async enable(user: any) {
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { bankNotifyToken: true },
    });
    const token =
      company?.bankNotifyToken || randomBytes(24).toString('hex');
    await this.prisma.company.update({
      where: { id: user.companyId },
      data: { bankNotifyEnabled: true, bankNotifyToken: token },
    });
    return { success: true, data: { enabled: true, token } };
  }

  async disable(user: any) {
    await this.prisma.company.update({
      where: { id: user.companyId },
      data: { bankNotifyEnabled: false },
    });
    return { success: true, data: { enabled: false } };
  }

  // Genera un token NUEVO (si el anterior se filtró).
  async regenerate(user: any) {
    const token = randomBytes(24).toString('hex');
    await this.prisma.company.update({
      where: { id: user.companyId },
      data: { bankNotifyToken: token, bankNotifyEnabled: true },
    });
    return { success: true, data: { enabled: true, token } };
  }

  async status(user: any) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { bankNotifyEnabled: true, bankNotifyToken: true },
    });
    return {
      success: true,
      data: {
        enabled: !!c?.bankNotifyEnabled,
        token: c?.bankNotifyToken || null,
      },
    };
  }

  // Crea una consignación de PRUEBA (para comprobar la voz y la notificación
  // sin depender del celular). Va por el canal autenticado, sin problemas de
  // CORS del navegador.
  async sendTest(user: any) {
    const deposit = await this.prisma.bankDeposit.create({
      data: {
        companyId: user.companyId,
        amount: 50000,
        senderName: 'JUAN DE PRUEBA',
        reference: '*1234',
        raw: 'Consignación de prueba (Pegazo).',
      },
    });
    return { success: true, data: { id: deposit.id } };
  }

  async list(user: any, query: any) {
    const limit = Math.min(Number(query.limit) || 50, 200);
    const deposits = await this.prisma.bankDeposit.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { success: true, data: deposits };
  }

  // Consignaciones nuevas (sin "ver") — las consulta el aviso en tiempo real.
  async pending(user: any) {
    const deposits = await this.prisma.bankDeposit.findMany({
      where: { companyId: user.companyId, seen: false },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return { success: true, data: deposits };
  }

  async markSeen(user: any, id: number) {
    const dep = await this.prisma.bankDeposit.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!dep) throw new NotFoundException('No encontrada');
    await this.prisma.bankDeposit.update({
      where: { id },
      data: { seen: true },
    });
    return { success: true };
  }

  async remove(user: any, id: number) {
    const dep = await this.prisma.bankDeposit.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!dep) throw new NotFoundException('No encontrada');
    await this.prisma.bankDeposit.delete({ where: { id } });
    return { success: true };
  }

  async clearAll(user: any) {
    const res = await this.prisma.bankDeposit.deleteMany({
      where: { companyId: user.companyId },
    });
    return { success: true, data: { deleted: res.count } };
  }

  async markAllSeen(user: any) {
    await this.prisma.bankDeposit.updateMany({
      where: { companyId: user.companyId, seen: false },
      data: { seen: true },
    });
    return { success: true };
  }
}

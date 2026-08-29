import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '@/prisma.service';
import { parseBankSms } from './bank-sms.parser';
import { PushService } from '@/push/push.service';

@Injectable()
export class BankService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  // Webhook PÚBLICO: el reenviador (SMS/correo) manda aquí cada notificación
  // del banco. Un mismo buzón puede tener VARIAS empresas (mismo token): se
  // enruta a la empresa correcta según su identificador (nombre/llave). Las
  // salidas (transferencias enviadas) se ignoran.
  async receiveSms(token: string, body: any) {
    if (!token) throw new NotFoundException();

    const p = parseBankSms(body);

    // No es un pago recibido → no es una consignación, se ignora.
    if (p.direction === 'out') {
      return { success: true, data: { ignored: 'no es un pago recibido' } };
    }

    const companies = await this.prisma.company.findMany({
      where: { bankNotifyToken: token, bankNotifyEnabled: true },
      select: { id: true, name: true, bankIdentifier: true },
    });
    if (companies.length === 0) throw new NotFoundException('Token no válido');

    let target = companies[0];
    if (companies.length > 1) {
      // Buzón compartido: elegir la empresa cuyo identificador aparezca en la
      // notificación (por nombre o por llave).
      const haystack = `${p.raw || ''} ${p.business || ''} ${p.llave || ''}`.toLowerCase();
      const match = companies.find((c) => {
        const ids = (c.bankIdentifier || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        return ids.some((id) => haystack.includes(id));
      });
      if (!match) {
        return {
          success: true,
          data: { ignored: 'ninguna empresa coincide con la notificación' },
        };
      }
      target = match;
    }

    // Anti-duplicados PERSISTENTE: cada correo se procesa UNA sola vez por
    // empresa, para siempre. La clave es el id del correo (si el reenviador lo
    // manda) o el hash del texto. Aunque el usuario borre la consignación y el
    // reenviador mande el mismo correo otra vez, NO se vuelve a crear.
    const rawText = p.raw || '';
    const sourceKey =
      String(body?.sourceId || body?.id || '').trim() ||
      (rawText
        ? createHash('sha256').update(rawText).digest('hex')
        : '');
    if (sourceKey) {
      try {
        await this.prisma.bankProcessedEmail.create({
          data: { companyId: target.id, sourceKey },
        });
      } catch {
        // Violación de índice único → este correo ya se procesó antes.
        return { success: true, data: { duplicate: true } };
      }
    }

    const deposit = await this.prisma.bankDeposit.create({
      data: {
        companyId: target.id,
        amount: p.amount,
        senderName: p.senderName,
        reference: p.llave || p.reference,
        raw: p.raw,
      },
    });

    // Aviso push al dueño/administrador: entró una consignación.
    const monto = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(deposit.amount || 0);
    void this.push
      .sendToCompanyRoles(target.id, ['SUPER_ADMIN', 'ADMIN'], {
        title: '💰 Consignación recibida',
        body: `${monto}${p.senderName ? ' de ' + p.senderName : ''}`,
        url: '/dashboard/bank',
        tag: `deposit-${deposit.id}`,
      })
      .catch(() => null);

    return { success: true, data: { id: deposit.id, amount: deposit.amount } };
  }

  // Activa las notificaciones. Si se pasa un token (compartir buzón con otra
  // empresa), se usa ese; si no, se reutiliza el existente o se genera uno.
  async enable(user: any, dto: any = {}) {
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { bankNotifyToken: true },
    });
    const shared = String(dto?.token || '').trim();
    const token =
      shared || company?.bankNotifyToken || randomBytes(24).toString('hex');
    await this.prisma.company.update({
      where: { id: user.companyId },
      data: {
        bankNotifyEnabled: true,
        bankNotifyToken: token,
        ...(dto?.identifier !== undefined && {
          bankIdentifier: String(dto.identifier || '').trim() || null,
        }),
        ...(dto?.email !== undefined && {
          bankEmail: String(dto.email || '').trim() || null,
        }),
      },
    });
    return { success: true, data: { enabled: true, token } };
  }

  // Guarda la configuración del banco: identificador (nombre/llave con que el
  // banco identifica a la empresa) y/o el correo donde llegan las confirmaciones.
  async setConfig(user: any, dto: any = {}) {
    const data: any = {};
    if (dto?.identifier !== undefined)
      data.bankIdentifier = String(dto.identifier || '').trim() || null;
    if (dto?.email !== undefined)
      data.bankEmail = String(dto.email || '').trim() || null;
    if (Object.keys(data).length) {
      await this.prisma.company.update({
        where: { id: user.companyId },
        data,
      });
    }
    return { success: true };
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
      select: {
        bankNotifyEnabled: true,
        bankNotifyToken: true,
        bankIdentifier: true,
        bankEmail: true,
        name: true,
      },
    });
    return {
      success: true,
      data: {
        enabled: !!c?.bankNotifyEnabled,
        token: c?.bankNotifyToken || null,
        identifier: c?.bankIdentifier || '',
        email: c?.bankEmail || '',
        companyName: c?.name || '',
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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';

@Injectable()
export class ClinicalService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  // El paciente (Customer) debe ser de la empresa del usuario.
  private async assertCustomer(user: any, customerId: number) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: user.companyId },
      select: { id: true, name: true },
    });
    if (!c) throw new NotFoundException('Paciente no encontrado');
    return c;
  }

  async get(user: any, customerId: number) {
    await this.assertCustomer(user, customerId);
    const [record, entries] = await Promise.all([
      this.prisma.clinicalRecord.findUnique({
        where: { companyId_customerId: { companyId: user.companyId, customerId } },
      }),
      this.prisma.clinicalEntry.findMany({
        where: { companyId: user.companyId, customerId },
        orderBy: { date: 'desc' },
      }),
    ]);
    return { success: true, data: { record, entries } };
  }

  async upsertRecord(user: any, customerId: number, dto: any) {
    await this.assertCustomer(user, customerId);
    const data: any = {
      bloodType: dto.bloodType?.trim() || null,
      allergies: dto.allergies?.trim() || null,
      medications: dto.medications?.trim() || null,
      conditions: dto.conditions?.trim() || null,
      notes: dto.notes?.trim() || null,
    };
    // Odontograma (dental): solo se toca si viene en el DTO.
    if (dto.odontogram !== undefined) data.odontogram = dto.odontogram ?? null;
    const record = await this.prisma.clinicalRecord.upsert({
      where: { companyId_customerId: { companyId: user.companyId, customerId } },
      create: { companyId: user.companyId, customerId, ...data },
      update: data,
    });
    return { success: true, data: record };
  }

  async addEntry(user: any, customerId: number, dto: any) {
    await this.assertCustomer(user, customerId);
    const entry = await this.prisma.clinicalEntry.create({
      data: {
        companyId: user.companyId,
        customerId,
        appointmentId: dto.appointmentId ? Number(dto.appointmentId) : null,
        userId: user.id,
        userName: user.name || user.email || null,
        date: dto.date ? new Date(dto.date) : new Date(),
        reason: dto.reason?.trim() || null,
        diagnosis: dto.diagnosis?.trim() || null,
        treatment: dto.treatment?.trim() || null,
        notes: dto.notes?.trim() || null,
        attachments: Array.isArray(dto.attachments) ? dto.attachments : [],
      },
    });
    return { success: true, data: entry };
  }

  // Sube una imagen (foto/radiografía) y devuelve su URL para adjuntarla.
  async uploadImage(user: any, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen.');
    const { url } = await this.cloudinary.uploadImage(
      file,
      `clinical/${user.companyId}`,
    );
    return { success: true, data: { url } };
  }

  async removeEntry(user: any, id: number) {
    const e = await this.prisma.clinicalEntry.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!e) throw new NotFoundException('Evolución no encontrada');
    await this.prisma.clinicalEntry.delete({ where: { id } });
    return { success: true };
  }
}

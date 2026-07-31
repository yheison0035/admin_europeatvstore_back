import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from '@/common/role-check.util';
import { AuditService } from '@/audit/audit.service';

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAllPaginated(query: any, user: any) {
    const isAll = query.all === 'true' || query.all === true;

    const where: any = {
      status: { not: Status.ELIMINADO },
      companyId: user.companyId,
    };

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.contactName) {
      where.contactName = {
        contains: query.contactName,
        mode: 'insensitive',
      };
    }

    if (query.productType) {
      where.productType = {
        contains: query.productType,
        mode: 'insensitive',
      };
    }

    if (query.address) {
      where.address = { contains: query.address, mode: 'insensitive' };
    }

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.phone) {
      where.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();
      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    if (isAll) {
      const items = await this.prisma.provider.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
        },
      });

      return {
        success: true,
        data: items,
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.provider.count({ where }),
    ]);

    const auditMap = await this.audit.latestFor(
      'provider',
      items.map((p) => p.id),
      user.companyId,
    );

    return {
      success: true,
      data: items.map((p) => ({ ...p, lastAudit: auditMap[p.id] || null })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: any) {
    const provider = await this.prisma.provider.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!provider) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    return {
      success: true,
      message: 'Proveedor obtenido correctamente',
      data: provider,
    };
  }

  async create(dto: CreateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const provider = await this.prisma.provider.create({
      data: {
        name: dto.name,
        contactName: dto.contactName,
        phone: dto.phone,
        email: dto.email,
        city: dto.city,
        department: dto.department,
        address: dto.address,
        productType: dto.productType,
        status: dto.status ?? Status.ACTIVO,

        companyId: user.companyId,
      },
    });

    await this.audit.log({
      entity: 'provider',
      entityId: provider.id,
      action: 'CREATE',
      user,
    });

    return {
      success: true,
      message: 'Proveedor creado correctamente',
      data: provider,
    };
  }

  async update(id: number, dto: UpdateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.provider.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contactName !== undefined && {
          contactName: dto.contactName,
        }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.department !== undefined && {
          department: dto.department,
        }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.productType !== undefined && {
          productType: dto.productType,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    const changes = this.audit.diff(found, dto, [
      'name',
      'contactName',
      'phone',
      'email',
      'city',
      'department',
      'address',
      'productType',
      'status',
    ]);
    await this.audit.log({
      entity: 'provider',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return {
      success: true,
      message: 'Proveedor actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    await this.prisma.provider.delete({
      where: { id },
    });

    await this.audit.log({
      entity: 'provider',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return {
      success: true,
      message: 'Proveedor eliminado correctamente',
    };
  }
}

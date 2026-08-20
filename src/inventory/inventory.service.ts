import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { hasRole } from '@/common/role-check.util';
import { InventoryVariant, Role } from '@prisma/client';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';
import { VariantsService } from './variants/variants.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { generateSlug } from '@/utils/slug.util';
import { getPagination } from '@/common/pagination.util';
import { generateSku } from '../../utils/sku.util';
import { AuditService } from '@/audit/audit.service';
import { PlanLimitsService } from '@/common/plan-limits.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private variantsService: VariantsService,
    private audit: AuditService,
    private planLimits: PlanLimitsService,
  ) {}

  // Búsqueda avanzada de productos y servicios
  async search(term: string, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const searchTerm = term.trim();

    if (!searchTerm) {
      return {
        success: true,
        data: [],
      };
    }

    const words = searchTerm
      .split(' ')
      .map((w) => w.trim())
      .filter(Boolean);

    if (localIds !== null && localIds.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // ==========================
    // PRODUCTOS
    // ==========================

    const productWhere: any = {
      local: {
        companyId: user.companyId,
      },

      ...(localIds !== null && {
        localId: {
          in: localIds,
        },
      }),

      AND: words.map((word) => ({
        OR: [
          {
            name: {
              contains: word,
              mode: 'insensitive',
            },
          },

          {
            description: {
              contains: word,
              mode: 'insensitive',
            },
          },

          {
            barcode: {
              contains: word,
              mode: 'insensitive',
            },
          },

          {
            variants: {
              some: {
                sku: {
                  contains: word,
                  mode: 'insensitive',
                },
              },
            },
          },

          {
            variants: {
              some: {
                color: {
                  contains: word,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      })),
    };

    const products = await this.prisma.inventory.findMany({
      where: productWhere,

      include: {
        variants: {
          where: {
            isActive: true,
          },
        },
      },

      take: 20,
    });

    const productResults = products.flatMap((product) =>
      product.variants.map((variant) => {
        let score = 0;

        const termLower = searchTerm.toLowerCase();

        if (product.name.toLowerCase().startsWith(termLower)) {
          score += 100;
        }

        if (product.name.toLowerCase().includes(termLower)) {
          score += 50;
        }

        if (product.description?.toLowerCase().includes(termLower)) {
          score += 20;
        }

        if (variant.sku?.toLowerCase().includes(termLower)) {
          score += 80;
        }

        if (variant.color?.toLowerCase().includes(termLower)) {
          score += 15;
        }

        if (product.barcode?.toLowerCase().includes(termLower)) {
          score += 90;
        }

        return {
          type: 'product',
          id: variant.id,
          name: product.name,
          color: variant.color,
          sku: variant.sku,
          stock: variant.stock,
          price: product.salePrice,
          localId: product.localId,
          score,
        };
      }),
    );

    // ==========================
    // SERVICIOS
    // ==========================

    const serviceWhere: any = {
      companyId: user.companyId,

      AND: words.map((word) => ({
        OR: [
          {
            name: {
              contains: word,
              mode: 'insensitive',
            },
          },

          {
            description: {
              contains: word,
              mode: 'insensitive',
            },
          },
        ],
      })),
    };

    const services = await this.prisma.service.findMany({
      where: serviceWhere,

      include: {
        serviceLocals: true,
      },

      take: 20,
    });

    const serviceResults = services.flatMap((service) =>
      service.serviceLocals
        .filter((local) =>
          localIds === null ? true : localIds.includes(local.localId),
        )
        .map((local) => {
          let score = 0;

          const termLower = searchTerm.toLowerCase();

          if (service.name.toLowerCase().startsWith(termLower)) {
            score += 100;
          }

          if (service.name.toLowerCase().includes(termLower)) {
            score += 50;
          }

          if (service.description?.toLowerCase().includes(termLower)) {
            score += 20;
          }

          return {
            type: 'service',
            id: service.id,
            name: service.name,
            duration: service.duration,
            price: local.price,
            localId: local.localId,
            score,
          };
        }),
    );

    // ==========================
    // UNIÓN + RELEVANCIA
    // ==========================

    const data = [...productResults, ...serviceResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ score, ...item }) => item);

    return {
      success: true,
      data,
    };
  }

  async findAllPaginated(user: any, query: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const { page, limit, skip } = getPagination(query);

    const where: any = {
      local: {
        companyId: user.companyId,
      },
    };

    if (localIds !== null) {
      if (localIds.length === 0) {
        where.localId = -1;
      } else {
        where.localId = { in: localIds };
      }
    }

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.barcode) {
      where.barcode = { contains: query.barcode, mode: 'insensitive' };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.localId) {
      where.local = {
        ...where.local,
        name: { contains: query.localId, mode: 'insensitive' },
      };
    }

    if (query.providerId) {
      where.provider = {
        is: { name: { contains: query.providerId, mode: 'insensitive' } },
      };
    }

    if (query.oldPrice) {
      const oldPrice = Number(query.oldPrice);
      if (!Number.isNaN(oldPrice)) {
        where.oldPrice = oldPrice;
      }
    }

    if (query.salePrice) {
      const salePrice = Number(query.salePrice);
      if (!Number.isNaN(salePrice)) {
        where.salePrice = salePrice;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          images: { orderBy: { position: 'asc' } },
          variants: { where: { isActive: true } },
          brand: true,
          provider: true,
          local: true,
          category: true,
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    const canSeePurchasePrice = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    const data = items.map((product) => {
      const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

      if (!canSeePurchasePrice) {
        const { purchasePrice, ...rest } = product;
        return { ...rest, stock };
      }

      return { ...product, stock };
    });

    const auditMap = await this.audit.latestFor(
      'inventory',
      data.map((p) => p.id),
      user.companyId,
    );

    return {
      success: true,
      data: data.map((p) => ({ ...p, lastAudit: auditMap[p.id] || null })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: any) {
    const product = await this.prisma.inventory.findFirst({
      where: {
        id,
        local: {
          companyId: user.companyId,
        },
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { where: { isActive: true } },
        brand: true,
        category: true,
        provider: true,
        local: true,
        features: true,
        specifications: true,
      },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

    return { success: true, data: { ...product, stock } };
  }

  // Productos con alerta de stock bajo: minStock > 0 y stock total <= minStock.
  // Ordenados por los más críticos primero (mayor faltante).
  async getLowStock(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: 'ACTIVO',
      minStock: { gt: 0 },
      local: { companyId: user.companyId },
    };
    if (localIds !== null) {
      where.localId = localIds.length === 0 ? -1 : { in: localIds };
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        variants: { where: { isActive: true }, select: { stock: true } },
        local: { select: { name: true } },
      },
    });

    const low = products
      .map((p) => {
        const stock = p.variants.reduce((s, v) => s + v.stock, 0);
        return {
          id: p.id,
          name: p.name,
          stock,
          minStock: p.minStock,
          local: p.local?.name || null,
        };
      })
      .filter((p) => p.stock <= p.minStock)
      .sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));

    return { success: true, data: low };
  }

  // Verifica que la categoría, marca y proveedor indicados pertenezcan a la
  // empresa del usuario (evita asignar referencias de otra empresa).
  private async assertRefsOwnership(dto: any, companyId: number) {
    if (dto.categoryId) {
      const ok = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, companyId },
        select: { id: true },
      });
      if (!ok) throw new ForbiddenException('La categoría no es de tu empresa');
    }
    if (dto.brandId) {
      const ok = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, companyId },
        select: { id: true },
      });
      if (!ok) throw new ForbiddenException('La marca no es de tu empresa');
    }
    if (dto.providerId) {
      const ok = await this.prisma.provider.findFirst({
        where: { id: dto.providerId, companyId },
        select: { id: true },
      });
      if (!ok) throw new ForbiddenException('El proveedor no es de tu empresa');
    }
  }

  async create(dto: CreateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No autorizado');
    }

    // Límite de productos según el plan de la empresa.
    await this.planLimits.assertCanCreate(user.companyId, 'products');

    // La categoría/marca/proveedor deben ser de la empresa.
    await this.assertRefsOwnership(dto, user.companyId);

    if (dto.localId) {
      const local = await this.prisma.local.findFirst({
        where: {
          id: dto.localId,
          companyId: user.companyId,
        },
      });

      if (!local) throw new ForbiddenException('Local no permitido');
    }

    if (dto.barcode) {
      const existing = await this.prisma.inventory.findFirst({
        where: { barcode: dto.barcode },
      });

      if (existing) {
        throw new BadRequestException('El código de barras ya existe');
      }
    }

    const baseSlug = generateSlug(dto.name);
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.inventory.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.inventory.create({
        data: {
          name: dto.name,
          description: dto.description,
          barcode: dto.barcode?.trim() ? dto.barcode : null,
          purchasePrice: dto.purchasePrice,
          oldPrice: dto.oldPrice ?? null,
          salePrice: dto.salePrice,
          status: dto.status,
          minStock: dto.minStock ?? 0,
          slug,

          ...(dto.localId && {
            local: { connect: { id: dto.localId } },
          }),

          ...(dto.categoryId && {
            category: { connect: { id: dto.categoryId } },
          }),

          ...(dto.brandId && {
            brand: { connect: { id: dto.brandId } },
          }),

          ...(dto.providerId && {
            provider: { connect: { id: dto.providerId } },
          }),

          createdBy: { connect: { id: user.id } },
          updatedBy: { connect: { id: user.id } },
        },
      });

      const variants: InventoryVariant[] = [];

      for (const v of dto.variants ?? []) {
        const created = await tx.inventoryVariant.create({
          data: {
            inventoryId: product.id,
            color: v.color,
            stock: v.stock,
            sku: 'PENDING',
          },
        });

        const sku = generateSku(dto.name, created.sequence, created.color);

        const updated = await tx.inventoryVariant.update({
          where: { id: created.id },
          data: { sku },
        });

        variants.push(updated);
      }

      return {
        success: true,
        message: 'Producto creado correctamente',
        data: { ...product, variants },
      };
    });

    await this.audit.log({
      entity: 'inventory',
      entityId: result.data.id,
      action: 'CREATE',
      user,
    });

    return result;
  }

  async update(id: number, dto: UpdateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No autorizado');
    }

    const before = (await this.findOne(id, user)).data;

    // La categoría/marca/proveedor deben ser de la empresa.
    await this.assertRefsOwnership(dto, user.companyId);

    const updated = await this.prisma.inventory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.purchasePrice !== undefined && {
          purchasePrice: dto.purchasePrice,
        }),
        ...(dto.oldPrice !== undefined && { oldPrice: dto.oldPrice }),
        ...(dto.salePrice !== undefined && { salePrice: dto.salePrice }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.minStock !== undefined && { minStock: dto.minStock }),

        ...(dto.localId && {
          local: { connect: { id: dto.localId } },
        }),

        ...(dto.categoryId && {
          category: { connect: { id: dto.categoryId } },
        }),

        ...(dto.brandId && {
          brand: { connect: { id: dto.brandId } },
        }),

        ...(dto.providerId && {
          provider: { connect: { id: dto.providerId } },
        }),

        updatedBy: { connect: { id: user.id } },
      },
    });

    if (Array.isArray(dto.variants)) {
      await this.variantsService.syncVariants(id, dto.variants, user);
    }

    const changes = this.audit.diff(before, dto, [
      'name',
      'barcode',
      'description',
      'purchasePrice',
      'salePrice',
      'oldPrice',
      'status',
      'localId',
      'providerId',
      'categoryId',
      'brandId',
    ]);
    await this.audit.log({
      entity: 'inventory',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return {
      success: true,
      message: 'Producto actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    const product = await this.prisma.inventory.findFirst({
      where: {
        id,
        local: {
          companyId: user.companyId,
        },
      },
      include: { images: true },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    for (const img of product.images) {
      await this.cloudinaryService.deleteImage(img.publicId).catch(() => null);
    }

    await this.prisma.inventory.delete({ where: { id } });

    await this.audit.log({
      entity: 'inventory',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return { success: true, message: 'Producto eliminado' };
  }

  async syncProductImages(
    inventoryId: number,
    files: Express.Multer.File[],
    keepImageIds: number[],
    order: string[],
    user: any,
  ) {
    const product = await this.prisma.inventory.findFirst({
      where: {
        id: inventoryId,
        local: {
          companyId: user.companyId,
        },
      },
      include: {
        images: true,
        category: true,
        brand: true,
      },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    const folder = `inventory/${product.category?.name || 'general'}`;

    await this.prisma.$transaction(async (tx) => {
      // 1) Eliminar las que ya no se conservan (de Cloudinary y de la BD).
      if (Array.isArray(keepImageIds)) {
        const toDelete = product.images.filter(
          (img) => !keepImageIds.includes(img.id),
        );

        for (const img of toDelete) {
          await this.cloudinaryService.deleteImage(img.publicId).catch(() => null);
          await tx.inventoryImage.delete({ where: { id: img.id } });
        }
      }

      // 2) Subir las nuevas (posición temporal alta para no chocar).
      const newImageIds: number[] = [];
      if (files) {
        for (let i = 0; i < files.length; i++) {
          const upload = await this.cloudinaryService.uploadImage(
            files[i],
            folder,
          );
          const created = await tx.inventoryImage.create({
            data: {
              inventoryId,
              url: upload.url,
              publicId: upload.publicId,
              position: 1000 + i,
            },
          });
          newImageIds.push(created.id);
        }
      }

      // 3) Reposicionar TODO según el orden final (id existente o 'NEW'). Así se
      // persiste el reordenar y la imagen "Principal" (posición 0).
      if (Array.isArray(order) && order.length) {
        let newIdx = 0;
        for (let pos = 0; pos < order.length; pos++) {
          const token = order[pos];
          if (token === 'NEW') {
            const imgId = newImageIds[newIdx++];
            if (imgId != null) {
              await tx.inventoryImage.update({
                where: { id: imgId },
                data: { position: pos },
              });
            }
          } else {
            const imgId = Number(token);
            if (keepImageIds.includes(imgId)) {
              await tx.inventoryImage.update({
                where: { id: imgId },
                data: { position: pos },
              });
            }
          }
        }
      } else {
        // Compatibilidad: sin orden, las nuevas quedan al final.
        const start = keepImageIds?.length ?? 0;
        for (let i = 0; i < newImageIds.length; i++) {
          await tx.inventoryImage.update({
            where: { id: newImageIds[i] },
            data: { position: start + i },
          });
        }
      }
    });

    return { success: true, message: 'Imágenes sincronizadas' };
  }
}

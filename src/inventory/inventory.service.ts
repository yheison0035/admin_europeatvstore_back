import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { hasRole } from 'src/common/role-check.util';
import { InventoryVariant, Role } from '@prisma/client';
import { generateSku } from 'utils/sku.util';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { VariantsService } from './variants/variants.service';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';
import { generateSlug } from 'src/utils/slug.util';
import { getPagination } from 'src/common/pagination.util';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private variantsService: VariantsService,
  ) {}

  // Endpoint para buscar productos por término (nombre o parte de él)
  async search(term: string, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      local: {
        companyId: user.companyId,
      },
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { barcode: term },
      ],
    };

    if (localIds !== null) {
      if (localIds.length === 0) return { success: true, data: [] };
      where.localId = { in: localIds };
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        variants: { where: { isActive: true } },
      },
      take: 10,
    });

    const result = products.flatMap((p) =>
      p.variants.map((v) => ({
        id: v.id,
        name: p.name,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        price: p.salePrice,
        localId: p.localId,
      })),
    );

    return { success: true, data: result };
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

    return {
      success: true,
      data,
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
        images: true,
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

  async create(dto: CreateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No autorizado');
    }

    if (dto.localId) {
      const local = await this.prisma.local.findFirst({
        where: {
          id: dto.localId,
          companyId: user.companyId,
        },
      });

      if (!local) throw new ForbiddenException('Local no permitido');
    }

    const baseSlug = generateSlug(dto.name);
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.inventory.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.inventory.create({
        data: {
          name: dto.name,
          description: dto.description,
          barcode: dto.barcode ?? null,
          purchasePrice: dto.purchasePrice,
          oldPrice: dto.oldPrice ?? null,
          salePrice: dto.salePrice,
          status: dto.status,
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
  }

  async update(id: number, dto: UpdateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No autorizado');
    }

    await this.findOne(id, user);

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

    return { success: true, message: 'Producto eliminado' };
  }

  async syncProductImages(
    inventoryId: number,
    files: Express.Multer.File[],
    keepImageIds: number[],
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
      if (Array.isArray(keepImageIds)) {
        const toDelete = product.images.filter(
          (img) => !keepImageIds.includes(img.id),
        );

        for (const img of toDelete) {
          await this.cloudinaryService.deleteImage(img.publicId);
          await tx.inventoryImage.delete({ where: { id: img.id } });
        }
      }

      let start = keepImageIds?.length ?? 0;

      if (files) {
        for (let i = 0; i < files.length; i++) {
          const upload = await this.cloudinaryService.uploadImage(
            files[i],
            folder,
          );

          await tx.inventoryImage.create({
            data: {
              inventoryId,
              url: upload.url,
              publicId: upload.publicId,
              position: start + i,
            },
          });
        }
      }
    });

    return { success: true, message: 'Imágenes sincronizadas' };
  }
}

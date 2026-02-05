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
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { barcode: term },
      ],
    };

    if (localIds !== null) {
      if (localIds.length === 0) {
        return { success: true, data: [] };
      }
      where.localId = { in: localIds };
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        variants: {
          where: { isActive: true },
        },
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

  async findAll(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = {};

    if (localIds === null) {
      // acceso global
    } else if (localIds.length === 0) {
      where.localId = -1;
    } else {
      where.localId = { in: localIds };
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        images: { orderBy: { position: 'asc' } },
        variants: {
          where: { isActive: true },
        },
        brand: true,
        category: true,
        provider: true,
        local: true,
        features: { orderBy: { order: 'asc' } },
        specifications: { orderBy: { order: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const canSeePurchasePrice = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    const data = products.map((product) => {
      const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

      if (!canSeePurchasePrice) {
        const { purchasePrice, ...rest } = product;
        return { ...rest, stock };
      }

      return { ...product, stock };
    });

    return {
      success: true,
      message: 'Inventario obtenido correctamente',
      data,
    };
  }

  async findOne(id: number, user: any) {
    const product = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        images: { orderBy: { position: 'asc' } },
        variants: { where: { isActive: true } },
        brand: true,
        category: true,
        provider: true,
        local: true,
        features: { orderBy: { order: 'asc' } },
        specifications: { orderBy: { order: 'asc' } },
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    if (
      localIds !== null &&
      (product.localId === null || !localIds.includes(product.localId))
    ) {
      throw new ForbiddenException('Acceso denegado');
    }

    const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

    const canSeePurchasePrice = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    if (!canSeePurchasePrice) {
      const { purchasePrice, ...rest } = product;
      return { success: true, data: { ...rest, stock } };
    }

    return { success: true, data: { ...product, stock } };
  }

  async create(dto: CreateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No autorizado');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    if (dto.localId && localIds !== null && !localIds.includes(dto.localId)) {
      throw new ForbiddenException('Local no permitido');
    }

    const baseSlug = generateSlug(dto.name);
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.inventory.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const barcode =
      dto.barcode && dto.barcode.trim() !== '' ? dto.barcode.trim() : null;

    if (barcode) {
      const exists = await this.prisma.inventory.findUnique({
        where: { barcode },
      });

      if (exists) {
        throw new BadRequestException('Este código de barras ya existe');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.inventory.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          barcode,
          purchasePrice: dto.purchasePrice,
          oldPrice: dto.oldPrice,
          salePrice: dto.salePrice,
          status: dto.status,
          ...(dto.brandId && { brand: { connect: { id: dto.brandId } } }),
          ...(dto.categoryId && {
            category: { connect: { id: dto.categoryId } },
          }),
          ...(dto.providerId && {
            provider: { connect: { id: dto.providerId } },
          }),
          ...(dto.localId && { local: { connect: { id: dto.localId } } }),
          createdBy: { connect: { id: user.id } },
          updatedBy: { connect: { id: user.id } },
        },
      });

      // Variantes → SOLO creación inicial
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

    const barcode =
      dto.barcode && dto.barcode.trim() !== '' ? dto.barcode.trim() : null;

    if (barcode) {
      const exists = await this.prisma.inventory.findFirst({
        where: {
          barcode,
          NOT: { id },
        },
      });

      if (exists) {
        throw new BadRequestException('Este código de barras ya existe');
      }
    }

    const updatedProduct = await this.prisma.inventory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        barcode,
        purchasePrice: dto.purchasePrice,
        oldPrice: dto.oldPrice,
        salePrice: dto.salePrice,
        status: dto.status,
        updatedBy: { connect: { id: user.id } },
      },
    });

    if (dto.variants && dto.variants.length > 0) {
      await this.variantsService.syncVariants(id, dto.variants, user);
    }

    return {
      success: true,
      message: 'Producto actualizado correctamente',
      data: updatedProduct,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No autorizado');
    }

    const product = await this.prisma.inventory.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    for (const img of product.images) {
      await this.cloudinaryService.deleteImage(img.publicId).catch(() => null);
    }

    await this.prisma.inventory.delete({ where: { id } });

    return {
      success: true,
      message: 'Producto eliminado correctamente',
    };
  }

  // Endpoint para sincronizar imágenes de un producto
  async syncProductImages(
    inventoryId: number,
    files: Express.Multer.File[],
    keepImageIds: number[],
    user: any,
  ) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.ASESOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const product = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: {
        images: true,
        category: true,
        brand: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const categoryFolder = product.category?.name
      ? product.category.name.toLowerCase().replace(/\s+/g, '-')
      : 'sin-categoria';

    const brandFolder = product.brand?.name
      ? product.brand.name.toLowerCase().replace(/\s+/g, '-')
      : 'sin-marca';

    const folderPath = `inventory/${categoryFolder}/${brandFolder}`;

    await this.prisma.$transaction(async (tx) => {
      /** ELIMINAR IMÁGENES QUE NO SE CONSERVAN */
      if (Array.isArray(keepImageIds)) {
        const imagesToDelete = product.images.filter(
          (img) => !keepImageIds.includes(img.id),
        );

        for (const img of imagesToDelete) {
          await this.cloudinaryService
            .deleteImage(img.publicId)
            .catch(() => null);

          await tx.inventoryImage.delete({
            where: { id: img.id },
          });
        }
      }

      /** REORDENAR IMÁGENES EXISTENTES (ORDEN VIENE DEL FRONT) */
      if (Array.isArray(keepImageIds)) {
        for (let i = 0; i < keepImageIds.length; i++) {
          await tx.inventoryImage.update({
            where: { id: keepImageIds[i] },
            data: { position: i },
          });
        }
      }

      /** SUBIR NUEVAS IMÁGENES AL FINAL */
      let startPosition = keepImageIds?.length ?? 0;

      if (Array.isArray(files)) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const upload = await this.cloudinaryService.uploadImage(
            file,
            folderPath,
          );

          await tx.inventoryImage.create({
            data: {
              inventoryId,
              url: upload.url,
              publicId: upload.publicId,
              position: startPosition + i,
            },
          });
        }
      }
    });

    /** DEVOLVER IMÁGENES ORDENADAS */
    const finalImages = await this.prisma.inventoryImage.findMany({
      where: { inventoryId },
      orderBy: { position: 'asc' },
    });

    return {
      success: true,
      message: 'Imágenes sincronizadas correctamente',
      data: finalImages,
    };
  }
}

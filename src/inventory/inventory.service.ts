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

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private variantsService: VariantsService,
  ) {}

  // Endpoint para buscar productos por término (nombre o parte de él)
  async search(term: string, user: any) {
    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    let where: any = {
      name: {
        contains: term,
        mode: 'insensitive',
      },
    };

    // SI NO ES GLOBAL → FILTRAR POR LOCALES DEL USUARIO
    if (!isGlobal) {
      // Cargar usuario real con relaciones
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        include: {
          managedLocals: true,
          local: true,
        },
      });

      if (!dbUser) {
        throw new ForbiddenException('Usuario no encontrado');
      }

      // ENCARGADO → varios locales
      if (dbUser.managedLocals.length > 0) {
        where.localId = {
          in: dbUser.managedLocals.map((l) => l.id),
        };
      }
      // USUARIO NORMAL → un solo local
      else if (dbUser.localId) {
        where.localId = dbUser.localId;
      }
      // SIN LOCAL → NO PUEDE BUSCAR
      else {
        throw new ForbiddenException(
          'No tienes un local asignado. Contacta al administrador.',
        );
      }
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        variants: true,
      },
      take: 10,
    });

    // Aplanamos variantes (cada color es una opción de venta)
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

    return {
      success: true,
      data: result,
    };
  }

  async findAll(user: any) {
    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    const where: any = {};

    if (!isGlobal) {
      // Cargar usuario real con relaciones
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        include: {
          managedLocals: true,
          local: true,
        },
      });

      if (!dbUser) {
        throw new ForbiddenException('Usuario no encontrado');
      }

      // ENCARGADO → varios locales
      if (dbUser.managedLocals.length > 0) {
        where.localId = {
          in: dbUser.managedLocals.map((l) => l.id),
        };
      }
      // USUARIO NORMAL → un solo local
      else if (dbUser.localId) {
        where.localId = dbUser.localId;
      }
      // SIN LOCAL
      else {
        throw new ForbiddenException(
          'No tienes un local asignado. Contacta al administrador.',
        );
      }
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
        category: true,
        provider: true,
        local: true,
      },
      orderBy: { name: 'asc' },
    });

    const data = products.map((product) => {
      const totalStock = product.variants.reduce(
        (sum, variant) => sum + variant.stock,
        0,
      );

      return { ...product, stock: totalStock };
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
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
        category: true,
        provider: true,
        local: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    if (!isGlobal) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        include: {
          managedLocals: true,
          local: true,
        },
      });

      if (!dbUser) {
        throw new ForbiddenException('Usuario no encontrado');
      }

      // ENCARGADO
      if (dbUser.managedLocals.length > 0) {
        const managedIds = dbUser.managedLocals.map((l) => l.id);
        if (!product.localId || !managedIds.includes(product.localId)) {
          throw new ForbiddenException(
            'No tienes permiso para ver productos de otro local',
          );
        }
      }
      // USUARIO NORMAL
      else if (dbUser.localId !== product.localId) {
        throw new ForbiddenException(
          'No tienes permiso para ver productos de otro local',
        );
      }
    }

    const stock = product.variants.reduce(
      (sum, variant) => sum + variant.stock,
      0,
    );

    return {
      success: true,
      message: 'Producto obtenido correctamente',
      data: { ...product, stock },
    };
  }

  async create(dto: CreateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.ASESOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.inventory.create({
        data: {
          name: dto.name,
          description: dto.description,
          purchasePrice: dto.purchasePrice,
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

          createdBy: { connect: { id: user.userId } },
          updatedBy: { connect: { id: user.userId } },
        },
      });

      const variants: InventoryVariant[] = [];

      for (const v of dto.variants) {
        const variant = await tx.inventoryVariant.create({
          data: {
            color: v.color,
            stock: v.stock,
            inventoryId: product.id,
            sku: 'PENDING',
          },
        });

        const sku = generateSku(dto.name, variant.sequence, variant.color);

        const updated = await tx.inventoryVariant.update({
          where: { id: variant.id },
          data: { sku },
        });

        variants.push(updated);
      }

      return {
        success: true,
        message: 'Producto creado correctamente',
        data: {
          ...product,
          variants,
        },
      };
    });
  }

  async update(id: number, dto: UpdateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.ASESOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    await this.findOne(id, user);

    const data: any = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice;
    if (dto.salePrice !== undefined) data.salePrice = dto.salePrice;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.brandId) data.brand = { connect: { id: dto.brandId } };
    if (dto.categoryId) data.category = { connect: { id: dto.categoryId } };
    if (dto.providerId) data.provider = { connect: { id: dto.providerId } };
    if (dto.localId) data.local = { connect: { id: dto.localId } };

    data.updatedBy = { connect: { id: user.userId } };

    const updatedProduct = await this.prisma.inventory.update({
      where: { id },
      data,
      include: {
        variants: true,
        brand: true,
        category: true,
        provider: true,
        local: true,
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
      throw new ForbiddenException('No tienes permisos');
    }

    const product = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Eliminar imágenes de Cloudinary
    for (const img of product.images) {
      try {
        await this.cloudinaryService.deleteImage(img.publicId);
      } catch (err) {
        console.error(
          `Error eliminando imagen en Cloudinary (${img.publicId}):`,
          err,
        );
      }
    }

    // Eliminar producto (y todo en cascada: variantes, imágenes en BD)
    await this.prisma.inventory.delete({
      where: { id },
    });

    return {
      success: true,
      message:
        'Producto eliminado correctamente junto con imágenes y variantes',
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

    // Carpeta dinámica
    const categoryFolder = product.category?.name
      ? product.category.name.toLowerCase().replace(/\s+/g, '-')
      : 'sin-categoria';

    const brandFolder = product.brand?.name
      ? product.brand.name.toLowerCase().replace(/\s+/g, '-')
      : 'sin-marca';

    const folderPath = `inventory/${categoryFolder}/${brandFolder}`;

    // SUBIR NUEVAS IMÁGENES (al final)
    for (const file of files) {
      const upload = await this.cloudinaryService.uploadImage(
        file,
        folderPath,
        undefined,
      );

      await this.prisma.inventoryImage.create({
        data: {
          inventoryId,
          url: upload.url,
          publicId: upload.publicId,
          position: keepImageIds.length, // se agrega al final
        },
      });
    }

    // ELIMINAR SOLO SI REALMENTE ME ENVIARON IDS A CONSERVAR
    if (Array.isArray(keepImageIds) && keepImageIds.length > 0) {
      const imagesToDelete = product.images.filter(
        (img) => !keepImageIds.includes(img.id),
      );

      for (const img of imagesToDelete) {
        try {
          await this.cloudinaryService.deleteImage(img.publicId);
        } catch (err) {
          console.error('Error eliminando imagen en Cloudinary:', err);
        }

        await this.prisma.inventoryImage.delete({
          where: { id: img.id },
        });
      }
    }

    // ACTUALIZAR ORDEN (POSITION)
    if (Array.isArray(keepImageIds)) {
      for (let i = 0; i < keepImageIds.length; i++) {
        await this.prisma.inventoryImage.update({
          where: { id: keepImageIds[i] },
          data: { position: i },
        });
      }
    }

    // DEVOLVER IMÁGENES ORDENADAS
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

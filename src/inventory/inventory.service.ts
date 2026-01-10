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
import { InventoryImage, InventoryVariant, Role } from '@prisma/client';
import { generateSku } from 'utils/sku.util';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async findAll() {
    const products = await this.prisma.inventory.findMany({
      include: {
        images: true,
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

      return {
        ...product,
        stock: totalStock,
      };
    });

    return {
      success: true,
      message: 'Inventario obtenido correctamente',
      data,
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        images: true,
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

    const stock = product.variants.reduce(
      (sum, variant) => sum + variant.stock,
      0,
    );

    return {
      success: true,
      message: 'Producto obtenido correctamente',
      data: {
        ...product,
        stock,
      },
    };
  }

  async create(dto: CreateInventoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
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
        },
      });

      const variants: InventoryVariant[] = [];

      for (const v of dto.variants) {
        const variant = await tx.inventoryVariant.create({
          data: {
            color: v.color,
            stock: v.stock,
            inventoryId: product.id,
            sku: 'PENDING', // valor temporal ÚNICO
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
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    await this.findOne(id);

    const data: any = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice;
    if (dto.salePrice !== undefined) data.salePrice = dto.salePrice;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.brandId) {
      data.brand = { connect: { id: dto.brandId } };
    }

    if (dto.categoryId) {
      data.category = { connect: { id: dto.categoryId } };
    }

    if (dto.providerId) {
      data.provider = { connect: { id: dto.providerId } };
    }

    if (dto.localId) {
      data.local = { connect: { id: dto.localId } };
    }

    return this.prisma.inventory.update({
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
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    await this.findOne(id);

    await this.prisma.inventory.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Producto eliminado correctamente',
    };
  }

  // SUBIR IMAGEN DE PRODUCTO
  async uploadProductImages(
    inventoryId: number,
    files: Express.Multer.File[],
    user: any,
  ) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('Debes subir al menos una imagen');
    }

    const product = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const uploadedImages: InventoryImage[] = [];

    for (const file of files) {
      const upload = await this.cloudinaryService.uploadImage(
        file,
        'inventory', // carpeta en Cloudinary
        undefined,
      );

      const image = await this.prisma.inventoryImage.create({
        data: {
          inventoryId,
          url: upload.url,
          publicId: upload.publicId,
        },
      });

      uploadedImages.push(image);
    }

    return {
      success: true,
      message:
        files.length === 1
          ? 'Imagen subida correctamente'
          : 'Imágenes subidas correctamente',
      data: uploadedImages,
    };
  }

  // ELIMINAR IMAGEN
  async deleteProductImage(imageId: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const image = await this.prisma.inventoryImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Imagen no encontrada');
    }

    // Eliminar de Cloudinary
    try {
      await this.cloudinaryService.deleteImage(image.publicId);
    } catch (err) {
      console.error('Error eliminando imagen en Cloudinary:', err);
      throw new Error('No se pudo eliminar la imagen en Cloudinary');
    }

    // Eliminar de la base de datos
    await this.prisma.inventoryImage.delete({
      where: { id: imageId },
    });

    return {
      success: true,
      message: 'Imagen eliminada correctamente',
    };
  }
}

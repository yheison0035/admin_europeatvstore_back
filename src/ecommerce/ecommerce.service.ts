import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

const ECOMMERCE_LOCAL_ID = 3;

@Injectable()
export class EcommerceService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategoriesWithProducts() {
    const categories = await this.prisma.category.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
      },
      orderBy: { name: 'asc' },
      include: {
        inventories: {
          where: {
            localId: ECOMMERCE_LOCAL_ID,
            status: 'ACTIVO',
          },
          include: {
            images: {
              orderBy: { position: 'asc' },
            },
            variants: true,
            brand: true,
          },
        },
      },
    });

    const data = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      products: category.inventories.map((product) => {
        const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

        const oldPrice =
          product.oldPrice && product.oldPrice > product.salePrice
            ? product.oldPrice
            : null;

        const discount =
          oldPrice && oldPrice > product.salePrice
            ? Math.round(((oldPrice - product.salePrice) / oldPrice) * 100)
            : 0;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.salePrice,
          oldPrice,
          discount,
          stock,
          brand: product.brand?.name ?? null,
          images: product.images.map((img) => img.url),
        };
      }),
    }));

    return {
      success: true,
      data,
    };
  }

  async searchProducts(term: string) {
    const products = await this.prisma.inventory.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
        name: { contains: term, mode: 'insensitive' },
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
      },
      take: 20,
    });

    const data = products.map((product) => {
      const colors = product.variants
        .filter((v) => v.stock > 0)
        .map((v) => ({
          name: v.color,
          stock: v.stock,
        }));

      const oldPrice =
        product.oldPrice && product.oldPrice > product.salePrice
          ? product.oldPrice
          : null;

      const discount = oldPrice
        ? Math.round(((oldPrice - product.salePrice) / oldPrice) * 100)
        : 0;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.salePrice,
        oldPrice,
        discount,
        colors,
        image: product.images[0]?.url ?? null,
      };
    });

    return { success: true, data };
  }

  async getNewProducts(limit = 10) {
    const products = await this.prisma.inventory.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
      },
    });

    return {
      success: true,
      data: products.map((product) => {
        const stock = product.variants.reduce((s, v) => s + v.stock, 0);

        const oldPrice =
          product.oldPrice && product.oldPrice > product.salePrice
            ? product.oldPrice
            : null;

        const discount = oldPrice
          ? Math.round(((oldPrice - product.salePrice) / oldPrice) * 100)
          : 0;

        return {
          id: product.id,
          name: product.name,
          price: product.salePrice,
          oldPrice,
          discount,
          stock,
          brand: product.brand?.name ?? null,
          image: product.images[0]?.url ?? null,
        };
      }),
    };
  }

  async getOffers(limit = 10) {
    const products = await this.prisma.inventory.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
        oldPrice: { not: null },
        salePrice: { lt: this.prisma.inventory.fields.oldPrice },
      },
      orderBy: {
        oldPrice: 'desc',
      },
      take: limit,
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
      },
    });

    return {
      success: true,
      data: products.map((product) => {
        const discount = Math.round(
          ((product.oldPrice! - product.salePrice) / product.oldPrice!) * 100,
        );

        return {
          id: product.id,
          name: product.name,
          price: product.salePrice,
          oldPrice: product.oldPrice,
          discount,
          image: product.images[0]?.url ?? null,
        };
      }),
    };
  }
}

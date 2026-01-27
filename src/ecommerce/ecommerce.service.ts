import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

const ECOMMERCE_LOCAL_ID = 3;

@Injectable()
export class EcommerceService {
  constructor(private readonly prisma: PrismaService) {}

  // Imprime categorias
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
            features: { orderBy: { order: 'asc' } },
            specifications: { orderBy: { order: 'asc' } },
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

  // Busqueda de productos
  async searchProducts(term: string) {
    const normalizedTerm = term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const products = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT i.*
      FROM "Inventory" i
      WHERE
        i."localId" = ${ECOMMERCE_LOCAL_ID}
        AND i."status" = 'ACTIVO'
        AND translate(
              lower(i."name"),
              'áéíóúÁÉÍÓÚñÑ',
              'aeiouAEIOUnN'
            ) LIKE '%' || ${normalizedTerm} || '%'
      ORDER BY i."createdAt" DESC
      LIMIT 20
    `;

    const fullProducts = await this.prisma.inventory.findMany({
      where: {
        id: { in: products.map((p) => p.id) },
      },
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: true,
        features: { orderBy: { order: 'asc' } },
        specifications: { orderBy: { order: 'asc' } },
      },
    });

    const data = fullProducts.map((product) => {
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
        category: product.category
          ? product.category.name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, '-')
          : null,
      };
    });

    return { success: true, data };
  }

  // Imprime novedades
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

  // Imprime ofertas
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

  // Imprime productos por categorias y filtros
  async getProductsByCategory(
    slug: string,
    filters: {
      colors?: string;
      brands?: string;
      minPrice?: string;
      maxPrice?: string;
      sort?: string;
    },
  ) {
    const { colors, brands, minPrice, maxPrice, sort } = filters;

    let orderBy: any = { createdAt: 'desc' };

    switch (sort) {
      case 'price_asc':
        orderBy = { salePrice: 'asc' };
        break;
      case 'price_desc':
        orderBy = { salePrice: 'desc' };
        break;
      case 'name_asc':
        orderBy = { name: 'asc' };
        break;
      case 'name_desc':
        orderBy = { name: 'desc' };
        break;
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
    }

    const products = await this.prisma.inventory.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
        category: {
          name: {
            equals: slug.replace('-', ' '),
            mode: 'insensitive',
          },
        },
        salePrice: {
          gte: minPrice ? Number(minPrice) : undefined,
          lte: maxPrice ? Number(maxPrice) : undefined,
        },
        brand: brands
          ? {
              name: {
                in: brands.split(','),
                mode: 'insensitive',
              },
            }
          : undefined,
        variants: colors
          ? {
              some: {
                color: {
                  in: colors.split(','),
                  mode: 'insensitive',
                },
                stock: { gt: 0 },
              },
            }
          : undefined,
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
      },
      orderBy,
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
        brand: product.brand?.name ?? null,
        image: product.images[0]?.url ?? null,
      };
    });

    return {
      success: true,
      total: data.length,
      data,
    };
  }

  // Imprime producto por slug
  async getProductBySlug(slug: string) {
    const product = await this.prisma.inventory.findFirst({
      where: {
        slug,
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        features: { orderBy: { order: 'asc' } },
        specifications: { orderBy: { order: 'asc' } },
      },
    });

    if (!product) {
      return { success: false, data: null };
    }

    const colors = product.variants.map((v) => ({
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
      success: true,
      data: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.salePrice,
        oldPrice,
        discount,
        images: product.images.map((i) => i.url),
        colors,
        features: product.features,
        specifications: product.specifications,
      },
    };
  }
}

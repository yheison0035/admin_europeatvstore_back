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
          slug: product.slug,
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
        slug: product.slug,
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
        category: true,
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
          slug: product.slug,
          price: product.salePrice,
          oldPrice,
          discount,
          stock,
          brand: product.brand?.name ?? null,
          category: product.category?.name ?? null,
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
        category: true,
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
          slug: product.slug,
          price: product.salePrice,
          oldPrice: product.oldPrice,
          discount,
          category: product.category?.name ?? null,
          image: product.images[0]?.url ?? null,
        };
      }),
    };
  }

  // Imprime productos por (categorias-novedades-filtros) y filtros
  async getProductsCatalog(options: {
    categorySlug?: string;
    mode?: 'category' | 'new' | 'offers';
    colors?: string;
    brands?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }) {
    const {
      categorySlug,
      mode = 'category',
      colors,
      brands,
      minPrice,
      maxPrice,
      sort,
    } = options;

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

    /** WHERE BASE */
    const where: any = {
      localId: ECOMMERCE_LOCAL_ID,
      status: 'ACTIVO',
      salePrice: {
        gte: minPrice ? Number(minPrice) : undefined,
        lte: maxPrice ? Number(maxPrice) : undefined,
      },
    };

    /** MODO CATEGORY */
    if (mode === 'category' && categorySlug) {
      where.category = {
        name: {
          equals: categorySlug.replace('-', ' '),
          mode: 'insensitive',
        },
      };
    }

    /** MODO NOVEDADES */
    if (mode === 'new') {
      where.createdAt = {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // últimos 30 días
      };
    }

    /** MODO OFERTAS */
    if (mode === 'offers') {
      where.oldPrice = { not: null };
      where.salePrice = { lt: this.prisma.inventory.fields.oldPrice };
    }

    /** FILTROS */
    if (brands) {
      where.brand = {
        name: {
          in: brands.split(','),
          mode: 'insensitive',
        },
      };
    }

    if (colors) {
      where.variants = {
        some: {
          color: {
            in: colors.split(','),
            mode: 'insensitive',
          },
          stock: { gt: 0 },
        },
      };
    }

    const products = await this.prisma.inventory.findMany({
      where,
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
        category: true,
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

      const stock = colors.reduce((s, c) => s + c.stock, 0);

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
        slug: product.slug,
        price: product.salePrice,
        oldPrice,
        discount,
        stock,
        colors,
        brand: product.brand?.name ?? null,
        category: product.category?.name ?? null,
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
        slug: product.slug,
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

  // Productos relacionados
  async getRelatedProducts(slug: string, limit = 8) {
    // 1. Producto base
    const baseProduct = await this.prisma.inventory.findFirst({
      where: {
        slug,
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
      },
      select: {
        id: true,
        categoryId: true,
        brandId: true,
      },
    });

    if (!baseProduct) {
      return { success: false, data: [] };
    }

    const orConditions: any[] = [];

    if (baseProduct.categoryId) {
      orConditions.push({ categoryId: baseProduct.categoryId });
    }

    if (baseProduct.brandId) {
      orConditions.push({ brandId: baseProduct.brandId });
    }

    if (orConditions.length === 0) {
      return { success: true, data: [] };
    }

    // 3. Query relacionados
    const products = await this.prisma.inventory.findMany({
      where: {
        localId: ECOMMERCE_LOCAL_ID,
        status: 'ACTIVO',
        id: { not: baseProduct.id },
        OR: orConditions,
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: true,
        brand: true,
        category: true,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 4. Formatear respuesta
    const data = products.map((product) => {
      const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

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
        slug: product.slug,
        price: product.salePrice,
        oldPrice,
        discount,
        stock,
        brand: product.brand?.name ?? null,
        category: product.category?.name ?? null,
        image: product.images[0]?.url ?? null,
      };
    });

    return {
      success: true,
      data,
    };
  }
}

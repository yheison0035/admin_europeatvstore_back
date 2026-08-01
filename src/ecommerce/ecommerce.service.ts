import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateEcommerceOrderDto } from './dto/create-ecommerce-order.dto';
import { PaymentMethod } from '@prisma/client';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

const SORT_OPTIONS = [
  { label: 'Precio: menor a mayor', value: 'price_asc' },
  { label: 'Precio: mayor a menor', value: 'price_desc' },
  { label: 'A - Z', value: 'name_asc' },
  { label: 'Z - A', value: 'name_desc' },
];

@Injectable()
export class EcommerceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convierte un nombre en el slug que usan las URLs de la tienda.
   * Debe dar el mismo resultado que el slug del sitemap y el del front.
   */
  private slugify(value: string) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  // Imprime categorias
  async getCategoriesWithProducts(website: WebsiteContext) {
    const { localId } = website;

    const categories = await this.prisma.category.findMany({
      where: {
        localId,
        status: 'ACTIVO',
      },
      orderBy: { name: 'asc' },
      include: {
        inventories: {
          where: {
            localId: localId,
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
  async searchProducts(term: string, website: WebsiteContext) {
    const { localId } = website;

    const normalizedTerm = term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const products = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT i.*
      FROM "Inventory" i
      WHERE
        i."localId" = ${localId}
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
          variantId: v.id,
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
  async getNewProducts(limit = 10, website: WebsiteContext) {
    const { localId } = website;

    const products = await this.prisma.inventory.findMany({
      where: {
        localId,
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
  async getOffers(limit = 10, website: WebsiteContext) {
    const { localId } = website;

    const products = await this.prisma.inventory.findMany({
      where: {
        localId,
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
  async getProductsCatalog(
    options: {
      categorySlug?: string;
      mode?: 'category' | 'new' | 'offers';
      colors?: string;
      brands?: string;
      minPrice?: string;
      maxPrice?: string;
      sort?: string;
    },
    website: WebsiteContext,
  ) {
    const {
      categorySlug,
      mode = 'category',
      colors,
      brands,
      minPrice,
      maxPrice,
      sort,
    } = options;
    const { localId } = website;

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
      localId: localId,
      status: 'ACTIVO',
      salePrice: {
        gte: minPrice ? Number(minPrice) : undefined,
        lte: maxPrice ? Number(maxPrice) : undefined,
      },
    };

    /** CATEGORY */
    if (mode === 'category' && categorySlug) {
      // El slug de la URL se compara contra el slug del nombre de la categoría.
      // (Antes se hacía `replace('-', ' ')`, que solo cambia el PRIMER guion y
      // dejaba sin productos a toda categoría de tres o más palabras.)
      const categories = await this.prisma.category.findMany({
        where: { localId, status: 'ACTIVO' },
        select: { id: true, name: true },
      });

      const target = this.slugify(categorySlug);

      const category = categories.find(
        (item) => this.slugify(item.name) === target,
      );

      if (!category) {
        return {
          success: true,
          total: 0,
          data: [],
          filters: {
            colors: [],
            brands: [],
            price: { min: 0, max: 0 },
            sort: SORT_OPTIONS,
          },
        };
      }

      where.categoryId = category.id;
    }

    /** NOVEDADES */
    if (mode === 'new') {
      where.createdAt = {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      };
    }

    /** OFERTAS */
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

    /** ====== FILTROS DINÁMICOS ====== */
    const colorMap = new Map<string, number>();
    const brandMap = new Map<string, number>();
    let minPriceFound = Infinity;
    let maxPriceFound = 0;

    const data = products.map((product) => {
      product.variants.forEach((v) => {
        if (v.stock > 0) {
          colorMap.set(v.color, (colorMap.get(v.color) || 0) + v.stock);
        }
      });

      if (product.brand?.name) {
        brandMap.set(
          product.brand.name,
          (brandMap.get(product.brand.name) || 0) + 1,
        );
      }

      minPriceFound = Math.min(minPriceFound, product.salePrice);
      maxPriceFound = Math.max(maxPriceFound, product.salePrice);

      const colors = product.variants
        .filter((v) => v.stock > 0)
        .map((v) => ({ variantId: v.id, name: v.color, stock: v.stock }));

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

    const filters = {
      colors: Array.from(colorMap.entries()).map(([name, count]) => ({
        label: name.charAt(0).toUpperCase() + name.slice(1),
        value: name.toLowerCase(),
        count,
      })),
      brands: Array.from(brandMap.entries()).map(([name, count]) => ({
        label: name,
        value: name.toLowerCase(),
        count,
      })),
      price: {
        min: isFinite(minPriceFound) ? minPriceFound : 0,
        max: maxPriceFound,
      },
      sort: SORT_OPTIONS,
    };

    return {
      success: true,
      total: data.length,
      data,
      filters,
    };
  }

  // Imprime producto por slug
  async getProductBySlug(slug: string, website: WebsiteContext) {
    const { localId } = website;

    const product = await this.prisma.inventory.findFirst({
      where: {
        slug,
        localId: localId,
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
      variantId: v.id,
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
  async getRelatedProducts(slug: string, limit = 8, website: WebsiteContext) {
    const { localId } = website;

    // 1. Producto base
    const baseProduct = await this.prisma.inventory.findFirst({
      where: {
        slug,
        localId: localId,
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
        localId: localId,
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

  async getProductsForSitemap(website: WebsiteContext) {
    const { localId } = website;

    const products = await this.prisma.inventory.findMany({
      where: {
        status: 'ACTIVO',
        localId: localId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        slug: true,
        updatedAt: true,
        category: {
          select: { name: true },
        },
      },
    });

    return products.map((p) => ({
      slug: p.slug,
      category: p.category?.name
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-'),
      updatedAt: p.updatedAt,
    }));
  }

  /* CHECKOUT ECOMMERCE */

  /**
   * Prefijo del código de pedido a partir del nombre de la empresa
   * (cada tienda es de un negocio distinto, no puede ir fijo).
   */
  private buildOrderPrefix(companyName?: string | null) {
    const letters = (companyName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');

    return letters.slice(0, 3) || 'WEB';
  }

  async createOrder(dto: CreateEcommerceOrderDto, website: WebsiteContext) {
    const { localId } = website;

    return this.prisma.$transaction(async (tx) => {
      /**  CLIENTE ECOMMERCE */
      let ecommerceCustomer = await tx.ecommerceCustomer.findUnique({
        where: { email: dto.customer.email },
      });

      if (!ecommerceCustomer) {
        ecommerceCustomer = await tx.ecommerceCustomer.create({
          data: {
            email: dto.customer.email,
            firstName: dto.customer.firstName,
            lastName: dto.customer.lastName,
            phone: dto.customer.phone,
            documentNumber: dto.customer.documentNumber,
            department: dto.customer.department,
            city: dto.customer.city,
            address: dto.customer.address,
            addressDetail: dto.customer.addressDetail,
            neighborhood: dto.customer.neighborhood,
            billingSameAsShipping: dto.customer.billingSameAsShipping,
            billingFirstName: dto.customer.billingFirstName,
            billingLastName: dto.customer.billingLastName,
            billingPhone: dto.customer.billingPhone,
            billingAddress: dto.customer.billingAddress,
            isHardToAccess: dto.customer.isHardToAccess ?? false,
            localId: localId,
          },
        });
      }

      /** =========================
     * VALIDAR ITEMS + STOCK
     ========================== */
      let total = 0;
      const itemsData: any[] = [];

      for (const item of dto.items) {
        const variant = await tx.inventoryVariant.findFirst({
          where: {
            id: item.inventoryVariantId,
            inventory: {
              localId: website.localId,
              status: 'ACTIVO',
            },
          },
          include: {
            inventory: true,
          },
        });

        // Son errores del comprador (producto retirado o sin stock), no fallos
        // del servidor: se devuelven como 400 para que la tienda los muestre.
        if (!variant) {
          throw new BadRequestException(
            'Uno de los productos ya no está disponible. Actualiza tu carrito.',
          );
        }

        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.inventory.name} (${variant.color}). Quedan ${variant.stock}.`,
          );
        }

        const price = variant.inventory.salePrice;
        const subtotal = price * item.quantity;
        total += subtotal;

        // Descontar stock
        await tx.inventoryVariant.update({
          where: { id: variant.id },
          data: { stock: { decrement: item.quantity } },
        });

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          subtotal,
        });
      }

      // El costo de envío se suma al total (para que coincida con lo cobrado).
      const shippingCost = Number(dto.shippingCost) || 0;
      total += shippingCost;

      /** ACTORES DEL CHECKOUT (se crean/resuelven si la empresa no los tenía) */
      let crmCustomerId = website.customerId;
      if (!crmCustomerId) {
        const cf = await tx.customer.upsert({
          where: {
            document_companyId: {
              document: '222222222222',
              companyId: website.companyId,
            },
          },
          update: {},
          create: {
            document: '222222222222',
            name: 'CONSUMIDOR FINAL',
            companyId: website.companyId,
          },
          select: { id: true },
        });
        crmCustomerId = cf.id;
      }

      let systemUserId = website.systemUserId;
      if (!systemUserId) {
        const su =
          (await tx.user.findFirst({
            where: {
              companyId: website.companyId,
              status: 'ACTIVO',
              role: 'SUPER_ADMIN',
            },
            select: { id: true },
          })) ||
          (await tx.user.findFirst({
            where: { companyId: website.companyId, status: 'ACTIVO' },
            select: { id: true },
          }));
        if (!su) {
          throw new BadRequestException(
            'La tienda no está lista para recibir pedidos. Contacta al administrador.',
          );
        }
        systemUserId = su.id;
      }

      /** CREAR VENTA (SALE) */
      const sale = await tx.sale.create({
        data: {
          code: `${this.buildOrderPrefix(website.company?.name)}-${Date.now()}`,
          totalAmount: total,

          paymentMethod: dto.paymentMethod,
          paymentStatus:
            dto.paymentMethod === 'TRANSFERENCIA'
              ? 'EN_VALIDACION'
              : 'PENDIENTE',

          saleStatus: 'NUEVA',
          source: 'ECOMMERCE',

          customerId: crmCustomerId,
          ecommerceCustomerId: ecommerceCustomer.id,

          localId: localId,
          userId: systemUserId,

          wompiTransactionId: dto.wompiTransactionId ?? null,
          wompiReference: dto.wompiReference ?? null,
          wompiPayload: dto.wompiPayload ?? null,

          items: {
            create: itemsData,
          },
        },
      });

      /** CREAR ENVÍO */
      await tx.shipment.create({
        data: {
          saleId: sale.id,
          status: 'PENDIENTE',
        },
      });

      return {
        success: true,
        orderCode: sale.code,
        saleId: sale.id,
        paymentMethod: dto.paymentMethod,
      };
    });
  }
}

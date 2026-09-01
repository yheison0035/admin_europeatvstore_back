import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, Status } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';
import { WebsiteContext } from './interfaces/website-context.interface';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import {
  CreateWebsiteBannerDto,
  UpdateWebsiteBannerDto,
} from './dto/website-banner.dto';
import { PlanLimitsService } from '@/common/plan-limits.service';

@Injectable()
export class WebsiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  normalizeDomain(host: string): string {
    return host
      .replace('https://', '')
      .replace('http://', '')
      .replace('www.', '')
      .split(':')[0]
      .toLowerCase();
  }

  async resolveCompany(host: string): Promise<WebsiteContext> {
    const domain = this.normalizeDomain(host);

    const company = await this.getWebsiteCompany(domain);

    if (!company) {
      throw new NotFoundException('Sitio web no encontrado.');
    }

    if (!company.websiteSetting) {
      throw new NotFoundException(
        'La empresa no tiene configurado el sitio web.',
      );
    }

    if (!company.websiteSetting.ecommerceLocalId) {
      throw new NotFoundException(
        'La empresa no tiene configurado el local del ecommerce.',
      );
    }

    const customerId = await this.getConsumidorFinal(company.id);

    const systemUserId = await this.getSystemUser(company.id);

    // Ajustes de tienda por tipo (fulfillment/layout) configurados por la
    // plataforma: la tienda los usa para adaptar entrega y catálogo.
    const typeCfg = company.type
      ? await this.prisma.businessTypeConfig.findUnique({
          where: { type: company.type },
          select: { storefront: true, terminology: true, active: true },
        })
      : null;
    (company as any).typeStorefront =
      typeCfg && typeCfg.active ? (typeCfg.storefront ?? null) : null;
    // Vocabulario del tipo: la tienda lo usa para nombrar producto/pedido/menú.
    (company as any).typeTerminology =
      typeCfg && typeCfg.active ? (typeCfg.terminology ?? null) : null;

    return {
      companyId: company.id,
      localId: company.websiteSetting.ecommerceLocalId,
      customerId,
      systemUserId,
      domain,
      company,
      settings: company.websiteSetting,
      banners: company.websiteBanners,
    };
  }

  /* ==========================================================
     ADMINISTRACIÓN DEL SITIO (desde el CRM)
     Cada empresa configura SU tienda; la plataforma puede
     configurar la de cualquiera pasando ?companyId=.
     ========================================================== */

  private resolveCompanyId(user: any, companyId?: number) {
    const isPlatform = user?.role === Role.SUPER_PLATFORM_ADMIN;

    const target = isPlatform && companyId ? Number(companyId) : user?.companyId;

    if (!target) {
      throw new ForbiddenException('No autorizado');
    }

    return { companyId: target, isPlatform };
  }

  /** Configuración editable del sitio (para el formulario del CRM). */
  async getAdminConfig(user: any, companyId?: number) {
    const { companyId: id } = this.resolveCompanyId(user, companyId);

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        logo: true,
        // Se devuelven para que el CRM muestre de dónde saldrán los datos de
        // contacto si la tienda no define los suyos.
        phone: true,
        email: true,
        domain: true,
        websiteEnabled: true,
        websiteName: true,
        favicon: true,
        theme: true,
        fontFamily: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        ctaColor: true,
        heroTitle: true,
        heroSubtitle: true,
        websiteSetting: true,
        websiteBanners: { orderBy: { order: 'asc' } },
        locals: {
          where: { status: Status.ACTIVO },
          select: { id: true, name: true, address: true, city: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    return company;
  }

  async updateConfig(user: any, dto: UpdateWebsiteDto, companyId?: number) {
    const { companyId: id, isPlatform } = this.resolveCompanyId(
      user,
      companyId,
    );

    // La tienda online requiere plan Altura o superior (la plataforma no se
    // restringe).
    if (!isPlatform) {
      await this.planLimits.assertModule(id, 'website');
    }

    const {
      // Solo la plataforma toca dominio y publicación: son infraestructura.
      domain,
      websiteEnabled,
      // Ajustes del sitio (tabla aparte).
      facebook,
      instagram,
      whatsapp,
      youtube,
      tiktok,
      address,
      schedule,
      footerText,
      metaTitle,
      metaDescription,
      ecommerceLocalId,
      // El resto son campos de la empresa (identidad y diseño).
      ...companyFields
    } = dto;

    if (ecommerceLocalId !== undefined) {
      const local = await this.prisma.local.findFirst({
        where: { id: ecommerceLocalId, companyId: id },
      });

      if (!local) {
        throw new NotFoundException('La sede indicada no existe.');
      }
    }

    if (domain !== undefined || websiteEnabled !== undefined) {
      if (!isPlatform) {
        throw new ForbiddenException(
          'El dominio y la publicación del sitio los gestiona la plataforma.',
        );
      }
    }

    const normalizedDomain =
      domain === undefined
        ? undefined
        : domain
          ? this.normalizeDomain(domain)
          : null;

    if (normalizedDomain) {
      const taken = await this.prisma.company.findFirst({
        where: { domain: normalizedDomain, NOT: { id } },
        select: { id: true },
      });

      if (taken) {
        throw new ConflictException('Ese dominio ya está en uso.');
      }
    }

    const settingsData = {
      facebook,
      instagram,
      whatsapp,
      youtube,
      tiktok,
      address,
      schedule,
      footerText,
      metaTitle,
      metaDescription,
      ecommerceLocalId,
    };

    const hasSettings = Object.values(settingsData).some(
      (value) => value !== undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: {
          ...companyFields,
          ...(normalizedDomain !== undefined ? { domain: normalizedDomain } : {}),
          ...(websiteEnabled !== undefined ? { websiteEnabled } : {}),
        },
      });

      if (hasSettings) {
        await tx.websiteSetting.upsert({
          where: { companyId: id },
          update: settingsData,
          create: { companyId: id, ...settingsData },
        });
      }

      return { success: true };
    });
  }

  /** Sube una imagen del sitio a Cloudinary, separada por empresa. */
  async uploadImage(
    user: any,
    file: Express.Multer.File,
    companyId?: number,
  ) {
    const { companyId: id } = this.resolveCompanyId(user, companyId);

    if (!file) {
      throw new BadRequestException('No se recibió ninguna imagen.');
    }

    const { url, publicId } = await this.cloudinary.uploadImage(
      file,
      `website/${id}`,
    );

    return { url, publicId };
  }

  /* ---------- Banners ---------- */

  async createBanner(
    user: any,
    dto: CreateWebsiteBannerDto,
    companyId?: number,
  ) {
    const { companyId: id } = this.resolveCompanyId(user, companyId);

    return this.prisma.websiteBanner.create({
      data: { ...dto, companyId: id },
    });
  }

  async updateBanner(
    user: any,
    bannerId: number,
    dto: UpdateWebsiteBannerDto,
    companyId?: number,
  ) {
    const { companyId: id } = this.resolveCompanyId(user, companyId);

    const banner = await this.prisma.websiteBanner.findFirst({
      where: { id: bannerId, companyId: id },
    });

    if (!banner) {
      throw new NotFoundException('Banner no encontrado.');
    }

    return this.prisma.websiteBanner.update({
      where: { id: bannerId },
      data: dto,
    });
  }

  async removeBanner(user: any, bannerId: number, companyId?: number) {
    const { companyId: id } = this.resolveCompanyId(user, companyId);

    const banner = await this.prisma.websiteBanner.findFirst({
      where: { id: bannerId, companyId: id },
    });

    if (!banner) {
      throw new NotFoundException('Banner no encontrado.');
    }

    await this.prisma.websiteBanner.delete({ where: { id: bannerId } });

    return { success: true };
  }

  private async getWebsiteCompany(domain: string) {
    return this.prisma.company.findFirst({
      where: {
        domain,
        websiteEnabled: true,
        status: 'ACTIVO',
      },
      include: {
        websiteSetting: {
          include: {
            ecommerceLocal: true,
          },
        },

        websiteBanners: {
          where: {
            active: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });
  }

  private async getConsumidorFinal(companyId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        companyId,
        name: {
          equals: 'CONSUMIDOR FINAL',
          mode: 'insensitive',
        },
      },
    });

    // No se lanza error: el catálogo debe funcionar aunque falte. El checkout
    // (createOrder) crea el "Consumidor Final" si hace falta.
    return customer?.id ?? null;
  }

  private async getSystemUser(companyId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        companyId,
        status: 'ACTIVO',
        role: 'SUPER_ADMIN',
      },
    });

    if (!user) {
      // No se lanza error: el catálogo no depende de esto. El checkout resuelve
      // el usuario del sistema.
      return null;
    }

    return user.id;
  }
}

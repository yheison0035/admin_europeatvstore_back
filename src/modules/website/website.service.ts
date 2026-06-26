import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { WebsiteContext } from './interfaces/website-context.interface';

@Injectable()
export class WebsiteService {
  constructor(private readonly prisma: PrismaService) {}

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

    if (!customer) {
      throw new Error(
        'No existe un cliente Consumidor Final para esta empresa.',
      );
    }

    return customer.id;
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
      throw new Error('No existe un usuario del sistema para esta empresa.');
    }

    return user.id;
  }
}

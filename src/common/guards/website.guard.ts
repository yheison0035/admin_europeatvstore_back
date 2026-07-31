import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WebsiteService } from '@/modules/website/website.service';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

@Injectable()
export class WebsiteGuard implements CanActivate {
  constructor(private readonly websiteService: WebsiteService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const rawHost =
      request.headers['x-website-domain'] ||
      request.headers['x-forwarded-host'] ||
      request.headers.host;

    // Las cabeceras pueden llegar repetidas (array) o con varios hosts separados por coma.
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost || '')
      .split(',')[0]
      .trim();

    if (!host) {
      throw new NotFoundException('Sitio web no encontrado.');
    }

    request.website = await this.websiteService.resolveCompany(host);

    return true;
  }
}

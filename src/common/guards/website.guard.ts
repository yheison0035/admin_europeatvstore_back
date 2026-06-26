import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WebsiteService } from '@/modules/website/website.service';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

@Injectable()
export class WebsiteGuard implements CanActivate {
  constructor(private readonly websiteService: WebsiteService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const host =
      request.headers['x-website-domain'] ||
      request.headers['x-forwarded-host'] ||
      request.headers.host;

    request.website = await this.websiteService.resolveCompany(host);

    return true;
  }
}

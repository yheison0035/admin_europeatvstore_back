import { Company, WebsiteBanner, WebsiteSetting } from '@prisma/client';

export interface WebsiteContext {
  companyId: number;
  localId: number;
  customerId: number;
  systemUserId: number;
  domain: string;
  company: Company;
  settings: WebsiteSetting;
  banners: WebsiteBanner[];
}

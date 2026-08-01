import { Company, WebsiteBanner, WebsiteSetting } from '@prisma/client';

export interface WebsiteContext {
  companyId: number;
  localId: number;
  customerId: number | null;
  systemUserId: number | null;
  domain: string;
  company: Company;
  settings: WebsiteSetting;
  banners: WebsiteBanner[];
}

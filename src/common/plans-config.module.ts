import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PlansConfigService } from './plans-config.service';

// Global: disponible para PlanLimitsService (que se provee por módulo) y para
// el controlador de SUPER_PLATFORM, sin declararlo en cada módulo.
@Global()
@Module({
  providers: [PlansConfigService, PrismaService],
  exports: [PlansConfigService],
})
export class PlansConfigModule {}

import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/roles.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Historial de cambios de un registro.
  @Get(':entity/:id')
  async history(
    @Param('entity') entity: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
  ) {
    return {
      success: true,
      data: await this.auditService.history(entity, id, req.user.companyId),
    };
  }
}

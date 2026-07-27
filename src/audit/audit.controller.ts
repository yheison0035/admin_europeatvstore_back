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

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Historial de cambios de un registro.
  @Get(':entity/:id')
  history(
    @Param('entity') entity: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
  ) {
    return {
      success: true,
      data: this.auditService.history(entity, id, req.user.companyId),
    };
  }
}

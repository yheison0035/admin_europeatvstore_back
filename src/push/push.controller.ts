import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PushService } from './push.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

@Controller('push')
export class PushController {
  constructor(private readonly service: PushService) {}

  // Llave pública VAPID para que el navegador se suscriba (no es secreta).
  @Get('vapid-public')
  vapidPublic() {
    return { success: true, data: { publicKey: this.service.publicKey() } };
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  subscribe(@Req() req, @Body() body: any) {
    return this.service.saveSubscription(
      req.user,
      body?.subscription || body,
      req.headers?.['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  unsubscribe(@Body() body: any) {
    return this.service.removeSubscription(body?.endpoint);
  }
}

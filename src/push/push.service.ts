import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '@/prisma.service';

// Notificaciones Web Push a la PWA (por usuario o por rol). Necesita las llaves
// VAPID en el entorno: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (ej. mailto:soporte@pegazo.co). Sin ellas, el envío se omite en silencio.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private ready = false;

  constructor(private prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:soporte@pegazo.co';
    if (pub && priv) {
      try {
        webpush.setVapidDetails(subject, pub, priv);
        this.ready = true;
      } catch (e: any) {
        this.logger.warn(`VAPID inválido: ${e?.message || e}`);
      }
    } else {
      this.logger.warn('Web Push sin configurar (faltan llaves VAPID).');
    }
  }

  publicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  // Guarda (o refresca) la suscripción del usuario. La clave es el endpoint.
  async saveSubscription(user: any, sub: any, userAgent?: string) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return { success: false };
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: user.id,
        companyId: user.companyId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        userId: user.id,
        companyId: user.companyId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || null,
      },
    });
    return { success: true };
  }

  async removeSubscription(endpoint: string) {
    if (!endpoint) return { success: true };
    await this.prisma.pushSubscription
      .deleteMany({ where: { endpoint } })
      .catch(() => null);
    return { success: true };
  }

  // Envía una notificación a TODAS las suscripciones de estos usuarios. Limpia
  // las que ya no existen (404/410). No lanza: nunca debe romper el flujo.
  async sendToUsers(userIds: number[], payload: PushPayload) {
    if (!this.ready || !userIds?.length) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    if (!subs.length) return;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => null);
          } else {
            this.logger.warn(`Push falló (${code}): ${e?.message || e}`);
          }
        }
      }),
    );
  }

  async sendToUser(userId: number, payload: PushPayload) {
    return this.sendToUsers([userId], payload);
  }

  // Envía a todos los usuarios ACTIVOS de una empresa con ciertos roles
  // (ej. dueño/administrador para consignaciones).
  async sendToCompanyRoles(
    companyId: number,
    roles: string[],
    payload: PushPayload,
  ) {
    if (!this.ready) return;
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        role: { in: roles as any },
        status: { not: 'ELIMINADO' as any },
      },
      select: { id: true },
    });
    await this.sendToUsers(
      users.map((u) => u.id),
      payload,
    );
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // a dónde ir al tocar la notificación
  tag?: string; // agrupa/reemplaza notificaciones del mismo tipo
}

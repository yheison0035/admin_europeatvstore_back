import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';

// Subida del logo de la empresa. Se usa tanto al crear la empresa desde el
// panel (autenticado) como en el auto-registro (público). Es pública pero con
// límite anti-abuso y validación de tipo/tamaño. Todos los logos quedan
// organizados en la carpeta `companies/logos` de Cloudinary.
@Controller('companies')
export class CompanyLogoController {
  constructor(private cloudinary: CloudinaryService) {}

  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('logo-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
      fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.mimetype)) {
          return cb(
            new BadRequestException(
              'El logo debe ser una imagen (PNG, JPG, WEBP, SVG o GIF).',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ninguna imagen.');
    }

    const { url, publicId } = await this.cloudinary.uploadImage(
      file,
      'companies/logos',
    );

    return { success: true, data: { url, publicId } };
  }
}

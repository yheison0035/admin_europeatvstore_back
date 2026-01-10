import { Injectable, Inject } from '@nestjs/common';
import { v2 as Cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject('CLOUDINARY')
    private cloudinary: typeof Cloudinary,
  ) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
    publicId?: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      this.cloudinary.uploader
        .upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: !!publicId,
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result) return reject(new Error('Upload failed'));

            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          },
        )
        .end(file.buffer);
    });
  }

  async deleteImage(publicId: string) {
    return this.cloudinary.uploader.destroy(publicId);
  }
}

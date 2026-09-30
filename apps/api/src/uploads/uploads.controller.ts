import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Allow } from '../common/auth.decorators';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

/**
 * Upload de photos (preuve de l'infraction, CNI). Stockage disque en dev ;
 * en production, remplacer par des URL pré-signées S3/MinIO sans changer le contrat.
 */
@ApiTags('Fichiers')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  @Allow('admin', 'officer', 'user') @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic)$/.test(file.mimetype)),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image JPEG, PNG, WebP ou HEIC requise (8 Mo max)');
    return { url: `${process.env.PUBLIC_URL}/uploads/${file.filename}`, size: file.size };
  }
}

import { Controller, Get, Param, ParseUUIDPipe, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly storage: StorageService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Download a file you own (avatar, vehicle image or receipt)' })
  @ApiOkResponse({ description: 'Binary image content' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.files.getOwned(id, user.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    return new StreamableFile(this.storage.stream(file.storageKey));
  }
}

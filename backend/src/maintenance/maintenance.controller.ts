import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { imageUploadOptions } from '../common/upload';
import {
  CompleteScheduleDto,
  CreateRecordDto,
  CreateScheduleDto,
  RecordQueryDto,
  ScheduleQueryDto,
  UpdateRecordDto,
  UpdateScheduleDto,
} from './dto/maintenance.dto';
import { RecordsService } from './records.service';
import { SchedulesService } from './schedules.service';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller({ path: 'schedules', version: '1' })
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @ApiOperation({ summary: 'Maintenance schedules with computed status (most urgent first)' })
  list(@CurrentUser() user: AuthUser, @Query() q: ScheduleQueryDto) {
    return this.schedules.list(user.id, q);
  }

  @Post()
  @ApiOperation({ summary: 'Create a maintenance schedule' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateScheduleDto) {
    return this.schedules.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Schedule details' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedules.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a schedule (intervals, baseline, estimate, notes, active)' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a schedule (service history is kept)' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.schedules.remove(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark maintenance as completed (creates history record + expense, advances schedule)' })
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteScheduleDto) {
    return this.schedules.complete(user.id, id, dto);
  }
}

@ApiTags('Service history')
@ApiBearerAuth()
@Controller({ path: 'records', version: '1' })
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Service history with filters, search and pagination' })
  list(@CurrentUser() user: AuthUser, @Query() q: RecordQueryDto) {
    return this.records.list(user.id, q);
  }

  @Post()
  @ApiOperation({ summary: 'Add a service record (updates the related schedule when newer)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordDto) {
    return this.records.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Service record details' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.records.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a service record' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecordDto) {
    return this.records.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a service record (and its linked expense and attachments)' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.records.remove(user.id, id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Attach a receipt/photo (image, max 8 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  attach(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.records.addAttachment(user.id, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  detach(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.records.removeAttachment(user.id, id, attachmentId);
  }
}

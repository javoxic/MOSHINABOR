import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { imageUploadOptions } from '../common/upload';
import { CreateVehicleDto, UpdateMileageDto, UpdateVehicleDto } from './dto/vehicles.dto';
import { VehiclesService, type VehicleView } from './vehicles.service';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller({ path: 'vehicles', version: '1' })
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: 'List my vehicles (primary first)' })
  list(@CurrentUser() user: AuthUser): Promise<VehicleView[]> {
    return this.vehicles.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a vehicle' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto): Promise<VehicleView> {
    return this.vehicles.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vehicle details' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<VehicleView> {
    return this.vehicles.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a vehicle' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleView> {
    return this.vehicles.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a vehicle with its schedules, history, expenses and images' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.vehicles.remove(user.id, id);
  }

  @Post(':id/primary')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set as primary vehicle' })
  setPrimary(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehicleView> {
    return this.vehicles.setPrimary(user.id, id);
  }

  @Post(':id/mileage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a new odometer reading' })
  mileage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMileageDto,
  ): Promise<VehicleView> {
    return this.vehicles.updateMileage(user.id, id, dto.mileage);
  }

  @Get(':id/mileage-logs')
  @ApiOperation({ summary: 'Odometer reading history (latest 100)' })
  mileageLogs(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.mileageLogs(user.id, id);
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Upload a vehicle image (max 10 per vehicle)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  addImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<VehicleView> {
    return this.vehicles.addImage(user.id, id, file);
  }

  @Post(':id/images/:imageId/cover')
  @HttpCode(200)
  @ApiOperation({ summary: 'Use an image as the vehicle cover' })
  cover(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<VehicleView> {
    return this.vehicles.setCoverImage(user.id, id, imageId);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Delete a vehicle image' })
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<VehicleView> {
    return this.vehicles.removeImage(user.id, id, imageId);
  }
}

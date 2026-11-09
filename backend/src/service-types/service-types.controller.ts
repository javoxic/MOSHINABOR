import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { CreateCustomServiceTypeDto, UpdateCustomServiceTypeDto } from './dto/service-types.dto';
import { ServiceTypesService, type ServiceTypeView } from './service-types.service';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller({ path: 'service-types', version: '1' })
export class ServiceTypesController {
  constructor(private readonly types: ServiceTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Maintenance categories (built-in + my custom). Intervals are suggestions, not manufacturer specs.' })
  list(@CurrentUser() user: AuthUser): Promise<ServiceTypeView[]> {
    return this.types.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom service category' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomServiceTypeDto): Promise<ServiceTypeView> {
    return this.types.createCustom(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit my custom service category' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomServiceTypeDto): Promise<ServiceTypeView> {
    return this.types.updateCustom(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an unused custom service category' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.types.deleteCustom(user.id, id);
  }
}

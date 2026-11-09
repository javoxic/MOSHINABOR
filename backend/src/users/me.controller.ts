import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { imageUploadOptions } from '../common/upload';
import { UpdateProfileDto, UpdateSettingsDto } from './dto/users.dto';
import { UsersService, type UserProfileView } from './users.service';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile and settings' })
  get(@CurrentUser() user: AuthUser): Promise<UserProfileView> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile (full name)' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserProfileView> {
    return this.users.updateProfile(user.id, dto);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update language and notification preferences' })
  settings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto): Promise<UserProfileView> {
    return this.users.updateSettings(user.id, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload profile photo (JPEG/PNG/WebP/HEIC, max 8 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined): Promise<UserProfileView> {
    return this.users.setAvatar(user.id, file);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove profile photo' })
  removeAvatar(@CurrentUser() user: AuthUser): Promise<UserProfileView> {
    return this.users.removeAvatar(user.id);
  }

  @Post('deletion-request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request account deletion (data is permanently deleted after the grace period)' })
  requestDeletion(@CurrentUser() user: AuthUser): Promise<UserProfileView> {
    return this.users.requestDeletion(user.id);
  }

  @Delete('deletion-request')
  @ApiOperation({ summary: 'Cancel a pending account deletion request' })
  cancelDeletion(@CurrentUser() user: AuthUser): Promise<UserProfileView> {
    return this.users.cancelDeletion(user.id);
  }
}

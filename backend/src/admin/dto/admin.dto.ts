import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ADMIN_PERMISSIONS,
  EXPENSE_CATEGORIES,
  FUEL_TYPES,
  LANGUAGES,
  NOTIFICATION_TYPES,
  USER_STATUSES,
  DELIVERY_STATUSES,
} from '@moshina/shared';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/;
const PASSWORD_MESSAGE =
  'Password must be 12-128 characters with upper- and lowercase letters and a digit';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AdminLoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @Length(1, 128) password: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword: string;
  @ApiProperty() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) newPassword: string;
}

export class CreateAdminDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 120) fullName: string;
  @ApiProperty() @IsUUID() roleId: string;
  @ApiProperty() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() roleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetAdminPasswordDto {
  @ApiProperty() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
}

export class RoleDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  description?: string;
  @ApiProperty({ enum: ADMIN_PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ADMIN_PERMISSIONS, { each: true })
  permissions: (typeof ADMIN_PERMISSIONS)[number][];
}

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or phone digits' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];
  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: (typeof LANGUAGES)[number];
  @ApiPropertyOptional() @IsOptional() @IsDateString() registeredFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() registeredTo?: string;
  @ApiPropertyOptional({ example: 'createdAt:desc' }) @IsOptional() @IsString() sort?: string;
}

export class RestrictUserDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 500) reason: string;
}

export class AdminVehicleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Brand, model, registration number or VIN' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
  @ApiPropertyOptional({ enum: FUEL_TYPES })
  @IsOptional()
  @IsIn(FUEL_TYPES)
  fuelType?: (typeof FUEL_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) yearFrom?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) yearTo?: number;
  @ApiPropertyOptional({ example: 'createdAt:desc' }) @IsOptional() @IsString() sort?: string;
}

export class AdminNotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: (typeof NOTIFICATION_TYPES)[number];
  @ApiPropertyOptional({ enum: DELIVERY_STATUSES })
  @IsOptional()
  @IsIn(DELIVERY_STATUSES)
  status?: (typeof DELIVERY_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() userId?: string;
}

export class LocalizedDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 1000) uz: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 1000) ru: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 1000) en: string;
}

export class UpdateTemplateDto {
  @ApiProperty({ type: LocalizedDto })
  @ValidateNested()
  @Type(() => LocalizedDto)
  title: LocalizedDto;
  @ApiProperty({ type: LocalizedDto })
  @ValidateNested()
  @Type(() => LocalizedDto)
  body: LocalizedDto;
  @ApiProperty() @IsBoolean() isActive: boolean;
}

export class CreateAnnouncementDto {
  @ApiProperty({ type: LocalizedDto })
  @ValidateNested()
  @Type(() => LocalizedDto)
  title: LocalizedDto;
  @ApiProperty({ type: LocalizedDto })
  @ValidateNested()
  @Type(() => LocalizedDto)
  body: LocalizedDto;
  @ApiPropertyOptional({ description: 'ISO date-time; omitted = send now' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  targetLanguage?: (typeof LANGUAGES)[number];
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class UpdateSettingDto {
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] })
  @IsDefined()
  value: string | number | boolean;
}

export { EXPENSE_CATEGORIES };

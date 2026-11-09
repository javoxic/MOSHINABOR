import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { LANGUAGES, type Language } from '@moshina/shared';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Aziz Karimov' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @Length(2, 120)
  fullName?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  maintenanceReminders?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mileageReminders?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  announcements?: boolean;
}

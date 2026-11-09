import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateCustomServiceTypeDto {
  @ApiProperty({ example: 'Wheel alignment' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  suggestedIntervalDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000)
  suggestedIntervalKm?: number | null;
}

export class UpdateCustomServiceTypeDto extends CreateCustomServiceTypeDto {}

export class AdminServiceTypeDto {
  @ApiProperty({ example: 'WHEEL_ALIGNMENT' })
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/)
  code: string;

  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80) nameUz: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80) nameRu: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 80) nameEn: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  suggestedIntervalDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000)
  suggestedIntervalKm?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

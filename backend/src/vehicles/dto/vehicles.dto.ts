import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FUEL_TYPES, type FuelType } from '@moshina/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateVehicleDto {
  @ApiProperty({ example: 'Chevrolet' })
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  brand: string;

  @ApiProperty({ example: 'Cobalt' })
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  model: string;

  @ApiProperty({ example: 2021 })
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(new Date().getFullYear() + 1)
  year: number;

  @ApiProperty({ example: '01 A 123 BC' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @Length(2, 20)
  registrationNumber: string;

  @ApiPropertyOptional({ example: 'XWB4A11BDLA123456', nullable: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim().toUpperCase()) : value,
  )
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/, {
    message: 'vin must be 17 characters (letters I, O, Q are not allowed)',
  })
  vin?: string | null;

  @ApiProperty({ enum: FUEL_TYPES })
  @IsIn(FUEL_TYPES)
  fuelType: FuelType;

  @ApiPropertyOptional({
    example: 1.5,
    nullable: true,
    description: 'Engine displacement in litres',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(10)
  engineSize?: number | null;

  @ApiProperty({ example: 45000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  currentMileage: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value,
  )
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  @ApiPropertyOptional({
    description: 'Allow lowering the odometer value to correct a typing mistake',
  })
  @IsOptional()
  @IsBoolean()
  correctMileage?: boolean;
}

export class UpdateMileageDto {
  @ApiProperty({ example: 46250 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  mileage: number;
}

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SCHEDULE_STATUSES, type ScheduleStatus } from '@moshina/shared';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const optText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class CreateScheduleDto {
  @ApiProperty() @IsUUID() vehicleId: string;
  @ApiProperty() @IsUUID() serviceTypeId: string;

  @ApiProperty({ example: '2026-03-01' })
  @Matches(DATE, { message: 'lastServiceDate must be YYYY-MM-DD' })
  lastServiceDate: string;

  @ApiProperty({ example: 42000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  lastServiceMileage: number;

  @ApiPropertyOptional({ nullable: true, example: 180 })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  intervalDays?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 8000 })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000)
  intervalKm?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 350000, description: "Estimated cost in so'm" })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000_000)
  estimatedCost?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optText)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateScheduleDto extends PartialType(
  OmitType(CreateScheduleDto, ['vehicleId', 'serviceTypeId'] as const),
) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CompleteScheduleDto {
  @ApiProperty({ example: '2026-06-01' })
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: 50200 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  mileage: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000_000)
  cost?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optText)
  @IsString()
  @MaxLength(160)
  serviceProvider?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optText)
  @IsString()
  @MaxLength(1000)
  partsUsed?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optText)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class ScheduleQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vehicleId?: string;
  @ApiPropertyOptional({ enum: SCHEDULE_STATUSES })
  @IsOptional()
  @IsIn(SCHEDULE_STATUSES)
  status?: ScheduleStatus;
  @ApiPropertyOptional({ description: 'Only overdue/due/due-soon' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  attentionOnly?: boolean;
}

export class CreateRecordDto extends CompleteScheduleDto {
  @ApiProperty() @IsUUID() vehicleId: string;
  @ApiProperty() @IsUUID() serviceTypeId: string;
}

export class UpdateRecordDto extends PartialType(
  OmitType(CreateRecordDto, ['vehicleId'] as const),
) {}

export class RecordQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vehicleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() serviceTypeId?: string;
  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @Matches(DATE) to?: string;
  @ApiPropertyOptional({ description: 'Search in parts, provider and notes' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

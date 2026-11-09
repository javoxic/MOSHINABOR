import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@moshina/shared';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateExpenseDto {
  @ApiProperty() @IsUUID() vehicleId: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) @IsIn(EXPENSE_CATEGORIES) category: ExpenseCategory;

  @ApiProperty({ example: 250000, description: "Amount in so'm" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000_000)
  amount: number;

  @ApiProperty({ example: '2026-06-01' }) @Matches(DATE, { message: 'date must be YYYY-MM-DD' }) date: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000_000)
  mileage?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Fuel volume (litres or m³ for methane)' })
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(2000)
  liters?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateExpenseDto extends PartialType(OmitType(CreateExpenseDto, ['vehicleId'] as const)) {}

export class ExpenseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vehicleId?: string;
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES }) @IsOptional() @IsIn(EXPENSE_CATEGORIES) category?: ExpenseCategory;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) to?: string;
}

export class ExpenseStatsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vehicleId?: string;
  @ApiPropertyOptional({ description: 'Defaults to January 1st of the current year (Tashkent)' }) @IsOptional() @Matches(DATE) from?: string;
  @ApiPropertyOptional({ description: 'Defaults to today (Tashkent)' }) @IsOptional() @Matches(DATE) to?: string;
}

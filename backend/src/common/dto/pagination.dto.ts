import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export function paginate(q: { page: number; pageSize: number }): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function parseSort<T extends string>(
  sort: string | undefined,
  allowed: readonly T[],
  fallback: { field: T; dir: 'asc' | 'desc' },
): { field: T; dir: 'asc' | 'desc' } {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  if (!allowed.includes(field as T)) return fallback;
  return { field: field as T, dir: dir === 'asc' ? 'asc' : 'desc' };
}

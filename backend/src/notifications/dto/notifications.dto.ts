import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class RegisterPushDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}

export class UnregisterPushDeviceDto {
  @ApiProperty() @IsString() @MaxLength(255) token: string;
}

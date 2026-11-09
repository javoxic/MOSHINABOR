import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { LANGUAGES, type Language } from '@moshina/shared';

export class OtpRequestDto {
  @ApiProperty({ example: '+998901234567', description: 'Phone in any common format; normalized to E.164' })
  @IsString()
  @Length(5, 25)
  phone: string;

  @ApiPropertyOptional({ enum: LANGUAGES, description: 'Language of the SMS text' })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;
}

export class OtpVerifyDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @Length(5, 25)
  phone: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;

  @ApiPropertyOptional({ enum: LANGUAGES, description: 'Preferred language stored for new accounts' })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Expo push token of this device to unregister' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pushToken?: string;
}

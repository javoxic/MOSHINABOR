import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

@Module({ imports: [UsersModule], controllers: [AuthController], providers: [AuthService, OtpService], exports: [OtpService] })
export class AuthModule {}

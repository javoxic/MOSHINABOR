import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type Language } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { UsersService, type UserProfileView } from '../users/users.service';
import { OtpService, type OtpRequestResult } from './otp.service';
import { TokenService, type ClientContext, type IssuedTokens } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  requestCode(phone: string, ip: string, language?: Language): Promise<OtpRequestResult> {
    return this.otp.request(phone, ip, language ?? 'uz');
  }

  async verifyCode(
    phone: string,
    code: string,
    ctx: ClientContext,
    language?: Language,
  ): Promise<{ tokens: IssuedTokens; user: UserProfileView; isNewUser: boolean }> {
    const e164 = await this.otp.verify(phone, code);
    const { user, isNew } = await this.users.findOrCreateByPhone(e164, language ?? 'uz');
    if (user.status === 'RESTRICTED') {
      throw new AppException(
        ERROR_CODES.ACCOUNT_RESTRICTED,
        HttpStatus.FORBIDDEN,
        'Your account has been restricted. Contact support.',
      );
    }
    const tokens = await this.tokens.issue(user.id, ctx);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return { tokens, user: this.users.toView(user), isNewUser: isNew || !user.fullName };
  }

  refresh(refreshToken: string, ctx: ClientContext): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken, ctx);
  }

  async logout(
    userId: string,
    familyId: string,
    refreshToken?: string,
    pushToken?: string,
  ): Promise<void> {
    if (refreshToken) {
      const fam = await this.tokens.familyOf(refreshToken);
      if (fam && fam.userId === userId) await this.tokens.revokeFamily(fam.familyId, 'logout');
    }
    await this.tokens.revokeFamily(familyId, 'logout');
    if (pushToken) {
      await this.prisma.pushDevice.updateMany({
        where: { token: pushToken, userId },
        data: { disabledAt: new Date() },
      });
    }
  }

  async logoutAll(userId: string): Promise<number> {
    await this.prisma.pushDevice.updateMany({
      where: { userId, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    return this.tokens.revokeAllForUser(userId, 'logout_all');
  }
}

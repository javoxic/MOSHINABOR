import { Controller, Get, Inject } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { SystemSettingsService } from '../settings/system-settings.service';

@ApiTags('App')
@Public()
@Controller({ path: 'app-config', version: '1' })
export class AppConfigController {
  constructor(
    private readonly settings: SystemSettingsService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Public client configuration (support contacts, default language)' })
  async get(): Promise<{
    supportPhone: string | null;
    supportEmail: string | null;
    defaultLanguage: string;
    accountDeletionGraceDays: number;
  }> {
    const [phone, email, lang] = await Promise.all([
      this.settings.get('app.supportPhone'),
      this.settings.get('app.supportEmail'),
      this.settings.get('app.defaultLanguage'),
    ]);
    return {
      supportPhone: phone || null,
      supportEmail: email || null,
      defaultLanguage: lang,
      accountDeletionGraceDays: this.env.ACCOUNT_DELETION_GRACE_DAYS,
    };
  }
}

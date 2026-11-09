import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { SystemSettingsService } from '../settings/system-settings.service';

@ApiTags('App')
@Public()
@Controller({ path: 'app-config', version: '1' })
export class AppConfigController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Public client configuration (support contacts, default language)' })
  async get(): Promise<{ supportPhone: string | null; supportEmail: string | null; defaultLanguage: string }> {
    const [phone, email, lang] = await Promise.all([
      this.settings.get('app.supportPhone'),
      this.settings.get('app.supportEmail'),
      this.settings.get('app.defaultLanguage'),
    ]);
    return { supportPhone: phone || null, supportEmail: email || null, defaultLanguage: lang };
  }
}

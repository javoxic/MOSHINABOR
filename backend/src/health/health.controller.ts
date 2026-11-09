import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/auth.decorators';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { ok: true } {
    return { ok: true };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database + Redis)' })
  async ready() {
    const r = await this.health.readiness();
    if (!r.ok) throw new ServiceUnavailableException(r);
    return r;
  }
}

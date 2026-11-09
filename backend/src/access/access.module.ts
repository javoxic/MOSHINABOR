import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AdminAccessController } from './admin-access.controller';
import { AdminGuard } from '../admin/admin.guard';
import { AuditService } from '../admin/audit.service';

@Global()
@Module({
  controllers: [AdminAccessController],
  providers: [AccessService, AdminGuard, AuditService],
  exports: [AccessService],
})
export class AccessModule {}

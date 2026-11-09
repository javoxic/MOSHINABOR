import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PUSH_QUEUE, type PushJobData } from './notifications.constants';
import { PushService } from './push.service';

@Processor(PUSH_QUEUE, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly push: PushService) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    try {
      await this.push.sendForNotification(job.data.notificationId);
    } catch (err) {
      this.logger.warn(
        `Push job ${job.id} attempt ${job.attemptsMade + 1} failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}

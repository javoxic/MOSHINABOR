import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, rename, unlink, writeFile, constants } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Local filesystem storage (mount a persistent volume in production — see docs/DEPLOYMENT.md).
 * Keys are generated server-side; user input never becomes part of a path.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root: string;

  constructor(@Inject(APP_ENV) env: Env) {
    this.root = resolve(env.STORAGE_DIR);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private pathFor(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  newKey(prefix: string, ext: string): string {
    const now = new Date();
    return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    const tmp = `${full}.${randomUUID()}.tmp`;
    await writeFile(tmp, data, { mode: 0o640 });
    await rename(tmp, full);
  }

  stream(key: string): ReadStream {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  async isWritable(): Promise<boolean> {
    try {
      await access(this.root, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

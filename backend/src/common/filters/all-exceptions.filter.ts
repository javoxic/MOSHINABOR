import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_CODES } from '@moshina/shared';
import { AppException } from '../errors/app-exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const STATUS_CODE_MAP: Partial<Record<number, string>> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  413: ERROR_CODES.FILE_INVALID,
  429: ERROR_CODES.RATE_LIMITED,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const body = this.toBody(exception);
    body.requestId = typeof req.id === 'string' ? req.id : undefined;

    // Handled AppExceptions are logged where they originate; log only unexpected failures here.
    if (body.statusCode >= 500 && !(exception instanceof AppException)) {
      this.logger.error(
        {
          err:
            exception instanceof Error
              ? { name: exception.name, message: exception.message, stack: exception.stack }
              : exception,
          path: req.url,
        },
        'Unhandled error',
      );
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: 429,
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests, please try again later',
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message = exception.message;
      let details: unknown;
      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: unknown; details?: unknown };
        if (Array.isArray(r.message)) {
          message = 'Validation failed';
          details = r.message;
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
        if (r.details) details = r.details;
      }
      return {
        statusCode: status,
        code: STATUS_CODE_MAP[status] ?? `HTTP_${status}`,
        message,
        details,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: 'A record with these values already exists',
        };
      }
      if (exception.code === 'P2025') {
        return { statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Resource not found' };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: 'Related record constraint failed',
        };
      }
    }
    if (
      exception instanceof Error &&
      'code' in exception &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: ERROR_CODES.FILE_INVALID,
        message: 'File is too large',
      };
    }
    return { statusCode: 500, code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' };
  }
}

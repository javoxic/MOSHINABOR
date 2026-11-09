import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@moshina/shared';

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity = 'Resource'): AppException {
    return new AppException(ERROR_CODES.NOT_FOUND, HttpStatus.NOT_FOUND, `${entity} not found`);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppException {
    return new AppException(ERROR_CODES.FORBIDDEN, HttpStatus.FORBIDDEN, message);
  }

  static unauthorized(message = 'Authentication required'): AppException {
    return new AppException(ERROR_CODES.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, message);
  }

  static validation(message: string, details?: unknown): AppException {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      message,
      details,
    );
  }

  static conflict(message: string): AppException {
    return new AppException(ERROR_CODES.CONFLICT, HttpStatus.CONFLICT, message);
  }
}

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'غير مصرح لك بالوصول'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'ليست لديك صلاحية تنفيذ هذا الإجراء'): AppError {
    return new AppError(403, code, message);
  }

  static notFound(code = 'NOT_FOUND', message = 'غير موجود'): AppError {
    return new AppError(404, code, message);
  }

  static conflict(code = 'CONFLICT', message = 'تعارض في البيانات'): AppError {
    return new AppError(409, code, message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * core 层 —— 错误类型。
 *
 * 与后端错误码分段保持一致（见 packages/conventions/api/error-codes.json）。
 */

/** 错误码 —— 与后端 AppError.code 对齐。 */
export const ErrorCode = {
	OK: 0,
	INVALID_ARGUMENT: 40001,
	UNAUTHENTICATED: 40101,
	FORBIDDEN: 40301,
	NOT_FOUND: 40401,
	CONFLICT: 40901,
	VALIDATION_FAILED: 42201,
	RATE_LIMITED: 42901,
	INTERNAL: 50001,
	UPSTREAM_FAILED: 50201,
	UNAVAILABLE: 50301,
	INSUFFICIENT_BALANCE: 60001,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 业务异常基类。 */
export class AppError extends Error {
	readonly code: ErrorCodeValue;
	readonly statusCode: number;
	readonly details: Record<string, unknown>;

	constructor(
		message: string,
		options: {
			code: ErrorCodeValue;
			statusCode?: number;
			details?: Record<string, unknown> | undefined;
		},
	) {
		super(message);
		this.name = "AppError";
		this.code = options.code;
		this.statusCode = options.statusCode ?? 500;
		this.details = options.details ?? {};
	}
}

/** 资源不存在。 */
export class NotFoundError extends AppError {
	constructor(
		message = "Resource not found",
		details?: Record<string, unknown> | undefined,
	) {
		super(message, { code: ErrorCode.NOT_FOUND, statusCode: 404, details });
		this.name = "NotFoundError";
	}
}

/** 参数校验失败。 */
export class ValidationError extends AppError {
	constructor(
		message = "Validation failed",
		details?: Record<string, unknown> | undefined,
	) {
		super(message, {
			code: ErrorCode.VALIDATION_FAILED,
			statusCode: 422,
			details,
		});
		this.name = "ValidationError";
	}
}

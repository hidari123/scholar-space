/**
 * core 层公开入口。
 *
 * ⚠️ core 层禁止 import components / hooks / React（见 G3-1 护栏）。
 */

export { createExample, formatExampleName } from './create-example';
export type { ErrorCodeValue } from './errors';
export { AppError, ErrorCode, NotFoundError, ValidationError } from './errors';
export type { CreateExampleInput, Example } from './types';

/**
 * @scholarspace/example-package — 唯一公开入口。
 *
 * ⚠️ 消费者只能从这里 import。不要摸 `src/core/xxx` 之类的内部路径
 *    （G4-1 护栏）。
 */

export type { ExampleProps } from "./components";
export { ExampleCard } from "./components";
export type { CreateExampleInput, ErrorCodeValue, Example } from "./core";
export {
	AppError,
	createExample,
	ErrorCode,
	formatExampleName,
	NotFoundError,
	ValidationError,
} from "./core";
export type { UseExampleResult } from "./hooks";
export { useExample } from "./hooks";

import { describe, expect, it } from "vitest";

import { createExample, formatExampleName } from "./create-example";
import { ValidationError } from "./errors";

describe("createExample", () => {
	it("创建成功的示例", () => {
		const example = createExample({ name: "测试示例" });

		expect(example.name).toBe("测试示例");
		expect(example.exampleId).toMatch(/^example-/);
		expect(example.createdAt).toBeInstanceOf(Date);
	});

	it("去除首尾空白", () => {
		expect(createExample({ name: "  padded  " }).name).toBe("padded");
	});

	it("拒绝空名称", () => {
		expect(() => createExample({ name: "   " })).toThrow(ValidationError);
	});
});

describe("formatExampleName", () => {
	it("拼接名称与 ID", () => {
		const example = createExample({ name: "abc" });
		expect(formatExampleName(example)).toBe(`abc (${example.exampleId})`);
	});
});

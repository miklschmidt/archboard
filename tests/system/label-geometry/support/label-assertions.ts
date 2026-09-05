import { expect } from "bun:test";
import type { boundTextsByContainer } from "../../../../src/runtime/engine/labels.ts";

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | null | undefined, message: string): T => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};
const firstLabel = (labels: ReturnType<typeof boundTextsByContainer>, container: string): string =>
	required(labels.get(container)?.[0], `Missing label for ${container}.`);

export { assert, required, firstLabel };

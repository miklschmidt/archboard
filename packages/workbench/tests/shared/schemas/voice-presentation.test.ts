import { expect, test } from "bun:test";

import { ArchboardVoicePresentationSchema } from "#shared/schemas/voice-presentation.ts";

/**
 * The refusals of a walkthrough id, as messages.
 * @param walkthrough The id.
 * @returns Each message, empty when the id passes.
 */
function refusals(walkthrough: string): string[] {
	const parsed = ArchboardVoicePresentationSchema.safeParse({ walkthrough });
	return parsed.success ? [] : parsed.error.issues.map(({ message }) => message);
}

test("a walkthrough id is 1 to 64 characters and at most 64 UTF-8 bytes, without NUL", () => {
	expect(refusals("a".repeat(64))).toEqual([]);
	expect(refusals("")).toHaveLength(1);
	expect(refusals("a".repeat(65))).toContain("text exceeds 64 UTF-8 bytes");
	expect(refusals("é".repeat(33))).toEqual(["text exceeds 64 UTF-8 bytes"]);
	expect(refusals("a\0b")).toEqual(["NUL is not allowed"]);
});

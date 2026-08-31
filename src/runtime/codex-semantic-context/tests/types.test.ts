import { expect, test } from "bun:test";

import type { SemanticContextInput, SemanticCursorInput } from "../index.ts";

const qualifiedCursor = { feedId: "feed", sequence: 3 } satisfies SemanticCursorInput;

// @ts-expect-error Public context cursors must carry their feed identity.
const numericCursor: SemanticCursorInput = 3;

const qualifiedContextCursor: SemanticContextInput["cursor"] = qualifiedCursor;

test("requires fully qualified public cursors", () => {
	expect(qualifiedContextCursor).toEqual({ feedId: "feed", sequence: 3 });
	expect(numericCursor).toBeDefined();
});

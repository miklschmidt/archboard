// A finding against a vault read from the cache (ADR 0057) is information, and
// with `--fix` it says why the embed was left only where `--fix` would have
// rewritten it from a fetched vault: a recipe that cannot follow a deleted
// board's name to the board that holds it now is left either way.

import { expect, test } from "bun:test";
import type { EmbedFinding } from "#cli/protocol/check/embeds-answer.ts";
import { cachedFinding } from "#cli/operations/vault/embeds/embed-findings.ts";

const gone: EmbedFinding = {
	severity: "warning",
	code: "EMBED_SOURCE_MISSING",
	file: "docs/orders.svg",
	board: { id: "b1", name: "orders" },
	missing: "board",
	nameHeldBy: { id: "b2", name: "orders" },
	message: "The board is gone.",
};

test("a gone board whose name another board holds says the cache left it only when --fix could point its recipe there", () => {
	expect(cachedFinding(gone, true, true)).toMatchObject({
		severity: "information",
		notFixed: expect.any(String),
	});
	const kept = cachedFinding(gone, true, false);
	expect(kept.severity).toBe("information");
	expect(kept).not.toHaveProperty("notFixed");
});

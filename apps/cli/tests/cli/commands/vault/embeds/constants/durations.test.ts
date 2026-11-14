import { expect, test } from "bun:test";

import { GIT_MS } from "@archboard/process/git";
import { EMBEDS_CHECK_MS } from "#cli/commands/vault/embeds/constants/durations.ts";

test("an incoming directory is stale only after the longest fetch could still run", () => {
	const longestFetch = 2 * EMBEDS_CHECK_MS.vaultFetch + 3 * GIT_MS.command;
	expect(EMBEDS_CHECK_MS.fetchIncomingStale).toBeGreaterThan(longestFetch);
});

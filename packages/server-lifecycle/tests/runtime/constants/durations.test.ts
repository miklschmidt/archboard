import { expect, test } from "bun:test";

import { GIT_MS } from "@archboard/process/git";
import { SERVER_LIFECYCLE_MS } from "#runtime/constants/durations.ts";

test("a stop refuses inside its observation window, before a slow Git probe times out", () => {
	expect(SERVER_LIFECYCLE_MS.mutationDrain).toBeLessThan(SERVER_LIFECYCLE_MS.stopConfirm);
	expect(SERVER_LIFECYCLE_MS.mutationDrain).toBeLessThan(GIT_MS.command);
});

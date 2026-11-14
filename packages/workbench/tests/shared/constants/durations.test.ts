import { describe, expect, test } from "bun:test";

import { TAB_SESSION_GRACE_MS } from "@archboard/codex-realtime-voice/realtime";
import { PANE_MS } from "#shared/constants/durations.ts";

describe("pane durations", () => {
	test("the server's settle cap outlasts the pane's report debounce", () => {
		expect(PANE_MS.settleCap).toBeGreaterThan(PANE_MS.report);
	});

	test("a pane redials inside the grace of its tab's conversation", () => {
		expect(PANE_MS.contactLost).toBeLessThan(TAB_SESSION_GRACE_MS);
	});
});

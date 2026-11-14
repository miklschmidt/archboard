import { expect, test } from "bun:test";

import { CODEX_PROCESS_MS } from "@archboard/codex-app-server/process";
import { CODEX_REALTIME_MS } from "#shared/constants/durations.ts";

test("realtime stop fits inside the app-server's shutdown bounds", () => {
	const realtime = CODEX_REALTIME_MS;
	const process = CODEX_PROCESS_MS;
	expect(realtime.stop).toBeLessThan(process.termGrace);
	expect(
		realtime.stop + process.stdinEofGrace + process.termGrace + process.groupFreeze,
	).toBeLessThan(process.composedShutdown);
});

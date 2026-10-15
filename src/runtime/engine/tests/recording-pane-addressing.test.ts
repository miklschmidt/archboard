import { expect, test } from "bun:test";
import {
	buildPanesReport,
	resolvePaneSpec,
	soloPane,
	type PaneRegistration,
} from "@/runtime/engine/panes";
import { parseBoardKey } from "@/runtime/engine/board";

// Which pane a caller means, beside a recording page's pane (TASK-304).
//
// A recording page is a headless browser nobody sees, and it presents a pane id like anybody's.
// What is guarded: no spec but its exact client id, no call that names no pane and no report finds
// or counts it, and somebody's pane of the same id is found as if the recording were not there.
// Its client id still names it, because that is how the recording page asks for the board it
// records.

/**
 * One registered pane.
 * @param clientId Its client id.
 * @param extra What else it says of itself.
 * @returns The registration.
 */
function pane(clientId: string, extra: Partial<PaneRegistration> = {}): PaneRegistration {
	return {
		clientId,
		paneId: "A",
		vault: "/vault",
		board: "tour",
		primary: false,
		focused: false,
		rect: { x: 0, y: 0, width: 1920, height: 1080 },
		at: "2026-09-23T00:00:00.000Z",
		...extra,
	};
}

test("a recording page's pane is nobody's to address but by its client id, count or report, beside somebody's of the same id", () => {
	// Claiming every role a pane can have, so nothing but the recording mark keeps it out.
	const recording = pane("record", { recording: true, primary: true, focused: true });
	const user = pane("user");

	expect(soloPane([recording])).toBeNull();
	expect(soloPane([recording, user])).toBe(user);
	for (const spec of ["A", "1", "primary", "focused"]) {
		expect(() => resolvePaneSpec([recording], spec)).toThrow();
	}
	expect(resolvePaneSpec([recording, user], "A")).toBe(user);
	expect(resolvePaneSpec([recording, user], "1")).toBe(user);
	expect(resolvePaneSpec([recording, user], "record")).toBe(recording);

	const report = buildPanesReport([recording, user], {
		identity: (key) => parseBoardKey(key),
		reading: () => null,
		whereabouts: () => ({ repository: null, checkout: null }),
		caller: null,
	});
	expect(report.paneCount).toBe(1);
	expect(report.panes.map((one) => one.clientId)).toEqual(["user"]);
});

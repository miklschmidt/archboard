import { describe, expect, test } from "bun:test";

import { CODEX_REALTIME_MS } from "@archboard/codex-realtime-voice/realtime";
import { RECORDING_MS } from "@archboard/walkthrough/recording";
import { REPLAY_MS } from "@archboard/walkthrough/talk";
import { VOICE_MS } from "@archboard/workbench/voice";
import { PICTURE_MS, PRESENTATION_MS } from "#ui/architecture-drawing/constants/motion.ts";

describe("durations that meet in the web app", () => {
	test("a walkthrough's box is in before the voice's orb lands in it", () => {
		expect(PRESENTATION_MS.boxIn).toBeLessThan(VOICE_MS.flight);
	});

	test("a replay puts the model up early enough that its entrance is over", () => {
		expect(REPLAY_MS.preroll).toBeGreaterThanOrEqual(PICTURE_MS.entry);
	});

	test("a recording waits for voice longer than the realtime start may take", () => {
		expect(RECORDING_MS.voiceStart).toBeGreaterThan(CODEX_REALTIME_MS.start);
	});
});

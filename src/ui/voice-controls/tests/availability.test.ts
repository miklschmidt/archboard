import { describe, expect, test } from "bun:test";

import type { VoiceControlsView } from "@/ui/voice-controls/contracts";
import { voiceControlsAvailability } from "@/ui/voice-controls/availability";

/**
 * A view with sensible defaults.
 * @param overrides Fields that differ from an available, ready, unmuted session.
 * @returns The view.
 */
const view = (overrides: Partial<VoiceControlsView> = {}): VoiceControlsView => ({
	available: true,
	sessionState: "ready",
	muted: false,
	pending: false,
	failure: null,
	...overrides,
});

/**
 * The names of the controls that are shown.
 * @param input The view.
 * @returns Shown control names in display order.
 */
const shown = (input: VoiceControlsView): string[] => {
	const availability = voiceControlsAvailability(input);
	return (["start", "mute", "unmute", "stop", "restart"] as const).filter(
		(name) => availability[name].shown,
	);
};

describe("voice control availability", () => {
	test("an unavailable pane offers nothing and says so", () => {
		const availability = voiceControlsAvailability(
			view({ available: false, sessionState: "active" }),
		);
		expect(shown(view({ available: false, sessionState: "active" }))).toEqual([]);
		expect(availability.stateText).toBe("Voice unavailable");
		expect(availability.live).toBe(false);
	});

	test("ready offers start only", () => {
		expect(shown(view())).toEqual(["start"]);
	});

	test("a live session offers mute, stop and restart; muted swaps mute for unmute", () => {
		expect(shown(view({ sessionState: "active" }))).toEqual(["mute", "stop", "restart"]);
		expect(shown(view({ sessionState: "active", muted: true }))).toEqual([
			"unmute",
			"stop",
			"restart",
		]);
		expect(shown(view({ sessionState: "recovering" }))).toEqual(["mute", "stop", "restart"]);
	});

	test("starting can be stopped, stopping cannot be touched, failed can restart", () => {
		expect(shown(view({ sessionState: "starting" }))).toEqual(["stop"]);
		expect(shown(view({ sessionState: "stopping" }))).toEqual([]);
		expect(shown(view({ sessionState: "failed", failure: "peer closed" }))).toEqual(["restart"]);
	});

	test("a pending command keeps the controls visible but disabled", () => {
		const availability = voiceControlsAvailability(view({ sessionState: "active", pending: true }));
		expect(availability.mute).toEqual({ shown: true, enabled: false });
		expect(availability.stop).toEqual({ shown: true, enabled: false });
	});

	test("the failure reason joins the state text", () => {
		const availability = voiceControlsAvailability(
			view({ sessionState: "failed", failure: "peer closed" }),
		);
		expect(availability.stateText).toBe("Voice failed: peer closed");
	});
});

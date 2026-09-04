import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
	projectVoiceControls,
	VOICE_CONTROL_COMMANDS,
	VOICE_CONTROL_STATES,
	VoiceControls,
	type VoiceControlState,
} from "../index.js";
import { assertFixtureStates, BINDING, listeningView, voiceView } from "./support/fixtures.js";
import { sessionFake } from "./support/session-fake.js";

function markup(state: VoiceControlState): string {
	return renderToStaticMarkup(
		createElement(VoiceControls, { session: sessionFake(voiceView(state)) }),
	);
}

/** Visible text with tags removed and the entities React escaped put back. */
function text(html: string): string {
	return html
		.replaceAll(/<[^>]*>/gu, " ")
		.replaceAll("&#x27;", "'")
		.replaceAll("&quot;", '"')
		.replaceAll("&amp;", "&")
		.replaceAll(/\s+/gu, " ");
}

describe("voice control states", () => {
	test("every fixture really is the state it claims", () => {
		// The fixtures come from the real projectVoiceSession, so this is the guard
		// that they still reach the state they are named for.
		expect(assertFixtureStates(VOICE_CONTROL_STATES)).toEqual([]);
		expect(VOICE_CONTROL_STATES).toHaveLength(13);
	});

	test("renders all thirteen states with a named status and the exact bound identity", () => {
		for (const state of VOICE_CONTROL_STATES) {
			const html = markup(state);
			const readable = text(html);
			const view = projectVoiceControls({ view: voiceView(state), pending: null });
			expect(html, state).toContain(`data-voice-state="${state}"`);
			// The status is a name, not a colour: the label and the sentence are both
			// in the text of every state.
			expect(readable, state).toContain(view.label);
			expect(readable, state).toContain(view.detail);
			expect(view.label.length, state).toBeGreaterThan(0);
			expect(view.detail.length, state).toBeGreaterThan(0);
			// The bound identity is the pane, the thread link, and the coordinator.
			expect(readable, state).toContain(BINDING.paneId);
			expect(readable, state).toContain(BINDING.childId);
			expect(readable, state).toContain(BINDING.epoch);
			expect(readable, state).toContain(BINDING.workhorseThreadId);
			expect(readable, state).toContain(BINDING.coordinatorThreadId ?? "");
			// The transport row is persistent: it is in all thirteen.
			expect(html, state).toMatch(/data-voice-transport="(?:active|idle)"/u);
			expect(readable, state).toContain("webrtc-audio");
		}
	});

	test("gives every state a glyph as well as its name, so colour is never the state", () => {
		const glyphs = new Set<string>();
		for (const state of VOICE_CONTROL_STATES) {
			const html = markup(state);
			const glyph = /data-voice-glyph="([a-z-]+)"/u.exec(html)?.[1];
			expect(glyph, state).toBeTruthy();
			glyphs.add(glyph!);
			// A mark that carries meaning must not be the only carrier either: the
			// label sits beside it in the same header.
			expect(html, state).toContain('data-voice-label=""');
		}
		// The live, muted, speaking, stopped, failed, ready, and unavailable groups
		// are visibly different marks rather than one mark in seven colours.
		expect(glyphs.size).toBeGreaterThanOrEqual(6);
	});

	test("keeps the three command slots in the same place in all thirteen states", () => {
		for (const state of VOICE_CONTROL_STATES) {
			const view = projectVoiceControls({ view: voiceView(state), pending: null });
			const commands = view.actions.map((action) => action.command);
			expect(commands.slice(0, 3), state).toEqual([
				"start",
				state === "muted" ? "unmute" : "mute",
				"stop",
			]);
			for (const action of view.actions) {
				expect(VOICE_CONTROL_COMMANDS, `${state}/${action.command}`).toContain(action.command);
				// A control that refuses without saying why is a broken control, and a
				// control that is available has nothing to explain.
				expect(action.reason === null, `${state}/${action.command}`).toBe(action.enabled);
				if (action.reason !== null) expect(action.reason.length, state).toBeGreaterThan(10);
				expect(action.accessibleLabel, state).toContain(BINDING.paneId);
			}
		}
	});

	test("offers a retry only where the adapter offered one, and never a disabled one", () => {
		const retryable = projectVoiceControls({ view: voiceView("retryable_failure"), pending: null });
		expect(retryable.state).toBe("retryable_failure");
		expect(retryable.recovery).toBeTruthy();
		const retry = retryable.actions.find((action) => action.command === "restart");
		expect(retry?.enabled).toBe(true);
		expect(retryable.failureMessage).toBe("The realtime audio connection was lost.");

		const terminal = projectVoiceControls({ view: voiceView("terminal_failure"), pending: null });
		expect(terminal.state).toBe("terminal_failure");
		expect(terminal.actions.map((action) => action.command)).toContain("close");
		expect(terminal.actions.find((action) => action.command === "close")?.enabled).toBe(true);
		expect(terminal.actions.find((action) => action.command === "restart")).toBeUndefined();
	});

	test("permits a meter in the five live states and in none of the others", () => {
		const permitted = VOICE_CONTROL_STATES.filter(
			(state) => projectVoiceControls({ view: voiceView(state), pending: null }).meter,
		);
		expect(permitted).toEqual(["listening", "muted", "processing", "agent_speaking", "recovering"]);
	});

	test("quantizes the level into segments and never announces it", () => {
		const html = renderToStaticMarkup(
			createElement(VoiceControls, { session: sessionFake(listeningView(0.5), 0.5) }),
		);
		expect(html).toContain('data-voice-meter=""');
		// Eight segments, so the level moves in steps rather than continuously.
		expect(html).toContain('data-voice-meter-lit="4"');
		expect([...html.matchAll(/data-voice-meter-segment=""/gu)]).toHaveLength(8);
		// The meter is supplemental: it is hidden from assistive technology, and the
		// announced sentence is the named status.
		expect(html).toContain('aria-hidden="true"');
		expect(text(html)).toContain("Listening");
	});

	test("names the pending command on every control while one is in flight", () => {
		const pendingView = projectVoiceControls({ view: voiceView("listening"), pending: "mute" });
		expect(pendingView.actions.every((action) => !action.enabled)).toBe(true);
		for (const action of pendingView.actions)
			expect(action.reason, action.command).toBe(
				"The microphone is being muted. Wait for it to finish before pressing again.",
			);
	});
});

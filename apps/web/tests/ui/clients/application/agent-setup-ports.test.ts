import { expect, test } from "bun:test";

import type { AgentSetup, AgentSetupSnapshot } from "@archboard/workbench/agent";
import {
	narrate,
	releaseWhenVoiceEnds,
	threadLinkStep,
	voicePort,
} from "#ui/clients/application/agent-setup-ports.ts";
import type { VoiceSessionStatus, VoiceSessionView } from "@archboard/workbench/voice";
import type { ConversationControllers } from "@archboard/codex-realtime-voice/controllers";

type ThreadLinkController = ConversationControllers["threadLink"];

type TalkOptions = NonNullable<Parameters<AgentSetup["talk"]>[0]>;
type ThreadLinkActionSnapshot = ReturnType<ThreadLinkController["snapshot"]>;

/**
 * A voice session view in one status.
 * @param status The status.
 * @param detail What the view says is true.
 * @returns The view.
 */
function voiceView(status: VoiceSessionStatus, detail = "Voice is listening."): VoiceSessionView {
	return {
		status,
		label: status,
		detail,
		accessibleStatus: detail,
		failure: null,
		outcome: { kind: "none" },
		controls: {
			canStart: false,
			canMute: false,
			canUnmute: false,
			canStop: false,
			canRestart: false,
			canClose: false,
		},
		binding: null,
		sessionId: null,
		busy: false,
	};
}

/**
 * The voice port over one pane whose start settles on one view.
 * @param view The view the start settles on.
 * @returns The port and the pins it asked for.
 */
function voiceStartingAt(view: VoiceSessionView): {
	start: ReturnType<typeof voicePort>;
	pins: (string | null)[];
} {
	const pins: (string | null)[] = [];
	const session = {
		/**
		 * Settle the start.
		 * @returns The view.
		 */
		start: () => Promise.resolve(view),
	};
	const start = voicePort(
		{
			/**
			 * The voice on pane b.
			 * @returns The voice owner.
			 */
			voice: () => ({ paneId: "pane-b", session }),
		},
		(paneId) => {
			pins.push(paneId);
		},
	);
	return { start, pins };
}

test("a voice start that is blocked with no failure is refused with the view's reason and keeps voice following focus", async () => {
	const blocked = voiceView(
		"unavailable",
		"The Archboard server has no usable coordinator for voice.",
	);
	const { start, pins } = voiceStartingAt(blocked);
	let refusal: unknown = null;
	await start(null).catch((error: unknown) => {
		refusal = error;
	});
	expect(refusal).toBeInstanceOf(Error);
	expect(refusal instanceof Error ? refusal.message : null).toBe(blocked.detail);
	expect(pins).toEqual([null]);
});

test("a voice start on its way to live keeps voice on the pane it started in", async () => {
	const { start, pins } = voiceStartingAt(voiceView("negotiating"));
	await start({ walkthrough: "tour" });
	expect(pins).toEqual(["pane-b"]);
});

/**
 * A thread-link controller showing one action snapshot.
 * @param snapshot The snapshot.
 * @returns The controller.
 */
function showing(snapshot: ThreadLinkActionSnapshot): { snapshot: () => ThreadLinkActionSnapshot } {
	return {
		/**
		 * The snapshot.
		 * @returns It.
		 */
		snapshot: () => snapshot,
	};
}

/** Closing the stand-in tab does nothing. */
function closeNothing(): void {
	// The stand-in tab has nothing to close.
}

test("voice's pane is let go once its session ends, however it ended", () => {
	let status: VoiceSessionStatus = "listening";
	const listeners = new Set<() => void>();
	const session = {
		/**
		 * The view now.
		 * @returns The view.
		 */
		view: () => voiceView(status),
		/**
		 * Listen for changes.
		 * @param listener Called after each.
		 * @returns Stops listening.
		 */
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	let released = 0;
	releaseWhenVoiceEnds(session, () => {
		released += 1;
	});
	expect(released).toBe(0);
	status = "failed";
	for (const listener of listeners) listener();
	expect(released).toBe(1);
});

test("a thread-link step reports its own settlement, never another action's", () => {
	const succeeded: ThreadLinkActionSnapshot = {
		state: "succeeded",
		revision: 2,
		action: "create",
		target: {
			chatId: "pane-a",
			childId: null,
			epoch: null,
			commandId: null,
			capturedLinkState: null,
			capturedLinkThreadId: null,
		},
		announcement: "Created.",
	};
	const failed: ThreadLinkActionSnapshot = {
		...succeeded,
		state: "failed",
		announcement: "Codex refused the thread.",
	};
	expect(threadLinkStep(showing(succeeded), { state: "ignored", revision: 1 }).ok).toBe(false);
	expect(threadLinkStep(showing(succeeded), { state: "applied", revision: 1 }).ok).toBe(false);
	expect(threadLinkStep(showing(succeeded), { state: "applied", revision: 2 })).toEqual({
		ok: true,
	});
	expect(threadLinkStep(showing(failed), { state: "applied", revision: 2 })).toEqual({
		ok: false,
		reason: failed.announcement,
	});
});

test("narrating while signed out hands Talk a tab opened from the gesture, for the provider's page", () => {
	const opened = { opener: {}, location: { href: "about:blank" }, close: closeNothing };
	let opens = 0;
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			/**
			 * Open the tab.
			 * @returns The tab.
			 */
			open: () => {
				opens += 1;
				return opened;
			},
		},
	});
	try {
		const talks: TalkOptions[] = [];
		const signedOut: AgentSetupSnapshot = {
			phase: { kind: "signed_out", failure: null },
			held: [],
			talk: "idle",
			step: null,
			failure: null,
			talkFailure: null,
		};
		const setup: Pick<AgentSetup, "snapshot" | "talk"> = {
			/**
			 * Signed out.
			 * @returns The snapshot.
			 */
			snapshot: () => signedOut,
			/**
			 * Record the Talk.
			 * @param options How voice is started.
			 */
			talk: (options = {}) => {
				talks.push(options);
			},
		};
		narrate(setup, "tour");
		expect(opens).toBe(1);
		expect(talks.map((options) => options.walkthrough)).toEqual(["tour"]);
		talks[0]?.tab?.navigate("https://auth.example.test/login");
		expect(opened.location.href).toBe("https://auth.example.test/login");
	} finally {
		Reflect.deleteProperty(globalThis, "window");
	}
});

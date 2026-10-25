// One adapter over one pane's fake media owner and fake transport.

import type { RealtimeMediaSnapshot } from "@archboard/codex-realtime-voice/controllers";
import { createVoiceSession } from "#ui/state/voice-session/session.ts";
import type { VoiceSession } from "#ui/state/voice-session/contract.ts";
import {
	mediaSnapshot,
	realtimeFake,
	transportFake,
	type RealtimeFake,
	type TransportFake,
} from "#tests/ui/support/voice-session/fakes.ts";

/** The adapter and its fakes. */
interface Harness {
	readonly session: VoiceSession;
	readonly realtime: RealtimeFake;
	readonly transport: TransportFake;
	readonly notifications: () => number;
	readonly levelNotifications: () => number;
}

/**
 * Builds a harness.
 * @param paneId The pane the adapter is built for.
 * @returns The harness.
 */
function harness(paneId = "pane-a"): Harness {
	const realtime = realtimeFake();
	const transport = transportFake();
	const session = createVoiceSession({ realtime, transport, paneId });
	let notifications = 0;
	let levelNotifications = 0;
	session.subscribe(() => {
		notifications += 1;
	});
	session.subscribeLevel(() => {
		levelNotifications += 1;
	});
	return {
		session,
		realtime,
		transport,
		/**
		 * How many status publications happened.
		 * @returns The count.
		 */
		notifications: () => notifications,
		/**
		 * How many level publications happened.
		 * @returns The count.
		 */
		levelNotifications: () => levelNotifications,
	};
}

/**
 * A listening media snapshot.
 * @returns The snapshot.
 */
function listening(): RealtimeMediaSnapshot {
	return mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" });
}

export { harness, listening, type Harness };

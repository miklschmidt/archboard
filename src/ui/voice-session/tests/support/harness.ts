import type { BrowserSnapshot } from "../../../../shared/codex-browser-model/index.js";
import type { RealtimeMediaSnapshot } from "../../../codex-realtime/index.js";
import { createVoiceSession, type VoiceSession } from "../../index.js";
import {
	mediaSnapshot,
	realtimeFake,
	snapshot,
	transportFake,
	type RealtimeFake,
	type TransportFake,
} from "./fakes.js";

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;

export interface Harness {
	readonly session: VoiceSession;
	readonly realtime: RealtimeFake;
	readonly transport: TransportFake;
	readonly notifications: () => number;
	readonly levelNotifications: () => number;
}

/** One adapter over one pane's fake media owner and fake transport. */
export function harness(paneId = "pane-a"): Harness {
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
		notifications: () => notifications,
		levelNotifications: () => levelNotifications,
	};
}

export function listening(): RealtimeMediaSnapshot {
	return mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" });
}

/** The same pane, pointed at a different child, epoch, or workhorse. */
export function relinked(childId: string, epoch: string, threadId: string): BrowserSnapshot {
	return snapshot({
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: childId as ExecutableLink["childId"],
			epoch: epoch as ExecutableLink["epoch"],
			threadId: threadId as ExecutableLink["threadId"],
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
	});
}

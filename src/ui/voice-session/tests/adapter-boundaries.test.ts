import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { BrowserWorkbenchMediaOwner } from "../../codex-workbench-media/index.js";
import type { BrowserWorkbenchTransport } from "../../workbench-transport/index.js";
import {
	createVoiceSession,
	projectVoiceSession,
	type VoiceRealtimePort,
	type VoiceTransportPort,
} from "../index.js";
import {
	capabilities,
	connectedState,
	mediaSnapshot,
	realtimeFake,
	snapshot,
	transportFake,
	voice,
} from "./support/fakes.js";

const moduleRoot = path.resolve(import.meta.dirname, "..");

function productSources(): readonly string[] {
	return fs
		.readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				[".ts", ".tsx"].includes(path.extname(entry.name)) &&
				!path.join(entry.parentPath, entry.name).includes(`${path.sep}tests${path.sep}`),
		)
		.map((entry) => path.join(entry.parentPath, entry.name));
}

const SOURCES = productSources().map((file) => ({
	file: path.relative(moduleRoot, file),
	source: fs.readFileSync(file, "utf8"),
}));

/**
 * Identifiers that would mean this adapter had started owning media, reducing
 * protocol events, or keeping a transcript of its own. Each names work that
 * already has an owner: codex-realtime owns media and the state machine, the
 * host adapter owns semantic events, and TASK-143.04.04 owns the transcript.
 */
const FORBIDDEN = [
	"getUserMedia",
	"RTCPeerConnection",
	"MediaStream",
	"AudioContext",
	"createDataChannel",
	"setLocalDescription",
	"setRemoteDescription",
	"createOffer",
	"attachRemoteMedia",
	"onSemanticEvent",
	"appendText",
	"appendSpeech",
	"transcript",
	"createRealtimeMediaSession",
	"createBrowserWorkbenchMediaOwner",
	"createBrowserWorkbenchTransport",
	"transitionRealtimeState",
] as const;

describe("voice session adapter boundaries", () => {
	test("names no media, protocol, transcript, or owner-construction work", () => {
		for (const { file, source } of SOURCES) {
			for (const identifier of FORBIDDEN) {
				expect(source.includes(identifier), `${file} mentions ${identifier}`).toBe(false);
			}
		}
	});

	test("declares ports the real owners already satisfy", () => {
		// Type-level: the assignments below fail to compile if either owner drifts
		// away from the narrow surface this module claims to need. Nothing is
		// constructed, so the check costs a null.
		const media: VoiceRealtimePort | null = null as BrowserWorkbenchMediaOwner | null;
		const transport: VoiceTransportPort | null = null as BrowserWorkbenchTransport | null;
		expect(media).toBeNull();
		expect(transport).toBeNull();
	});

	test("exposes no media, protocol, or transport object through the projected view", () => {
		const view = projectVoiceSession({
			media: mediaSnapshot(
				{ phase: "listening", reason: "negotiation_succeeded" },
				{
					inputLevel: 0.42,
				},
			),
			mediaState: { state: "ready" },
			transportState: connectedState(),
			capabilities: capabilities(),
			binding: null,
			replaced: false,
			busy: false,
			closed: false,
			closedSessionId: null,
			controlFailure: null,
		});
		for (const value of Object.values(view)) {
			const kind = typeof value;
			expect(["string", "number", "boolean", "object"], `${kind}`).toContain(kind);
			if (kind !== "object" || value === null) continue;
			// Every nested value is a frozen record of primitives, never a media,
			// peer connection, snapshot, or protocol object.
			for (const nested of Object.values(value as Record<string, unknown>)) {
				expect(["string", "number", "boolean", "object"]).toContain(typeof nested);
				expect(typeof nested === "object" && nested !== null).toBe(false);
			}
		}
		expect(view.sessionId).toBe("session-1");
		expect(view.inputLevel).toBe(0.42);
		expect(Object.keys(view).includes("transcript")).toBe(false);
	});

	test("chooses no recovery: a recoverable failure only offers a control", async () => {
		const realtime = realtimeFake(
			mediaSnapshot({
				phase: "recoverable_error",
				reason: "ice_disconnected",
				message: "The realtime audio connection was lost.",
			}),
		);
		const transport = transportFake();
		const session = createVoiceSession({ realtime, transport });

		expect(session.view().outcome).toEqual({
			kind: "retry",
			control: "restart",
			label: "Restart voice",
			recovery: "Restart voice to negotiate a new realtime session on the coordinator.",
		});
		// Nothing was driven; the person's press is what drives it.
		expect(realtime.calls()).toEqual([]);

		// A further host notification still drives nothing on its own.
		transport.set(connectedState(snapshot({ voice: voice({ state: "recovering" }) })));
		expect(realtime.calls()).toEqual([]);

		await session.restart();
		expect(realtime.calls()).toEqual(["stop", "start"]);
		session.dispose();
	});

	test("keeps no history: the view is a function of the current authoritative state", () => {
		const realtime = realtimeFake(
			mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
		);
		const transport = transportFake();
		const session = createVoiceSession({ realtime, transport });
		const first = session.view();

		realtime.set(mediaSnapshot({ phase: "speaking", reason: "assistant_started" }));
		expect(session.view().status).toBe("agent_speaking");

		realtime.set(mediaSnapshot({ phase: "listening", reason: "assistant_finished" }));
		const back = session.view();
		expect(back.status).toBe(first.status);
		expect(back.detail).not.toBe(first.detail);
		session.dispose();
	});
});

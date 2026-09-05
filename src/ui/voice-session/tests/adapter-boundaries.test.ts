import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { BrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import { createVoiceSession, projectVoiceSession } from "@/ui/voice-session";
import type { VoiceRealtimePort, VoiceTransportPort } from "@/ui/voice-session";
import {
	capabilities,
	connectedState,
	mediaSnapshot,
	realtimeFake,
	transportFake,
} from "@/ui/voice-session/tests/support/fakes";
import { snapshot, voice } from "@/ui/voice-session/tests/support/workbench-fixture";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

const moduleRoot = path.resolve(import.meta.dirname, "..");

/**
 * Every product source file in the module.
 * @returns The file paths.
 */
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
 * host adapter owns semantic events, and the transcript has its own module.
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

/**
 * Whether a value is a plain record of primitives.
 * @param value The value.
 * @returns True for a non-null object holding only primitives.
 */
function flatRecord(value: unknown): boolean {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return Object.values(value).every((nested) => typeof nested !== "object" || nested === null);
}

describe("voice session adapter boundaries", () => {
	test("names no media, protocol, transcript, or owner-construction work", () => {
		expect(SOURCES.length).toBeGreaterThan(0);
		for (const { file, source } of SOURCES) {
			for (const identifier of FORBIDDEN) {
				expect(source.includes(identifier), `${file} mentions ${identifier}`).toBe(false);
			}
		}
	});

	test("declares ports the real owners already satisfy", () => {
		// Type-level: the assignments fail to compile if either owner drifts away
		// from the narrow surface this module claims to need.
		const media: VoiceRealtimePort | null = null as BrowserWorkbenchMediaOwner | null;
		const transport: VoiceTransportPort | null = null as BrowserWorkbenchTransport | null;
		expect(media).toBeNull();
		expect(transport).toBeNull();
	});

	test("exposes no media, protocol, or transport object through the projected view", () => {
		const view = projectVoiceSession({
			media: mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }),
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
		for (const [key, value] of Object.entries(view)) {
			const kind = typeof value;
			expect(["string", "number", "boolean", "object"], key).toContain(kind);
			if (kind === "object" && value !== null) {
				// Every nested value is a frozen record of primitives, never a
				// media, peer connection, snapshot, or protocol object.
				expect(flatRecord(value), key).toBe(true);
			}
		}
		expect(view.sessionId).toBe("session-1");
		expect(Object.keys(view)).not.toContain("transcript");
		// The output level is not a status field; it has its own channel.
		expect(Object.keys(view)).not.toContain("level");
		expect(Object.keys(view)).not.toContain("inputLevel");
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
		const session = createVoiceSession({ realtime, transport, paneId: "pane-a" });

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
		const session = createVoiceSession({ realtime, transport, paneId: "pane-a" });
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

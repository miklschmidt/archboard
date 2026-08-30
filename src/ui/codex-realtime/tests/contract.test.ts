import { describe, expect, test } from "bun:test";
import { API } from "typescript/unstable/async";
import * as ts from "typescript/unstable/ast";
import {
	assertRealtimeTransition,
	canTransitionRealtimeState,
	INITIAL_REALTIME_STATE,
	REALTIME_PHASES,
	REALTIME_TRANSITIONS,
	transitionRealtimeState,
} from "../index.js";
import type {
	AppendOutcome,
	CommandOutcome,
	RealtimeHost,
	RealtimeItemId,
	RealtimeCorrelationId,
	RealtimeSemanticEvent,
	RealtimeSessionId,
	RealtimeState,
	RealtimeTranscriptRecord,
	RemoteMediaAttachment,
} from "../index.js";

const sessionId = "session-from-host" as RealtimeSessionId;
const correlationId = "correlation-from-host" as RealtimeCorrelationId;
const itemId = "item-from-host" as RealtimeItemId;

type StateReasonByPhase = {
	readonly [Phase in RealtimeState["phase"]]: readonly Extract<
		RealtimeState,
		{ readonly phase: Phase }
	>["reason"][];
};

function state(phase: RealtimeState["phase"], reason: string): RealtimeState {
	if (!(DECLARED_STATE_REASONS[phase] as readonly string[]).includes(reason)) {
		throw new Error(`Invalid test state ${phase}:${reason}`);
	}
	return phase === "recoverable_error" || phase === "terminal_error"
		? ({ phase, reason, message: "test" } as RealtimeState)
		: ({ phase, reason } as RealtimeState);
}

const DECLARED_STATE_REASONS = {
	idle: ["created", "recovered"],
	requesting_permission: ["start_requested", "recovery_requested"],
	negotiating: ["permission_granted", "offer_created", "answer_received", "recovery_requested"],
	listening: [
		"negotiation_succeeded",
		"unmute_requested",
		"processing_complete",
		"assistant_finished",
	],
	muted: ["mute_requested"],
	processing: ["input_completed", "user_interrupted"],
	speaking: ["assistant_started"],
	stopping: ["stop_requested", "dispose_requested"],
	recoverable_error: [
		"permission_denied",
		"device_unavailable",
		"device_lost",
		"sdp_failed",
		"ice_disconnected",
		"data_channel_closed",
		"remote_media_failed",
		"autoplay_suspended",
		"realtime_unavailable",
		"app_server_unavailable",
		"coordinator_unavailable",
		"append_failed",
		"recovery_failed",
		"stop_failed",
	],
	terminal_error: ["unsupported_browser", "invalid_session", "protocol_error", "fatal_error"],
	closed: ["stopped", "disposed"],
} as const satisfies StateReasonByPhase;

const repoRoot = new URL("../../../../", import.meta.url).pathname;
const frontendConfigPath = new URL("../../../../tsconfig.frontend.json", import.meta.url).pathname;
const publicSourcePaths = [
	new URL("../index.ts", import.meta.url).pathname,
	new URL("../lib/contract.ts", import.meta.url).pathname,
] as const;

const NODE_BUILTIN_MODULES = new Set(
	"assert assert/strict async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns dns/promises domain events fs fs/promises http http2 https module net os path path/posix path/win32 perf_hooks process punycode querystring readline readline/promises repl stream stream/consumers stream/promises stream/web string_decoder sys timers timers/promises tls trace_events tty url util util/types v8 vm wasi worker_threads zlib".split(
		" ",
	),
);

const FORBIDDEN_API_SPELLINGS = new Set(
	"buffer process websocket websocketserver mediarecorder rtcpeerconnection rtcdatachannel mediastream mediastreamtrack audiocontext analyzernode audioworklet audiobuffer audiochunk audio_chunk audio-chunk appendaudio outputaudio transport socket remoteid remotesessionid remoteidentity remote_id remote_session_id remote_identity".split(
		" ",
	),
);

function auditModuleSpecifier(findings: Set<string>, specifier: string): void {
	const normalized = specifier.toLowerCase();
	const root = normalized.split("/")[0] ?? "";
	if (
		normalized.startsWith("node:") ||
		NODE_BUILTIN_MODULES.has(normalized) ||
		NODE_BUILTIN_MODULES.has(root)
	) {
		findings.add(`forbidden module: ${specifier}`);
	}
	if (/^(?:react(?:\/|$)|@assistant-ui\/react(?:\/|$))/.test(normalized)) {
		findings.add(`forbidden UI module: ${specifier}`);
	}
	if (/(?:assistant-ui|archboard|codex)/.test(normalized)) {
		findings.add(`forbidden wire module: ${specifier}`);
	}
}

function auditSourceFile(sourceFile: ts.SourceFile): readonly string[] {
	const findings = new Set<string>();
	const auditSpelling = (text: string): void => {
		const normalized = text.toLowerCase();
		if (
			FORBIDDEN_API_SPELLINGS.has(normalized) ||
			normalized.includes("codex") ||
			normalized.includes("archboard")
		) {
			findings.add(`forbidden spelling: ${text}`);
		}
	};
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			auditModuleSpecifier(findings, node.moduleSpecifier.text);
		}
		if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			auditModuleSpecifier(findings, node.moduleSpecifier.text);
		}
		if (ts.isImportExpression(node)) findings.add("dynamic import");
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "require"
		)
			findings.add("require call");
		if (ts.isIdentifier(node) || ts.isStringLiteral(node)) auditSpelling(node.text);
		ts.visitEachChild(node, (child) => {
			visit(child);
			return child;
		});
	};
	visit(sourceFile);
	return [...findings];
}

const FORBIDDEN_SOURCE_FIXTURES = [
	{ label: "React package import", source: 'import React from "react";' },
	{ label: "React subpath export", source: 'export { jsx } from "react/jsx-runtime";' },
	{ label: "React dynamic subpath import", source: 'void import("react/jsx-runtime");' },
	{ label: "assistant-ui package import", source: 'import { Thread } from "@assistant-ui/react";' },
	{
		label: "assistant-ui subpath export",
		source: 'export { runtime } from "@assistant-ui/react/runtime";',
	},
	{ label: "assistant-ui dynamic import", source: 'void import("@assistant-ui/react/runtime");' },
	{ label: "node scheme import", source: 'import fs from "node:fs";' },
	{ label: "bare Node builtin import", source: 'import path from "path";' },
	{ label: "Buffer and process", source: 'const value = Buffer.from("x"); process.env.TEST;' },
	{ label: "WebSocket handle", source: 'const socket = new WebSocket("wss://example.test");' },
	{
		label: "audio chunk handle",
		source: "declare const appendAudio: (audioChunk: Uint8Array) => void;",
	},
	{ label: "transport handle", source: "declare const transport: Transport;" },
	{
		label: "Codex wire import",
		source: 'import type { Event } from "./generated/codex-protocol.js";',
	},
	{ label: "Archboard wire import", source: 'import type { Board } from "@archboard/runtime";' },
	{
		label: "caller-selected remote identity",
		source: "interface Attachment { remoteId: string; }",
	},
] as const;

async function auditPublicSources(): Promise<{
	readonly publicFindings: readonly string[];
	readonly fixtureFindings: readonly (readonly string[])[];
}> {
	const fixturePaths = FORBIDDEN_SOURCE_FIXTURES.map(
		(_, index) => `/tmp/archboard-codex-realtime-policy-${crypto.randomUUID()}-${index}.ts`,
	);
	const compiler = new API({ cwd: repoRoot });
	try {
		await Promise.all(
			fixturePaths.map((path, index) => {
				const fixture = FORBIDDEN_SOURCE_FIXTURES[index];
				if (!fixture) throw new Error(`Missing fixture ${index}`);
				return Bun.write(path, fixture.source);
			}),
		);
		const snapshot = await compiler.updateSnapshot({
			openProjects: [frontendConfigPath],
			openFiles: [...publicSourcePaths, ...fixturePaths],
		});
		const projects = snapshot.getProjects();
		if (!projects.some((candidate) => candidate.configFileName === frontendConfigPath)) {
			throw new Error(`No frontend project for ${frontendConfigPath}`);
		}
		const sourceFor = async (path: string): Promise<ts.SourceFile> => {
			for (const project of projects) {
				const sourceFile = await project.program.getSourceFile(path);
				if (sourceFile) return sourceFile;
			}
			throw new Error(`AST did not load ${path}`);
		};
		const publicSourceFiles = await Promise.all(publicSourcePaths.map(sourceFor));
		const fixtureSourceFiles = await Promise.all(fixturePaths.map(sourceFor));
		return {
			publicFindings: publicSourceFiles.flatMap(auditSourceFile),
			fixtureFindings: fixtureSourceFiles.map(auditSourceFile),
		};
	} finally {
		try {
			await compiler.close();
		} catch {
			// TypeScript's worker can race its final response during test shutdown.
		}
		Bun.spawnSync(["rm", "-f", ...fixturePaths]);
	}
}

describe("codex realtime public contract", () => {
	test("exports one host port and no implementation handles", async () => {
		const host: RealtimeHost = {
			createOffer: async (offer) => ({
				sessionId: offer.sessionId,
				correlationId: offer.correlationId,
				sdp: offer.sdp,
			}),
			attachRemoteMedia: (attachment: RemoteMediaAttachment) => {
				void attachment.attachTo;
			},
			onSemanticEvent: () => () => undefined,
			appendText: async (request) => ({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
			appendSpeech: async (request) => ({
				outcome: "not_delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "rejected",
			}),
			stop: async (request) => ({
				outcome: "outcome_unknown",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
				reason: "response_lost",
			}),
			recover: async (request) => ({
				outcome: "delivered",
				sessionId: request.sessionId,
				correlationId: request.correlationId,
			}),
		};

		const offer = await host.createOffer({ sessionId, correlationId, sdp: "offer" });
		expect(offer).toEqual({ sessionId, correlationId, sdp: "offer" });
		expect(host.attachRemoteMedia).toBeTypeOf("function");
		expect(host.onSemanticEvent).toBeTypeOf("function");
		expect(host.appendText).toBeTypeOf("function");
		expect(host.appendSpeech).toBeTypeOf("function");
		expect(host.stop).toBeTypeOf("function");
		expect(host.recover).toBeTypeOf("function");
	});

	test("keeps the phase vocabulary and transition reasons closed", () => {
		expect(REALTIME_PHASES).toEqual([
			"idle",
			"requesting_permission",
			"negotiating",
			"listening",
			"muted",
			"processing",
			"speaking",
			"stopping",
			"recoverable_error",
			"terminal_error",
			"closed",
		]);
		expect(REALTIME_TRANSITIONS.idle.requesting_permission).toEqual([
			"start_requested",
			"recovery_requested",
		]);
		expect(REALTIME_TRANSITIONS.idle.stopping).toEqual(["dispose_requested"]);
		expect(REALTIME_TRANSITIONS.negotiating.terminal_error).toEqual([
			"unsupported_browser",
			"invalid_session",
			"protocol_error",
			"fatal_error",
		]);
		expect(REALTIME_TRANSITIONS.stopping.closed).toEqual(["stopped", "disposed"]);
		expect(REALTIME_TRANSITIONS.closed).toEqual({});
	});

	test("has one reachable route for every declared phase reason and edge", () => {
		const incoming = new Map<RealtimeState["phase"], Set<string>>();

		for (const from of REALTIME_PHASES) {
			const seedReason = DECLARED_STATE_REASONS[from][0];
			if (!seedReason) throw new Error(`No seed reason for ${from}`);
			const current = state(from, seedReason);
			for (const [destination, reasons] of Object.entries(REALTIME_TRANSITIONS[from])) {
				if (!reasons) continue;
				for (const reason of reasons) {
					const next = state(destination as RealtimeState["phase"], reason);
					expect(canTransitionRealtimeState(current, next)).toBe(true);
					expect(transitionRealtimeState(current, next)).toEqual(next);
					const destinationReasons = incoming.get(next.phase) ?? new Set<string>();
					destinationReasons.add(next.reason);
					incoming.set(next.phase, destinationReasons);
				}
			}
		}

		for (const phase of REALTIME_PHASES) {
			for (const reason of DECLARED_STATE_REASONS[phase]) {
				if (phase === "idle" && reason === "created") continue;
				expect(incoming.get(phase)?.has(reason)).toBe(true);
			}
		}
		for (const phase of REALTIME_PHASES) {
			if (phase !== "stopping") expect(REALTIME_TRANSITIONS[phase].closed).toBeUndefined();
		}
	});

	test("accepts legal transitions and rejects illegal or post-close transitions", () => {
		const requesting = state("requesting_permission", "start_requested");
		const negotiating = state("negotiating", "permission_granted");
		const listening = state("listening", "negotiation_succeeded");
		const muted = state("muted", "mute_requested");
		const stopping = state("stopping", "dispose_requested");
		const closed = state("closed", "stopped");
		const disposed = state("closed", "disposed");

		expect(canTransitionRealtimeState(INITIAL_REALTIME_STATE, requesting)).toBe(true);
		expect(canTransitionRealtimeState(requesting, negotiating)).toBe(true);
		expect(canTransitionRealtimeState(negotiating, listening)).toBe(true);
		expect(canTransitionRealtimeState(listening, muted)).toBe(true);
		expect(canTransitionRealtimeState(listening, state("idle", "created"))).toBe(false);
		expect(canTransitionRealtimeState(INITIAL_REALTIME_STATE, stopping)).toBe(true);
		expect(canTransitionRealtimeState(stopping, disposed)).toBe(true);
		expect(canTransitionRealtimeState(listening, disposed)).toBe(false);
		expect(canTransitionRealtimeState(closed, requesting)).toBe(false);
		expect(() =>
			assertRealtimeTransition(listening, state("speaking", "assistant_started")),
		).toThrow(/Illegal realtime transition/);
		expect(() => transitionRealtimeState(closed, requesting)).toThrow(
			/No such transition is allowed/,
		);
		expect(transitionRealtimeState(INITIAL_REALTIME_STATE, requesting)).toEqual(requesting);
	});

	test("freezes public contract records and transition data", () => {
		expect(Object.isFrozen(REALTIME_PHASES)).toBe(true);
		expect(Object.isFrozen(REALTIME_TRANSITIONS)).toBe(true);
		for (const transitions of Object.values(REALTIME_TRANSITIONS)) {
			expect(Object.isFrozen(transitions)).toBe(true);
			for (const reasons of Object.values(transitions)) expect(Object.isFrozen(reasons)).toBe(true);
		}
		expect(Object.isFrozen(INITIAL_REALTIME_STATE)).toBe(true);
		const next = transitionRealtimeState(
			INITIAL_REALTIME_STATE,
			state("requesting_permission", "start_requested"),
		);
		expect(Object.isFrozen(next)).toBe(true);
	});

	test("exposes item-scoped transcript records and all append delivery outcomes", () => {
		const record: RealtimeTranscriptRecord = {
			sessionId,
			correlationId,
			itemId,
			sequence: 4,
			role: "user",
			status: "provisional",
			text: "move the box",
		};
		const event: RealtimeSemanticEvent = { kind: "transcript", record };
		const outcomes: AppendOutcome[] = [
			{ outcome: "delivered", sessionId, correlationId },
			{ outcome: "not_delivered", sessionId, correlationId, reason: "rejected" },
			{ outcome: "outcome_unknown", sessionId, correlationId, reason: "response_lost" },
		];

		expect(event.record.itemId).toBe(itemId);
		expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
			"delivered",
			"not_delivered",
			"outcome_unknown",
		]);
	});

	test("keeps the public module browser-only and transport-neutral", async () => {
		const { publicFindings, fixtureFindings } = await auditPublicSources();
		expect(publicFindings).toEqual([]);
		for (const [index, findings] of fixtureFindings.entries()) {
			if (findings.length === 0) {
				throw new Error(
					`Audit accepted forbidden fixture: ${FORBIDDEN_SOURCE_FIXTURES[index]?.label}`,
				);
			}
		}
	});
});

// @ts-expect-error A session identity is host-created and cannot come from a plain string.
const callerSession: RealtimeSessionId = "caller-selected";
void callerSession;

const immutableHost: RealtimeHost = {} as RealtimeHost;
// @ts-expect-error A host has no mutable public ports.
immutableHost.stop = async () => ({
	outcome: "delivered",
	sessionId,
	correlationId,
});

const immutableRecord: RealtimeTranscriptRecord = {
	sessionId,
	correlationId,
	itemId,
	sequence: 1,
	role: "assistant",
	status: "final",
	text: "done",
};
// @ts-expect-error A transcript record is immutable after delivery.
immutableRecord.text = "changed";

const callerSelectedRemote: RemoteMediaAttachment = {
	sessionId,
	correlationId,
	// @ts-expect-error Remote media has no caller-selected remote identity field.
	remoteId: "remote",
	attachTo: () => undefined,
};
void callerSelectedRemote;

const validCommandOutcome: CommandOutcome = {
	outcome: "outcome_unknown",
	sessionId,
	correlationId,
	reason: "response_lost",
};
void validCommandOutcome;

const impossibleAppendNotDelivered: AppendOutcome = {
	outcome: "not_delivered",
	sessionId,
	correlationId,
	// @ts-expect-error Definite non-delivery cannot use an uncertainty reason.
	reason: "response_lost",
};
void impossibleAppendNotDelivered;

const impossibleAppendUnknown: AppendOutcome = {
	outcome: "outcome_unknown",
	sessionId,
	correlationId,
	// @ts-expect-error Unknown outcome cannot use a definite rejection reason.
	reason: "rejected",
};
void impossibleAppendUnknown;

const impossibleCommandNotDelivered: CommandOutcome = {
	outcome: "not_delivered",
	sessionId,
	correlationId,
	// @ts-expect-error Definite command non-delivery cannot use an uncertainty reason.
	reason: "transport_failure",
};
void impossibleCommandNotDelivered;

const impossibleCommandUnknown: CommandOutcome = {
	outcome: "outcome_unknown",
	sessionId,
	correlationId,
	// @ts-expect-error Unknown command outcome cannot use a definite rejection reason.
	reason: "not_ready",
};
void impossibleCommandUnknown;

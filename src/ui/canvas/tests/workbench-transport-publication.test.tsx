import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchMediaOwner } from "../../codex-workbench-media/index.js";
import type { VoiceContextHistory } from "../../voice-context/index.js";
import type { VoiceSession, VoiceSessionView } from "../../voice-session/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import type { CanvasPaneVoiceRegistration } from "../CanvasPane.js";
import type { CanvasSessionOptions } from "../useCanvasSession.js";
import type { PaneStatus } from "../../types/index.js";

registerHappyDom();
const { act, cleanup, render } = await loadRenderedUiTools();

await mock.module("@excalidraw/excalidraw", () => ({
	Excalidraw: () => <div data-excalidraw="mock" />,
	getLibraryItemsHash: () => 0,
}));

const EMPTY_LIBRARY_ITEMS: LibraryItems = [];
const publications: Array<readonly [string, BrowserWorkbenchTransport | null]> = [];
const voicePublications: Array<readonly [string, CanvasPaneVoiceRegistration | null]> = [];
const lifecycle: string[] = [];
const voiceCreations: Array<{
	readonly realtime: BrowserWorkbenchMediaOwner;
	readonly transport: BrowserWorkbenchTransport;
	readonly paneId: string;
	readonly session: VoiceSession;
}> = [];
const evidenceInputs: Array<{
	readonly history: VoiceContextHistory;
	readonly snapshot: BrowserSnapshot;
	readonly session: VoiceSessionView;
}> = [];
let firstActiveSessionId = "voice-first";
let firstDirectSnapshotAvailable = true;
let firstConnection: "connected" | "reconnecting" = "connected";
const transportEvidenceListeners = new WeakMap<BrowserWorkbenchTransport, Set<() => void>>();

function browserSnapshot(sessionId: string, suffix: string): BrowserSnapshot {
	return {
		voice: {
			realtimeSessionId: sessionId,
			transcript: [
				{
					itemId: `item-${suffix}-1`,
					sequence: 1,
					speaker: "user",
					text: `Provisional ${suffix}`,
					final: false,
				},
				{
					itemId: `item-${suffix}-2`,
					sequence: 2,
					speaker: "assistant",
					text: `Final ${suffix}`,
					final: true,
				},
			],
		},
		voiceContext: null,
	} as BrowserSnapshot;
}

function fakeTransport(sessionId: () => string, suffix: string): BrowserWorkbenchTransport {
	const retainedSnapshot = (): BrowserSnapshot => browserSnapshot(sessionId(), suffix);
	const snapshot = (): BrowserSnapshot | null =>
		suffix === "first" && !firstDirectSnapshotAvailable ? null : retainedSnapshot();
	const listeners = new Set<() => void>();
	const transport = Object.freeze({
		snapshot,
		state: (): BrowserWorkbenchState => {
			if (suffix === "first" && firstConnection === "reconnecting") {
				return {
					kind: "connection",
					state: "backoff",
					connection: "reconnecting",
					snapshot: retainedSnapshot(),
					sequence: 1,
					retryAtMs: Date.now() + 1_000,
					reason: "Transient test backoff.",
				};
			}
			return {
				kind: "readiness",
				state: "thread_capable",
				connection: "connected",
				snapshot: retainedSnapshot(),
				sequence: 1,
			};
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	}) as unknown as BrowserWorkbenchTransport;
	transportEvidenceListeners.set(transport, listeners);
	return transport;
}

const FIRST_TRANSPORT = fakeTransport(() => firstActiveSessionId, "first");
const SECOND_TRANSPORT = fakeTransport(() => "voice-second", "second");
let currentTransport: BrowserWorkbenchTransport | null = FIRST_TRANSPORT;
let reportStatus: CanvasSessionOptions["onStatus"] | null = null;

function publishTransport(paneId: string, transport: BrowserWorkbenchTransport | null): void {
	lifecycle.push(
		`text:${transport === FIRST_TRANSPORT ? "first" : transport === null ? "null" : "second"}`,
	);
	publications.push([paneId, transport]);
}

function publishVoice(paneId: string, registration: CanvasPaneVoiceRegistration | null): void {
	lifecycle.push(
		`voice:${registration?.transport === FIRST_TRANSPORT ? "first" : registration === null ? "null" : "second"}`,
	);
	voicePublications.push([paneId, registration]);
}

function voiceView(sessionId: string): VoiceSessionView {
	return {
		status: "listening",
		label: "Listening",
		detail: "Voice is listening.",
		accessibleStatus: "Voice is listening.",
		failure: null,
		outcome: { kind: "none" },
		controls: {
			canStart: false,
			canMute: true,
			canUnmute: false,
			canStop: true,
			canRestart: false,
			canClose: false,
		},
		binding: {
			paneId: "pane-1",
			childId: `child-${sessionId}`,
			epoch: `epoch-${sessionId}`,
			workhorseThreadId: `workhorse-${sessionId}`,
			coordinatorThreadId: `coordinator-${sessionId}`,
		},
		sessionId,
	};
}

function fakeVoiceSession(sessionId: string): VoiceSession {
	const listeners = new Set<() => void>();
	const view = voiceView(sessionId);
	return Object.freeze({
		view: () => view,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => 0,
		subscribeLevel: () => () => undefined,
		refresh: () => view,
		start: async () => view,
		mute: async () => view,
		unmute: async () => view,
		stop: async () => view,
		restart: async () => view,
		close: async () => view,
		dispose: () => {
			lifecycle.push(`dispose:${sessionId}`);
			listeners.clear();
		},
	});
}

const voiceSessionUrl = new URL("../../voice-session/index.ts", import.meta.url).href;
await mock.module(voiceSessionUrl, () => ({
	createVoiceSession(input: {
		realtime: BrowserWorkbenchMediaOwner;
		transport: BrowserWorkbenchTransport;
		paneId: string;
	}) {
		const sessionId = input.transport === FIRST_TRANSPORT ? "voice-first" : "voice-second";
		const voiceSession = fakeVoiceSession(sessionId);
		voiceCreations.push({ ...input, session: voiceSession });
		lifecycle.push(`create:${sessionId}`);
		return voiceSession;
	},
}));

const ignoredHistoryMutation = () =>
	Object.freeze({ outcome: "ignored", reason: "unbound_session", revision: 0 } as const);

function fakeHistory(): VoiceContextHistory {
	return Object.freeze({
		snapshot: () => ({ revision: 0, sessions: [] }),
		subscribe: () => () => undefined,
		capture: ignoredHistoryMutation,
		observe: ignoredHistoryMutation,
		append: ignoredHistoryMutation,
		recordSourceHistory: ignoredHistoryMutation,
	});
}

const voiceContextUrl = new URL("../../voice-context/index.tsx", import.meta.url).href;
await mock.module(voiceContextUrl, () => ({
	createVoiceContextHistory: fakeHistory,
	ingestVoiceContextBrowserEvidence(
		history: VoiceContextHistory,
		input: { snapshot: BrowserSnapshot; session: VoiceSessionView },
	) {
		evidenceInputs.push({ history, snapshot: input.snapshot, session: input.session });
		return Object.freeze({});
	},
}));

const session = {
	attachExcalidraw: () => undefined,
	boardKey: null,
	attachPaneElement: () => undefined,
	connected: true,
	board: null,
	handleChange: () => undefined,
	markInteracted: () => undefined,
	readOnly: false,
	heldBy: null,
	takeBack: async () => ({ outcome: "success" as const }),
	doing: [],
	realtime: {
		snapshot: () => ({
			correlation: {
				sessionId: (currentTransport === SECOND_TRANSPORT
					? "voice-second"
					: "voice-first") as never,
				correlationId: (currentTransport === SECOND_TRANSPORT
					? "correlation-second"
					: "correlation-first") as never,
			},
			state: { phase: "listening", reason: "negotiation_succeeded" as const },
			inputLevel: 0,
		}),
	} as unknown as BrowserWorkbenchMediaOwner,
	workbenchTransport: () => currentTransport,
};

const sessionUrl = new URL("../useCanvasSession.ts", import.meta.url).href;
await mock.module(sessionUrl, () => ({
	useCanvasSession(options: CanvasSessionOptions) {
		reportStatus = options.onStatus;
		return session;
	},
}));

const { CanvasPane } = await import("../CanvasPane.js");

afterEach(() => {
	cleanup();
	currentTransport = FIRST_TRANSPORT;
	reportStatus = null;
	publications.length = 0;
	voicePublications.length = 0;
	voiceCreations.length = 0;
	evidenceInputs.length = 0;
	lifecycle.length = 0;
	firstActiveSessionId = "voice-first";
	firstDirectSnapshotAvailable = true;
	firstConnection = "connected";
});
afterAll(unregisterHappyDom);

const STATUS: PaneStatus = {
	paneId: "pane-1",
	clientId: "pane-1-client",
	connected: true,
	board: null,
	boardKey: null,
	elementCount: 0,
	lastChangeAt: null,
	hold: null,
	writtenElsewhere: null,
	doing: [],
};

function noop(): void {}

test("publishes each production pane transport once, clears before replacement, and clears on unmount", () => {
	const view = render(
		<CanvasPane
			focused
			label="Pane A"
			libraryItems={EMPTY_LIBRARY_ITEMS}
			onAgentState={noop}
			onBoardError={noop}
			onCodeTargetNotice={noop}
			onFocus={noop}
			onLayoutRequest={noop}
			onLibraryChange={noop}
			onLibraryChangedElsewhere={noop}
			onPaneStateAccepted={noop}
			onPathFocusController={noop}
			onPathFocusSnapshot={noop}
			onPreviewController={noop}
			onSelectionSnapshot={noop}
			onStatus={noop}
			onThemeChange={noop}
			onVoiceRegistration={publishVoice}
			onWorkbenchTransport={publishTransport}
			paneId="pane-1"
			presentation={null}
			primary
			theme="light"
		/>,
	);

	if (reportStatus === null) throw new Error("CanvasPane did not connect its status reporter.");
	act(() => reportStatus?.(STATUS));
	act(() => reportStatus?.(STATUS));
	expect(publications).toEqual([["pane-1", FIRST_TRANSPORT]]);
	expect(voiceCreations).toHaveLength(1);
	expect(voiceCreations[0]).toMatchObject({
		realtime: session.realtime,
		transport: FIRST_TRANSPORT,
		paneId: "pane-1",
	});
	expect(voicePublications).toHaveLength(1);
	const firstRegistration = voicePublications[0]?.[1];
	if (firstRegistration === null || firstRegistration === undefined)
		throw new Error("CanvasPane did not publish its first voice registration.");
	expect(Object.isFrozen(firstRegistration)).toBe(true);
	expect(firstRegistration.history).toBe(evidenceInputs[0]!.history);
	const evidenceCount = evidenceInputs.length;
	act(() => {
		for (const listener of transportEvidenceListeners.get(FIRST_TRANSPORT) ?? []) listener();
	});
	expect(evidenceInputs).toHaveLength(evidenceCount);
	firstConnection = "reconnecting";
	act(() => {
		for (const listener of transportEvidenceListeners.get(FIRST_TRANSPORT) ?? []) listener();
	});
	expect(evidenceInputs).toHaveLength(evidenceCount + 1);
	expect(firstRegistration.transcriptRecords()).toMatchObject([
		{
			sessionId: "voice-first",
			correlationId: "correlation-first",
			sequence: 1,
			role: "user",
			status: "provisional",
			text: "Provisional first",
		},
		{
			sessionId: "voice-first",
			correlationId: "correlation-first",
			sequence: 2,
			role: "assistant",
			status: "final",
			text: "Final first",
		},
	]);
	firstActiveSessionId = "another-session";
	expect(firstRegistration.transcriptRecords()).toEqual([]);
	firstActiveSessionId = "voice-first";

	currentTransport = null;
	firstDirectSnapshotAvailable = false;
	act(() => reportStatus?.(STATUS));
	expect(publications.at(-1)).toEqual(["pane-1", null]);
	expect(voicePublications).toHaveLength(1);
	expect(lifecycle).not.toContain("dispose:voice-first");
	expect(firstRegistration.transcriptRecords()).toHaveLength(2);

	currentTransport = FIRST_TRANSPORT;
	firstDirectSnapshotAvailable = true;
	firstConnection = "connected";
	act(() => reportStatus?.(STATUS));
	expect(publications.at(-1)).toEqual(["pane-1", FIRST_TRANSPORT]);
	expect(voiceCreations).toHaveLength(1);
	expect(voicePublications).toHaveLength(1);

	currentTransport = SECOND_TRANSPORT;
	act(() => reportStatus?.(STATUS));
	expect(voiceCreations).toHaveLength(2);
	const secondRegistration = voicePublications.at(-1)?.[1];
	if (secondRegistration === null || secondRegistration === undefined)
		throw new Error("CanvasPane did not publish its replacement voice registration.");
	expect(secondRegistration.transport).toBe(SECOND_TRANSPORT);
	expect(secondRegistration.session).not.toBe(firstRegistration.session);
	expect(secondRegistration.history).toBe(firstRegistration.history);
	const replacementEvents = lifecycle.slice(lifecycle.indexOf("voice:null"));
	expect(replacementEvents).toEqual([
		"voice:null",
		"dispose:voice-first",
		"text:null",
		"text:second",
		"create:voice-second",
		"voice:second",
	]);

	view.unmount();
	expect(publications.at(-1)).toEqual(["pane-1", null]);
	expect(voicePublications.at(-1)).toEqual(["pane-1", null]);
	expect(lifecycle.slice(-3)).toEqual(["voice:null", "dispose:voice-second", "text:null"]);
});

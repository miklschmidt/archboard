import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { useEffect } from "react";

import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type {
	CanvasPaneVoicePresentation,
	CanvasPaneVoiceRegistration,
} from "../../canvas/CanvasPane.js";
import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import { createVoiceContextHistory } from "../../voice-context/index.js";
import type {
	VoiceSession,
	VoiceSessionStatus,
	VoiceSessionView,
} from "../../voice-session/index.js";
import type { WorkbenchFrameProps } from "../../workbench-frame/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import { installFullscreen } from "./codex-workbench-integration-support.js";

registerHappyDom();
const { act, cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();

await mock.module("@excalidraw/excalidraw", () => ({
	exportToSvg: async () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
	getLibraryItemsHash: () => 0,
	mergeLibraryItems: (localItems: readonly unknown[]) => localItems,
	parseLibraryTokensFromUrl: () => null,
	restoreLibraryItems: (items: readonly unknown[]) => items,
}));

interface FakeTransport {
	readonly transport: BrowserWorkbenchTransport;
	readonly turnId: string;
	readonly commands: Array<{ readonly command: string; readonly turnId?: string }>;
	readonly listenerCount: () => number;
	readonly publish: () => void;
}

function fakeTransport(suffix: string): FakeTransport {
	const threadId = `thread-${suffix}`;
	const turnId = `turn-${suffix}`;
	const snapshot = {
		threadLink: {
			state: "executable",
			threadId,
			reason: null,
		},
		timeline: { threadId, turns: [{ turnId, status: "inProgress" }] },
		semantic: null,
		approvals: [],
		dynamicApprovals: [],
	} as unknown as BrowserSnapshot;
	const state = {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot,
		sequence: 1,
	} as BrowserWorkbenchState;
	const listeners = new Set<() => void>();
	const commands: Array<{ readonly command: string; readonly turnId?: string }> = [];
	const publish = (): void => listeners.forEach((listener) => listener());
	const transport = {
		snapshot: () => snapshot,
		state: () => state,
		captureCommandTarget: () => ({}),
		command: async (draft: { readonly command: string; readonly turnId?: string }) => {
			commands.push(draft);
			return {
				kind: "command_result",
				commandId: "command-test",
				outcome: "delivered",
				code: null,
				message: null,
				snapshot,
			};
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as BrowserWorkbenchTransport;
	return { transport, turnId, commands, listenerCount: () => listeners.size, publish };
}
interface FakeVoiceSession {
	readonly session: VoiceSession;
	readonly presentation: () => CanvasPaneVoicePresentation;
	readonly stops: () => number;
	readonly loseMedia: () => void;
	readonly set: (status: VoiceSessionStatus, options?: VoiceOptions) => void;
}
type VoiceOptions = { bound?: boolean; canStop?: boolean; label?: string; replaced?: boolean };
function voiceView(
	paneId: string,
	suffix: string,
	status: VoiceSessionStatus,
	options: VoiceOptions = {},
): VoiceSessionView {
	const active = status !== "ready" && status !== "unavailable" && status !== "stopped";
	const bound = active || options.bound === true;
	return Object.freeze({
		status,
		label: options.label ?? status.replaceAll("_", " "),
		detail: `Voice ${status.replaceAll("_", " ")}.`,
		accessibleStatus: `Voice ${status.replaceAll("_", " ")}.`,
		failure:
			status === "failed"
				? {
						code: options.replaced ? ("replaced" as const) : ("stop" as const),
						recoverable: false,
						message: "Voice Stop outcome is unknown.",
					}
				: null,
		outcome:
			status === "failed"
				? {
						kind: "terminal" as const,
						label: "Close voice",
						recovery: "Close the failed voice session.",
					}
				: { kind: "none" as const },
		controls: {
			canStart: status === "ready",
			canMute: status === "listening",
			canUnmute: status === "muted",
			canStop: options.canStop ?? active,
			canRestart: status === "failed",
			canClose: status === "failed" || status === "stopped",
		},
		binding: bound
			? {
					paneId,
					childId: `child-${suffix}`,
					epoch: `epoch-${suffix}`,
					workhorseThreadId: `voice-workhorse-${suffix}`,
					coordinatorThreadId: `voice-coordinator-${suffix}`,
				}
			: null,
		sessionId: active ? `voice-session-${suffix}` : null,
	}) satisfies VoiceSessionView;
}

function fakeVoiceSession(paneId: string, suffix: string): FakeVoiceSession {
	let current = voiceView(paneId, suffix, "ready");
	let retained: Pick<VoiceSessionView, "binding" | "sessionId"> | null = null;
	let stopCount = 0;
	const listeners = new Set<() => void>();
	const publish = (): void => listeners.forEach((listener) => listener());
	const presentation = (): CanvasPaneVoicePresentation => {
		if (current.status === "stopped" || current.failure?.code === "replaced") {
			retained = null;
			return { state: "none", frame: "retired" };
		}
		if (current.binding === null) {
			retained = null;
			return { state: "none", frame: "available" };
		}
		if (current.sessionId !== null) {
			retained = { binding: current.binding, sessionId: current.sessionId };
		}
		const sessionId = current.sessionId ?? retained?.sessionId ?? null;
		if (sessionId === null) return { state: "none", frame: "available" };
		const view = Object.freeze({ ...current, binding: current.binding, sessionId });
		return Object.freeze({
			state: "active",
			view,
			mute:
				current.failure === null && current.status === "listening"
					? "Unmuted"
					: current.failure === null && current.status === "muted"
						? "Muted"
						: "Unknown",
		});
	};
	const session = Object.freeze({
		view: () => current,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => 0,
		subscribeLevel: () => () => undefined,
		refresh: () => current,
		start: async () => current,
		mute: async () => current,
		unmute: async () => current,
		stop: async () => {
			stopCount += 1;
			return current;
		},
		restart: async () => current,
		close: async () => current,
		dispose: () => listeners.clear(),
	}) satisfies VoiceSession;
	return {
		session,
		presentation,
		stops: () => stopCount,
		loseMedia() {
			current = voiceView(paneId, suffix, "unavailable", { bound: true });
			publish();
		},
		set(status, options) {
			current = voiceView(paneId, suffix, status, options);
			publish();
		},
	};
}
function voiceRegistration(
	transport: FakeTransport,
	voice: FakeVoiceSession,
): CanvasPaneVoiceRegistration {
	const history = createVoiceContextHistory();
	const records = Object.freeze([]);
	return Object.freeze({
		transport: transport.transport,
		session: voice.session,
		history,
		presentation: voice.presentation,
		transcriptRecords: () => records,
	}) satisfies CanvasPaneVoiceRegistration;
}
type PaneFixture = ReturnType<typeof createPaneFixture>;
interface PaneControls {
	readonly publishText: (transport: BrowserWorkbenchTransport | null) => void;
	readonly publishVoice: (registration: CanvasPaneVoiceRegistration | null) => void;
}
const fixtures = new Map<string, PaneFixture>();
const paneControls = new Map<string, PaneControls>();
function createPaneFixture(paneId: string, suffix = paneId) {
	const transport = fakeTransport(suffix);
	const voice = fakeVoiceSession(paneId, suffix);
	return { transport, voice, registration: voiceRegistration(transport, voice) };
}

function fixtureFor(paneId: string): PaneFixture {
	const current = fixtures.get(paneId);
	if (current) return current;
	const created = createPaneFixture(paneId);
	fixtures.set(paneId, created);
	return created;
}

const canvasPaneUrl = new URL("../../canvas/CanvasPane.tsx", import.meta.url).href;
await mock.module(canvasPaneUrl, () => ({
	CanvasPane(props: Record<string, unknown>) {
		const paneId = String(props.paneId);
		const fixture = fixtureFor(paneId);
		const onStatus = props.onStatus as (status: Record<string, unknown>) => void;
		const onAgentState = props.onAgentState as (...args: unknown[]) => void;
		const onWorkbenchTransport = props.onWorkbenchTransport as (
			id: string,
			transport: BrowserWorkbenchTransport | null,
		) => void;
		const onVoiceRegistration = props.onVoiceRegistration as (
			id: string,
			registration: CanvasPaneVoiceRegistration | null,
		) => void;
		useEffect(() => {
			onStatus({
				paneId,
				clientId: `${paneId}-client`,
				connected: true,
				board: null,
				boardKey: null,
				elementCount: 1,
				lastChangeAt: null,
				hold: null,
				writtenElsewhere: null,
				doing: [],
			});
			onAgentState(paneId, null, null, async () => ({ outcome: "success" }));
			onWorkbenchTransport(paneId, fixture.transport.transport);
			onVoiceRegistration(paneId, fixture.registration);
			paneControls.set(paneId, {
				publishText: (transport) => onWorkbenchTransport(paneId, transport),
				publishVoice: (registration) => onVoiceRegistration(paneId, registration),
			});
			return () => {
				paneControls.delete(paneId);
				onVoiceRegistration(paneId, null);
				onWorkbenchTransport(paneId, null);
			};
		}, [fixture, onAgentState, onStatus, onVoiceRegistration, onWorkbenchTransport, paneId]);
		return <section aria-label={String(props.label)} data-canvas-pane={paneId} />;
	},
}));

const frameContract = await import("../../workbench-frame/contract.js");
let latestFrameProps: WorkbenchFrameProps | null = null;
function handlePaneChange(event: React.ChangeEvent<HTMLSelectElement>): void {
	latestFrameProps?.onActivePaneChange(event.currentTarget.value);
}
const workbenchFrameUrl = new URL("../../workbench-frame/index.tsx", import.meta.url).href;
await mock.module(workbenchFrameUrl, () => ({
	captureWorkbenchFrameRequestSource: frameContract.captureWorkbenchFrameRequestSource,
	captureWorkbenchFrameVoiceSource: frameContract.captureWorkbenchFrameVoiceSource,
	WorkbenchFrame(props: WorkbenchFrameProps) {
		latestFrameProps = props;
		const panes = props.view.state === "ready" ? props.view.panes : [];
		return (
			<select aria-label="Workbench pane" onChange={handlePaneChange}>
				{panes.map((pane) => (
					<option key={pane.identity.id} value={pane.identity.id}>
						{pane.identity.label}
					</option>
				))}
			</select>
		);
	},
}));

const outsideFailure = async () => ({ success: false, code: "OUTSIDE", error: "Out." });
const outsideMutation = async () => {
	throw new Error("Mutation is outside this owner.");
};
const apiUrl = new URL("../../canvas/api.ts", import.meta.url).href;
await mock.module(apiUrl, () => ({
	BoardConflictError: class BoardConflictError extends Error {},
	clearBoard: async () => ({ count: 0 }),
	fetchBoardInfo: async () => null,
	fetchBoardPreview: async () => null,
	fetchBoards: async () => ({ vault: "/test-vault", boards: [], open: [], onScreen: [] }),
	fetchLibrary: async () => ({ items: [] }),
	fetchOpenerSettings: outsideFailure,
	newBoard: outsideMutation,
	openBoard: outsideMutation,
	openCodeTarget: outsideFailure,
	putLibrary: async () => ({ success: true }),
	resetOpenerSettings: outsideFailure,
	saveBoard: outsideMutation,
	saveOpenerSettings: outsideFailure,
	testOpenerSettings: outsideFailure,
}));

const { Shell } = await import("../Shell.js");

afterEach(() => {
	cleanup();
	fixtures.clear();
	paneControls.clear();
});
afterAll(unregisterHappyDom);

test("keeps one immutable voice source visible and routes the only fullscreen Stop to it", async () => {
	const restoreFullscreen = installFullscreen();
	const user = userEvent.setup();
	const mounted = render(<Shell />);
	try {
		await screen.findByRole("combobox", { name: "Workbench pane" });
		await user.click(screen.getByRole("button", { name: "Split" }));
		await waitFor(() => expect(paneControls.size).toBe(2));
		const paneA = fixtureFor("pane-1");
		const paneB = fixtureFor("pane-2");
		expect(paneA.transport.listenerCount()).toBe(1);
		await user.click(screen.getByRole("button", { name: "Present Pane A fullscreen" }));
		const dock = await screen.findByRole("toolbar", { name: "Presentation controls" });
		expect(within(dock).getAllByRole("button", { name: "Stop" })).toHaveLength(1);
		expect(within(dock).queryByLabelText("Active voice session")).toBeNull();
		const voiceStatus = dock.querySelectorAll("[data-presentation-voice-status]");
		expect(voiceStatus).toHaveLength(1);
		expect(voiceStatus[0]?.getAttribute("aria-live")).toBe("polite");
		expect(latestFrameProps?.voice?.source.session).toBe(paneA.voice.session);
		await user.click(within(dock).getByRole("button", { name: "Stop" }));
		await waitFor(() => expect(paneA.transport.commands).toHaveLength(1));
		expect(paneA.transport.commands[0]).toMatchObject({
			command: "interrupt",
			turnId: paneA.transport.turnId,
		});
		act(() => paneA.voice.set("unavailable"));
		expect(within(dock).queryByLabelText("Active voice session")).toBeNull();
		expect(latestFrameProps?.voice?.source.session).toBe(paneA.voice.session);
		act(() => paneA.voice.set("requesting_permission", { canStop: false }));
		const stop = within(dock).getByRole("button", { name: "Stop" });
		await waitFor(() => expect(stop.hasAttribute("disabled")).toBeTrue());
		expect(within(dock).getByLabelText("Active voice session").textContent).toContain(
			"requesting permission",
		);
		expect(paneA.transport.commands).toHaveLength(1);
		act(() => paneA.voice.set("listening", { label: "Listening" }));
		await waitFor(() => expect(stop.hasAttribute("disabled")).toBeFalse());
		const voiceSource = within(dock).getByLabelText("Active voice session");
		expect(voiceSource.textContent).toContain("Pane A");
		expect(voiceSource.textContent).toContain("voice-workhorse-pane-1");
		expect(voiceSource.textContent).toContain("voice-coordinator-pane-1");
		expect(voiceSource.textContent).toContain("voice-session-pane-1");
		expect(voiceSource.textContent).toContain("Unmuted");
		expect(latestFrameProps?.voice?.source.session).toBe(paneA.voice.session);
		expect(latestFrameProps?.voice?.source.pane).toEqual({ id: "pane-1", label: "Pane A" });
		expect(Object.isFrozen(latestFrameProps?.voice?.source)).toBeTrue();
		expect(latestFrameProps?.voice?.context.history).toBe(paneA.registration.history);
		expect(latestFrameProps?.voice?.transcript.records).toBe(
			paneA.registration.transcriptRecords(),
		);
		await user.click(stop);
		await waitFor(() => expect(paneA.voice.stops()).toBe(1));
		expect(paneA.transport.commands).toHaveLength(1);
		act(() => paneA.voice.loseMedia());
		await waitFor(() => expect(stop.hasAttribute("disabled")).toBeTrue());
		expect(voiceSource.textContent).toContain("voice-session-pane-1");
		expect(voiceSource.textContent).toContain("unavailable");
		expect(voiceSource.textContent).toContain("Unknown");
		expect(latestFrameProps?.voice?.source.session).toBe(paneA.voice.session);
		await user.click(stop);
		expect([paneA.voice.stops(), paneA.transport.commands.length]).toEqual([1, 1]);
		act(() => paneA.voice.set("stopping", { label: "Stopping", canStop: false }));
		expect(voiceSource.textContent).toContain("voice-session-pane-1");
		expect(voiceSource.textContent).toContain("Unknown");
		expect(stop.hasAttribute("disabled")).toBeTrue();
		act(() => paneA.voice.set("failed", { label: "Outcome unknown", canStop: false }));
		const outcomeView = paneA.voice.session.view();
		expect([outcomeView.outcome.kind, outcomeView.controls.canStop]).toEqual(["terminal", false]);
		expect(within(dock).getByLabelText("Active voice session").textContent).toContain(
			"Outcome unknown",
		);
		expect(voiceSource.textContent).toContain("voice-session-pane-1");
		expect(voiceSource.textContent).toContain("Unknown");
		expect(stop.hasAttribute("disabled")).toBeTrue();
		expect(voiceStatus[0]?.getAttribute("aria-live")).toBe("assertive");
		expect(voiceStatus[0]?.getAttribute("role")).toBe("alert");
		expect(voiceStatus[0]?.textContent).toBe("Voice failed.");
		await user.click(stop);
		expect([paneA.voice.stops(), paneA.transport.commands.length]).toEqual([1, 1]);
		act(() => paneA.voice.set("failed", { label: "Replaced", canStop: false, replaced: true }));
		await waitFor(() => expect(latestFrameProps?.voice).toBeNull());
		expect(within(dock).queryByLabelText("Active voice session")).toBeNull();
		const replacement = createPaneFixture("pane-1", "replacement");
		act(() => {
			paneControls.get("pane-1")?.publishVoice(null);
			paneControls.get("pane-1")?.publishVoice(replacement.registration);
			replacement.voice.set("listening", { label: "Listening" });
		});
		await waitFor(() =>
			expect(within(dock).getByLabelText("Active voice session").textContent).toContain(
				"voice-session-replacement",
			),
		);
		await user.selectOptions(screen.getByRole("combobox", { name: "Workbench pane" }), "pane-2");
		await waitFor(() =>
			expect(
				within(dock).getByRole("button", { name: "Present Pane B" }).getAttribute("aria-pressed"),
			).toBe("true"),
		);
		expect(within(dock).getByLabelText("Active text workbench").textContent).toContain(
			"thread-pane-2",
		);
		expect(within(dock).getByLabelText("Active voice session").textContent).toContain("Pane A");
		expect(latestFrameProps?.voice?.source.session).toBe(replacement.voice.session);

		act(() => {
			paneControls.get("pane-1")?.publishText(null);
			paneControls.get("pane-2")?.publishText(null);
		});
		expect(within(dock).getByLabelText("Active text workbench").textContent).toContain(
			"No active pane",
		);
		expect(within(dock).getByLabelText("Active voice session")).toBeTruthy();
		const frameBeforeVoiceTransportPublication = latestFrameProps;
		act(() => replacement.transport.publish());
		expect(latestFrameProps).not.toBe(frameBeforeVoiceTransportPublication);
		act(() => paneB.voice.set("listening", { label: "Listening" }));
		await waitFor(() =>
			expect(within(dock).getByLabelText("Active voice session conflict")).toBeTruthy(),
		);
		expect(voiceStatus[0]?.textContent).toContain("More than one active voice source");
		expect(within(dock).queryByRole("alert")).toBeNull();
		expect(latestFrameProps?.voice).toBeNull();
		expect(stop.hasAttribute("disabled")).toBeTrue();
		expect([replacement.voice.stops(), paneB.voice.stops()]).toEqual([0, 0]);
		act(() => paneB.voice.set("stopped", { label: "Stopped" }));
		await waitFor(() =>
			expect(latestFrameProps?.voice?.source.session).toBe(replacement.voice.session),
		);
		await user.click(stop);
		await waitFor(() => expect(replacement.voice.stops()).toBe(1));
		expect(paneA.voice.stops()).toBe(1);
		act(() => replacement.voice.set("stopped", { label: "Stopped" }));
		await waitFor(() => expect(latestFrameProps?.voice).toBeNull());
		expect(within(dock).queryByLabelText("Active voice session")).toBeNull();
		expect(stop.hasAttribute("disabled")).toBeTrue();
		act(() => paneB.voice.set("listening", { label: "Listening" }));
		await waitFor(() => expect(latestFrameProps?.voice?.source.session).toBe(paneB.voice.session));
		await user.click(within(dock).getByRole("button", { name: "Exit" }));
		await user.click(screen.getByRole("button", { name: "Unsplit" }));
		await waitFor(() => expect(paneControls.has("pane-2")).toBeFalse());
		expect(latestFrameProps?.voice).toBeNull();
		mounted.unmount();
		expect(paneControls.size).toBe(0);
	} finally {
		restoreFullscreen();
	}
});

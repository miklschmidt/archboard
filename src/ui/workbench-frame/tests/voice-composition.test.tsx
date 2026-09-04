import { afterAll, afterEach, expect, test } from "bun:test";

import type { BrowserSpokenApproval } from "../../../shared/codex-browser-model/index.js";
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
import type {
	WorkbenchFrameDisclosure,
	WorkbenchFrameSpace,
	WorkbenchFrameView,
	WorkbenchFrameVoiceSlot,
} from "../index.js";

registerHappyDom();
const { act, cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();
const { WorkbenchFrame, captureWorkbenchFrameRequestSource, captureWorkbenchFrameVoiceSource } =
	await import("../index.js");
const { TEST_NOW, framePane, mutableRequestFrame, requestTransport, stoppedTransport } =
	await import("./support.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

const PANE_A = { id: "pane-a", label: "Pane A" } as const;
const PANE_B = { id: "pane-b", label: "Pane B" } as const;
const EMPTY_REQUEST = { state: "empty", detail: "No request needs a response." } as const;
const PANE_A_PORT = framePane(PANE_A, stoppedTransport(PANE_A.id));
const PANE_B_PORT = framePane(PANE_B, stoppedTransport(PANE_B.id));
const ONE_PANE_VIEW = { state: "ready", panes: [PANE_A_PORT], activePaneId: PANE_A.id } as const;
const TWO_PANE_B_VIEW = {
	state: "ready",
	panes: [PANE_A_PORT, PANE_B_PORT],
	activePaneId: PANE_B.id,
} as const;

type VoiceCommand = "start" | "mute" | "unmute" | "stop" | "restart" | "close";

interface VoiceSessionFake {
	readonly session: VoiceSession;
	readonly calls: VoiceCommand[];
	readonly setView: (view: VoiceSessionView) => void;
}

function voiceView(
	status: VoiceSessionStatus,
	failure: "retryable" | "terminal" = "retryable",
): VoiceSessionView {
	const running = status !== "ready" && status !== "stopped" && status !== "failed";
	const failed = status === "failed";
	const outcome: VoiceSessionView["outcome"] = failed
		? failure === "terminal"
			? {
					kind: "terminal",
					label: "Voice ended",
					recovery: "Close this session before starting another.",
				}
			: {
					kind: "retry",
					control: "restart",
					label: "Restart voice",
					recovery: "Restart the existing voice session.",
				}
		: { kind: "none" };
	return Object.freeze({
		status,
		label: status.replaceAll("_", " "),
		detail: `Voice is ${status.replaceAll("_", " ")}.`,
		accessibleStatus: `Live voice is ${status.replaceAll("_", " ")}.`,
		failure: failed
			? {
					code: "realtime" as const,
					recoverable: failure === "retryable",
					message: "The realtime voice connection failed.",
				}
			: null,
		outcome,
		controls: {
			canStart: status === "ready",
			canMute: status === "listening",
			canUnmute: status === "muted",
			canStop: running && status !== "stopping",
			canRestart: failed && failure === "retryable",
			canClose: failed && failure === "terminal",
		},
		binding: running
			? {
					paneId: PANE_A.id,
					childId: "child-a",
					epoch: "epoch-a",
					workhorseThreadId: "thread-a",
					coordinatorThreadId: "coordinator-a",
				}
			: null,
		sessionId: running ? "realtime-a" : null,
	});
}

function createSessionFake(initial: VoiceSessionView): VoiceSessionFake {
	let current = initial;
	const calls: VoiceCommand[] = [];
	const listeners = new Set<() => void>();
	const levels = new Set<() => void>();
	const run = async (command: VoiceCommand): Promise<VoiceSessionView> => {
		calls.push(command);
		return current;
	};
	const session: VoiceSession = {
		view: () => current,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		level: () => 0.4,
		subscribeLevel: (listener) => {
			levels.add(listener);
			return () => levels.delete(listener);
		},
		refresh: () => current,
		start: () => run("start"),
		mute: () => run("mute"),
		unmute: () => run("unmute"),
		stop: () => run("stop"),
		restart: () => run("restart"),
		close: () => run("close"),
		dispose: () => undefined,
	};
	return {
		session,
		calls,
		setView: (view) => {
			current = view;
			for (const listener of listeners) listener();
		},
	};
}

function voiceSlot(fake: VoiceSessionFake): WorkbenchFrameVoiceSlot {
	return {
		source: captureWorkbenchFrameVoiceSource(PANE_A_PORT, fake.session),
		context: { history: createVoiceContextHistory() },
		transcript: { records: Object.freeze([]) },
	};
}

function noop(): void {}

function frame(
	voice: WorkbenchFrameVoiceSlot | null,
	view: WorkbenchFrameView = ONE_PANE_VIEW,
	disclosure: WorkbenchFrameDisclosure = "expanded",
	space: WorkbenchFrameSpace = "workspace",
) {
	return (
		<WorkbenchFrame
			disclosure={disclosure}
			onActivePaneChange={noop}
			onDisclosureChange={noop}
			request={EMPTY_REQUEST}
			space={space}
			view={view}
			voice={voice}
		/>
	);
}

test("keeps caller-owned voice beside the canonical text workbench", () => {
	const slot = voiceSlot(createSessionFake(voiceView("ready")));
	render(frame(slot));

	const voice = screen.getByRole("region", { name: "Pane A live voice" });
	const transcriptLog = within(voice).getByRole("log", { name: "Voice transcript" });
	const workhorse = screen.getByRole("region", { name: "Pane A workhorse" });
	expect(voice.className).toContain("max-h-1/2");
	expect(voice.getAttribute("data-workbench-voice-source-pane")).toBe(PANE_A.id);
	expect(
		within(voice).getByText(PANE_A.label).getAttribute("data-workbench-voice-source-label"),
	).toBe("");
	expect(within(voice).getByRole("region", { name: "Live voice" })).toBeTruthy();
	expect(within(voice).getByRole("region", { name: "Voice transcript" })).toBeTruthy();
	expect(within(voice).getByRole("region", { name: "Voice context" })).toBeTruthy();
	expect(within(voice).getByText("No workhorse thread is bound before Start.")).toBeTruthy();
	expect(transcriptLog.getAttribute("tabindex")).toBe("0");
	expect(voice.compareDocumentPosition(workhorse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getByRole("log", { name: "Workhorse activity" })).toBeTruthy();
	expect(screen.getByRole("complementary", { name: "Pane A workbench operations" })).toBeTruthy();
	expect(screen.getByRole("region", { name: "Board claim and doing" })).toBeTruthy();
	expect(document.querySelector('[data-workbench-queue=""]')).toBeTruthy();
	expect(document.querySelector('[data-thread-link-pane="pane-a"]')).toBeTruthy();
	expect(document.querySelector('[data-coordinator-disclosure="read-only"]')).toBeTruthy();
	expect(document.querySelector("[data-workbench-composer]")).toBeTruthy();
	expect(screen.getByRole("region", { name: "Application-wide Codex requests" })).toBeTruthy();
	expect(screen.getByRole("button", { name: /Stop voice on/ })).toBeTruthy();
});

test("routes controls only through the supplied voice-session adapter", async () => {
	const fake = createSessionFake(voiceView("ready"));
	const user = userEvent.setup();
	render(frame(voiceSlot(fake)));

	await user.click(screen.getByRole("button", { name: /Start voice on/ }));
	await waitFor(() => expect(fake.calls).toEqual(["start"]));
	act(() => fake.setView(voiceView("listening")));
	await user.click(screen.getByRole("button", { name: /Stop voice on/ }));
	await waitFor(() => expect(fake.calls).toEqual(["start", "stop"]));
});

test("projects reachable session states without taking announcement ownership from controls", () => {
	const cases: readonly {
		readonly status: VoiceSessionStatus;
		readonly controlState: string;
		readonly failure?: "retryable" | "terminal";
	}[] = [
		{ status: "ready", controlState: "ready" },
		{ status: "requesting_permission", controlState: "requesting_permission" },
		{ status: "listening", controlState: "listening" },
		{ status: "recovering", controlState: "recovering" },
		{ status: "stopping", controlState: "stopping" },
		{ status: "failed", controlState: "retryable_failure", failure: "retryable" },
		{ status: "failed", controlState: "terminal_failure", failure: "terminal" },
	];
	for (const { status, controlState, failure = "retryable" } of cases) {
		const result = render(frame(voiceSlot(createSessionFake(voiceView(status, failure)))));
		expect(
			document.querySelector('[data-voice-controls=""]')?.getAttribute("data-voice-state"),
		).toBe(controlState);
		expect(
			document
				.querySelector('[data-transcript-status-output=""]')
				?.getAttribute("data-transcript-announcement-owner"),
		).toBe("external");
		expect(
			document.querySelector('[data-transcript-status-output=""]')?.hasAttribute("aria-live"),
		).toBe(false);
		expect(document.querySelectorAll('[data-voice-announcer=""]')).toHaveLength(1);
		result.unmount();
	}
});

test("keeps the captured source immutable across pane focus and frame failure", () => {
	const fake = createSessionFake(voiceView("listening"));
	const mutableIdentity: { id: string; label: string } = { id: PANE_A.id, label: PANE_A.label };
	const source = captureWorkbenchFrameVoiceSource({ identity: mutableIdentity }, fake.session);
	mutableIdentity.label = "Changed outside the frame";
	const slot = { ...voiceSlot(fake), source };
	const result = render(frame(slot));

	expect(Object.isFrozen(source)).toBe(true);
	expect(Object.isFrozen(source.pane)).toBe(true);
	expect(document.querySelector('[data-workbench-voice-source-label=""]')?.textContent).toBe(
		PANE_A.label,
	);
	expect(
		[...document.querySelectorAll('[data-workbench-voice-source-thread=""]')].every(
			(node) => node.textContent === "thread-a",
		),
	).toBe(true);

	result.rerender(frame(slot, TWO_PANE_B_VIEW));
	expect(screen.getByRole("region", { name: "Pane B workhorse" })).toBeTruthy();
	expect(document.querySelector('[data-workbench-voice-source-summary=""]')?.textContent).toContain(
		"thread-a",
	);
	result.rerender(
		frame(slot, {
			state: "error",
			detail: "The frame projection failed.",
			recovery: "Reconnect the frame.",
		}),
	);
	expect(screen.getByRole("region", { name: "Pane A live voice" })).toBeTruthy();
	expect(screen.getByRole("alert").textContent).toContain("The frame projection failed.");
	expect(document.querySelector('[data-workbench-voice-source-summary=""]')?.textContent).toContain(
		"thread-a",
	);

	result.rerender(frame(slot, TWO_PANE_B_VIEW, "collapsed"));
	expect(document.querySelector('[data-workbench-voice="present"]')).toBeNull();
	expect(document.querySelector('[data-workbench-voice-source-summary=""]')?.textContent).toContain(
		"thread-a",
	);
	result.rerender(frame(slot, TWO_PANE_B_VIEW, "expanded", "fullscreen"));
	expect(document.querySelector('[data-workbench-voice="present"]')).toBeNull();
	expect(document.querySelector('[data-workbench-voice-source-summary=""]')?.textContent).toContain(
		"thread-a",
	);

	result.rerender(frame(slot, TWO_PANE_B_VIEW));
	const mismatched = voiceView("listening");
	act(() =>
		fake.setView({
			...mismatched,
			binding: { ...mismatched.binding!, paneId: PANE_B.id },
		}),
	);
	expect(screen.getByRole("alert", { name: "Live voice availability" }).textContent).toContain(
		"The voice session is bound to pane pane-b, not source pane pane-a.",
	);
	expect(document.querySelector('[data-workbench-voice-source-mismatch=""]')).toBeTruthy();
	expect(document.querySelector('[data-workbench-voice-source-thread=""]')).toBeNull();
});

test("links transcript evidence only to its mounted captured pane", () => {
	const requestFrame = mutableRequestFrame(PANE_A, () => TEST_NOW);
	const panes = [requestFrame.view.panes[0], PANE_B_PORT] as const;
	const slot = voiceSlot(createSessionFake(voiceView("listening")));
	const renderFrame = (view: WorkbenchFrameView) => (
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noop}
			onDisclosureChange={noop}
			request={requestFrame.request}
			space="workspace"
			view={view}
			voice={slot}
		/>
	);
	const result = render(renderFrame({ state: "ready", panes, activePaneId: PANE_A.id }));
	const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-transcript-cross-link]")];
	expect(links).toHaveLength(6);
	for (const link of links) {
		const target = document.getElementById(link.hash.slice(1));
		expect(target?.dataset.workbenchTargetPane).toBe(PANE_A.id);
	}
	result.rerender(renderFrame({ state: "ready", panes, activePaneId: PANE_B.id }));
	expect(document.querySelectorAll("[data-transcript-cross-link]")).toHaveLength(0);
	expect(
		screen.getByRole("region", { name: "Voice transcript relationships" }).textContent,
	).toContain("Pane A's workbench is not mounted");
	expect(document.querySelectorAll('[data-workbench-target-pane="pane-b"]')).toHaveLength(3);

	result.rerender(
		renderFrame({
			state: "error",
			detail: "The frame projection failed.",
			recovery: "Reconnect the frame.",
		}),
	);
	expect(document.querySelectorAll("[data-transcript-cross-link]")).toHaveLength(0);
	expect(document.querySelector('[data-workbench-voice-relationships="unavailable"]')).toBeTruthy();
});

function armSpokenApproval(fake: ReturnType<typeof requestTransport>): void {
	const state = fake.transport.state();
	if (state.kind !== "readiness") throw new Error("The request fixture must be ready.");
	const approval = state.snapshot.approvals[0];
	const realtimeSessionId = state.snapshot.voice.realtimeSessionId;
	const coordinatorThreadId = state.snapshot.coordinator.threadId;
	if (approval === undefined || realtimeSessionId === null || coordinatorThreadId === null) {
		throw new Error("The request fixture needs approval, realtime, and coordinator identities.");
	}
	type SpokenGate = NonNullable<BrowserSpokenApproval["gate"]>;
	const spokenApproval: BrowserSpokenApproval = {
		kind: "spoken_approval",
		state: "armed",
		approval: {
			requestId: approval.requestId,
			approvalId: approval.approvalId,
			threadId: approval.threadId,
			binding: {
				child: approval.binding.child,
				epoch: approval.binding.epoch,
				target: approval.binding.target,
				effect: approval.binding.effect,
			},
		},
		gate: {
			coordinatorThreadId,
			realtimeSessionId,
			effectSummary: approval.binding.effect,
			effectFingerprint: approval.binding.effect,
			effectPrompt: {
				itemId: "frame-effect-prompt" as SpokenGate["effectPrompt"]["itemId"],
				sequence: 8,
			},
			expiresAtMs: TEST_NOW + 30_000,
		},
		capturedUserFinal: null,
		settlement: null,
		reason: null,
	};
	fake.setState({
		...state,
		snapshot: { ...state.snapshot, spokenApproval },
	});
}

test("places spoken evidence immediately above the unchanged ordinary approval owner", async () => {
	const requestFrame = mutableRequestFrame(PANE_A, () => TEST_NOW);
	armSpokenApproval(requestFrame.fake);
	const fakeVoice = createSessionFake(voiceView("listening"));
	const user = userEvent.setup();
	const result = render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noop}
			onDisclosureChange={noop}
			request={requestFrame.request}
			space="workspace"
			view={requestFrame.view}
			voice={voiceSlot(fakeVoice)}
		/>,
	);

	const spoken = screen.getByRole("region", { name: "Voice evidence" });
	const approvals = document.querySelector('[data-workbench-approvals="surface"]');
	const appGlobal = screen.getByRole("region", { name: "Application-wide Codex requests" });
	const transcriptLinks = [
		...document.querySelectorAll<HTMLAnchorElement>("[data-transcript-cross-link]"),
	];
	expect(approvals).toBeTruthy();
	expect(spoken.nextElementSibling).toBe(approvals);
	expect(spoken.querySelector("button, input, select, textarea, form")).toBeNull();
	expect(transcriptLinks).toHaveLength(6);
	for (const link of transcriptLinks) {
		expect(document.getElementById(link.hash.slice(1))).toBeTruthy();
	}
	expect(
		transcriptLinks.find((link) => link.dataset.transcriptCrossLink === "approval")?.hash,
	).toBe(`#${appGlobal.id}`);
	expect(within(appGlobal).getByText(PANE_A.label).tagName).toBe("DD");
	await user.click(within(approvals as HTMLElement).getByRole("button", { name: "Approve" }));
	await waitFor(() => expect(requestFrame.fake.commands).toHaveLength(1));
	expect(requestFrame.fake.commands[0]?.draft.command).toBe("approvalRespond");
	const paneBRequest = mutableRequestFrame(PANE_B, () => TEST_NOW);
	armSpokenApproval(paneBRequest.fake);
	result.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noop}
			onDisclosureChange={noop}
			request={paneBRequest.request}
			space="workspace"
			view={TWO_PANE_B_VIEW}
			voice={voiceSlot(fakeVoice)}
		/>,
	);
	expect(screen.queryByRole("region", { name: "Voice evidence" })).toBeNull();
	expect(
		within(screen.getByRole("region", { name: "Application-wide Codex requests" })).getByText(
			PANE_B.label,
		),
	).toBeTruthy();
	expect(document.querySelector('[data-workbench-approvals="surface"]')).toBeTruthy();
});

function expectTextOnlyFrame(): void {
	expect(document.querySelector("[data-workbench-voice]")).toBeNull();
	expect(document.querySelector('[data-voice-controls=""]')).toBeNull();
	expect(document.querySelector('[data-voice-transcript=""]')).toBeNull();
	expect(document.querySelector('[data-voice-context=""]')).toBeNull();
	expect(document.querySelector("[data-spoken-approval]")).toBeNull();
	expect(document.querySelector('[data-workbench-voice-source-summary=""]')).toBeNull();
	expect(screen.getByRole("region", { name: "Pane A workhorse" })).toBeTruthy();
	expect(screen.getByRole("complementary", { name: "Pane A workbench operations" })).toBeTruthy();
	expect(document.querySelector('[data-workbench-queue=""]')).toBeTruthy();
	expect(document.querySelector("[data-workbench-composer]")).toBeTruthy();
}

test("restores the text-only frame after authoritative stop and caller withdrawal", () => {
	const fake = createSessionFake(voiceView("listening"));
	const slot = voiceSlot(fake);
	const result = render(frame(slot));
	expect(document.querySelector('[data-workbench-voice="present"]')).toBeTruthy();
	act(() => fake.setView(voiceView("stopped")));
	expectTextOnlyFrame();
	result.unmount();
	const withdrawal = render(frame(voiceSlot(createSessionFake(voiceView("listening")))));
	expect(document.querySelector('[data-workbench-voice="present"]')).toBeTruthy();
	withdrawal.rerender(frame(null));
	expectTextOnlyFrame();
});

test("keeps the source capture paired with its public session", () => {
	const pane = framePane(PANE_A, stoppedTransport(PANE_A.id));
	const voice = createSessionFake(voiceView("ready"));
	const source = captureWorkbenchFrameVoiceSource(pane, voice.session);
	const requestSource = captureWorkbenchFrameRequestSource(
		framePane(PANE_A, requestTransport(PANE_A.id)),
		() => TEST_NOW,
	);
	expect(source.pane).toEqual(PANE_A);
	expect(source.session).toBe(voice.session);
	expect(requestSource.pane).toEqual(PANE_A);
});

test("keeps composition free of a second voice or transcript owner", async () => {
	const source = await Bun.file(new URL("../lib/VoiceComposition.tsx", import.meta.url)).text();
	expect(source).not.toMatch(
		/createVoiceSession|createVoiceContextHistory|createRealtimeMediaSession|useReducer|useState/,
	);
});

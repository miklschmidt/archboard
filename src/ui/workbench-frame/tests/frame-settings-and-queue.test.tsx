import { afterAll, afterEach, expect, test } from "bun:test";
import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { act, cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();
const { WorkbenchFrame, captureWorkbenchFrameVoiceSource } = await import("../index.js");
const {
	TEST_NOW,
	mutableRequestFrame,
	framePane,
	onePaneView,
	requestTransport,
	stoppedTransport,
} = await import("./support.js");

const { createVoiceContextHistory } = await import("../../voice-context/index.js");
const { createSessionFake, voiceView, transcriptRecord } = await import("./voice-support.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

const PANE_A = { id: "pane-a", label: "Pane A" } as const;
const EMPTY_REQUEST = { state: "empty", detail: "No request needs a response." } as const;
const ONE_PANE_VIEW = onePaneView(framePane(PANE_A, stoppedTransport(PANE_A.id)));
function noopPane(): void {}
function noopDisclosure(): void {}

test("keeps thread configuration in a closed Settings dialog until requested", () => {
	render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>,
	);
	expect(document.querySelector("[data-workbench-settings]")).toBeNull();
	const settings = screen.getByRole("button", { name: "Settings" });
	act(() => settings.click());
	const dialog = document.querySelector("[data-workbench-settings]");
	expect(dialog?.getAttribute("role")).toBe("dialog");
	expect(dialog?.querySelector('[data-thread-link-pane="pane-a"]')).not.toBeNull();
	const close = dialog?.querySelector<HTMLButtonElement>('[aria-label="Close agent settings"]');
	if (!close) throw new Error("Settings needs a close control.");
	act(() => close.click());
	expect(dialog?.hasAttribute("data-ending-style")).toBe(true);
});

test("keeps adding the first queued request reachable from the conversation", async () => {
	const user = userEvent.setup();
	const fake = requestTransport(PANE_A.id);
	const state = fake.transport.state();
	if (state.kind !== "readiness") throw new Error("The queue fixture needs a ready transport.");
	fake.setState({
		...state,
		snapshot: {
			...state.snapshot,
			queue: { kind: "queue", status: "empty", entries: [] },
			approvals: [],
		},
	});
	const view = onePaneView(framePane(PANE_A, fake));
	render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={view}
		/>,
	);
	const disclosure = document.querySelector<HTMLDetailsElement>(
		"[data-workbench-queue-disclosure]",
	);
	if (disclosure === null) throw new Error("A linked conversation needs a queue disclosure.");
	expect(disclosure.open).toBe(false);
	await user.click(within(disclosure).getByText("Add a request"));
	expect(disclosure.open).toBe(true);
	await user.type(within(disclosure).getByRole("textbox"), "Draw the retry path next");
	await user.click(within(disclosure).getByRole("button", { name: /^Add$/ }));
	await waitFor(() => expect(fake.commands).toHaveLength(1));
	expect(fake.commands[0]?.draft).toEqual({
		command: "queueAdd",
		prompt: "Draw the retry path next",
	});
	expect(fake.commands[0]?.target?.paneId).toBe(PANE_A.id);
});
function linkedVoiceSlot() {
	return {
		source: captureWorkbenchFrameVoiceSource(
			{ identity: PANE_A },
			createSessionFake(voiceView("listening")).session,
		),
		context: { history: createVoiceContextHistory() },
		transcript: { records: [transcriptRecord()] },
	};
}

test("opens the queue and coordinator destinations from transcript links", async () => {
	const requestFrame = mutableRequestFrame(PANE_A, () => TEST_NOW);
	const slot = linkedVoiceSlot();
	render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={requestFrame.view}
			voice={slot}
		/>,
	);
	const queue = document.querySelector<HTMLDetailsElement>("[data-workbench-queue-disclosure]");
	const queueLink = document.querySelector<HTMLAnchorElement>(
		'[data-transcript-cross-link="queue"]',
	);
	const coordinatorLink = document.querySelector<HTMLAnchorElement>(
		'[data-transcript-cross-link="delegation"]',
	);
	if (!queue || !queueLink || !coordinatorLink)
		throw new Error("The linked transcript needs queue and coordinator destinations.");
	expect(queue.open).toBe(false);
	act(() => queueLink.click());
	expect(queue.open).toBe(true);
	expect(document.activeElement === queue.querySelector("summary")).toBe(true);
	await act(async () => coordinatorLink.click());
	const dialog = document.querySelector("[data-workbench-settings]");
	expect(dialog?.getAttribute("role")).toBe("dialog");
	const coordinator = dialog?.querySelector<HTMLDetailsElement>("details");
	expect(coordinator?.open).toBe(true);
	expect(coordinator?.id).toBe(coordinatorLink.hash.slice(1));
});

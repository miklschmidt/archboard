import { afterAll, afterEach, expect, test } from "bun:test";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { act, cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();
const { WorkbenchFrame, captureWorkbenchFrameRequestSource } = await import("../index.js");
const {
	TEST_NOW,
	FRAME_ROOT_THEME_CLASSES,
	LONG_EMPTY_REQUEST,
	REQUEST_PROJECTION_CASES,
	WORKBENCH_PROJECTION_CASES,
	claimedFramePane,
	framePane,
	mutableRequestFrame,
	onePaneView,
	requestTransport,
	retainedSnapshotTransport,
	retargetRequestTransportLease,
	stoppedTransport,
} = await import("./support.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

const fixedNow = (): number => TEST_NOW;
const PANE_A = { id: "pane-a", label: "Pane A" } as const;
const PANE_B = { id: "pane-b", label: "Pane B" } as const;
const EMPTY_REQUEST = { state: "empty", detail: "No request needs a response." } as const;
const PANE_A_TRANSPORT = stoppedTransport(PANE_A.id);
const PANE_A_PORT = framePane(PANE_A, PANE_A_TRANSPORT);
const PANE_B_PORT = framePane(PANE_B, stoppedTransport(PANE_B.id));
const PANE_B_REQUEST_TRANSPORT = requestTransport(PANE_B.id);
const PANE_B_REQUEST_PORT = framePane(PANE_B, PANE_B_REQUEST_TRANSPORT);
const PANE_B_COMPACT_PORT = claimedFramePane(PANE_B, PANE_B_REQUEST_TRANSPORT);
const ONE_PANE_VIEW = { state: "ready", panes: [PANE_A_PORT], activePaneId: PANE_A.id } as const;
const TWO_PANE_A_VIEW = {
	state: "ready",
	panes: [PANE_A_PORT, PANE_B_PORT],
	activePaneId: PANE_A.id,
} as const;
const TWO_PANE_B_VIEW = { ...TWO_PANE_A_VIEW, activePaneId: PANE_B.id } as const;
const REQUEST_VIEW_A = {
	state: "ready",
	panes: [PANE_A_PORT, PANE_B_REQUEST_PORT],
	activePaneId: PANE_A.id,
} as const;
const REQUEST_VIEW_B = { ...REQUEST_VIEW_A, activePaneId: PANE_B.id } as const;
const COMPACT_TWO_PANE_B_VIEW = {
	state: "ready",
	panes: [PANE_A_PORT, PANE_B_COMPACT_PORT],
	activePaneId: PANE_B.id,
} as const;
const PRESENT_REQUEST = {
	state: "present",
	source: captureWorkbenchFrameRequestSource(PANE_B_REQUEST_PORT, fixedNow),
} as const;
const FORGED_REQUEST = {
	state: "present",
	source: { ...PRESENT_REQUEST.source, pane: PANE_A },
} as const;
const RELABELED_REQUEST = {
	state: "present",
	source: { ...PRESENT_REQUEST.source, pane: { id: PANE_B.id, label: "Relabeled Pane B" } },
} as const;
const LOADING_VIEW = { state: "loading", detail: "Loading the workbench." } as const;
const selectedPaneIds: string[] = [];
function noop(): void {}
const noopPane = noop;
const noopDisclosure = noop;
function capturePane(paneId: string): void {
	selectedPaneIds.push(paneId);
}

test("composes one pane as one conversation with configuration outside the drawer", () => {
	render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={LONG_EMPTY_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>,
	);

	const frame = screen.getByRole("region", { name: "Agent" });
	expect(frame.getAttribute("data-pane-count")).toBe("1");
	for (const className of FRAME_ROOT_THEME_CLASSES.split(" ")) {
		expect(frame.className).toContain(className);
	}

	expect(screen.queryByRole("navigation", { name: "Workbench panes" })).toBeNull();
	expect(frame.textContent).toContain(PANE_A.label);
	expect(screen.getByRole("button", { name: "Settings" }).className).toContain(
		"min-h-touch-target",
	);
	expect(screen.getByRole("button", { name: "Collapse" }).className).toContain(
		"min-h-touch-target",
	);

	expect(screen.getByRole("region", { name: "Pane A agent conversation" })).toBeTruthy();
	expect(screen.queryByRole("region", { name: "Pane A board activity" })).toBeNull();
	expect(document.querySelector('[data-workbench-queue-disclosure=""]')).toBeNull();
	expect(document.querySelector('[data-thread-link-pane="pane-a"]')).toBeNull();
	expect(document.querySelector('[data-coordinator-disclosure="read-only"]')).toBeNull();
	const workArea = document.querySelector('[data-workbench-work-area=""]');
	expect(workArea?.className).toContain("min-h-0");
	expect(workArea?.className).toContain("flex-1");
	expect(screen.queryByRole("region", { name: "Application-wide Codex requests" })).toBeNull();
	const headings = screen.getAllByRole("heading");
	const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
	expect(headings[0]?.textContent).toBe("Agent activity");
	expect(levels.filter((level) => level === 1)).toHaveLength(1);
	for (let index = 1; index < levels.length; index += 1)
		expect(levels[index]!).toBeLessThanOrEqual(levels[index - 1]! + 1);

	const order = [...document.querySelectorAll("[data-workbench-region]")].map((node) =>
		node.getAttribute("data-workbench-region"),
	);
	expect(order).toEqual(["conversation"]);
});

test("keeps two-pane selection controlled and presents exact pane labels", async () => {
	const user = userEvent.setup();
	selectedPaneIds.length = 0;
	const view = render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={capturePane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={TWO_PANE_A_VIEW}
		/>,
	);

	const frame = screen.getByRole("region", { name: "Agent" });
	expect(frame.getAttribute("data-pane-count")).toBe("2");
	const paneAControl = screen.getByRole("button", { name: PANE_A.label });
	const paneBControl = screen.getByRole("button", { name: PANE_B.label });
	expect(paneAControl.getAttribute("aria-pressed")).toBe("true");
	expect(paneBControl.getAttribute("aria-pressed")).toBe("false");

	await user.click(paneBControl);
	expect(selectedPaneIds).toEqual([PANE_B.id]);
	expect(paneAControl.getAttribute("aria-pressed")).toBe("true");

	view.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={capturePane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={TWO_PANE_B_VIEW}
		/>,
	);
	expect(screen.getByRole("button", { name: PANE_B.label }).getAttribute("aria-pressed")).toBe(
		"true",
	);
	expect(screen.getByRole("region", { name: "Pane B agent conversation" })).toBeTruthy();
});

test("preserves the active hierarchy in collapsed and fullscreen compact projections", async () => {
	const user = userEvent.setup();
	const view = render(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={COMPACT_TWO_PANE_B_VIEW}
		/>,
	);

	const frame = screen.getByRole("region", { name: "Agent" });
	expect(frame.getAttribute("data-pane-count")).toBe("2");
	expect(screen.getByRole("button", { name: PANE_B.label }).getAttribute("aria-pressed")).toBe(
		"true",
	);
	let compact = screen.getByRole("region", { name: "Pane B compact agent status" });
	expect(
		within(compact).getByLabelText("Active board claim: Refactoring frame hierarchy"),
	).toBeTruthy();
	expect(
		within(compact).getByLabelText("Current agent action: Preserving compact hierarchy"),
	).toBeTruthy();
	expect(within(compact).getByRole("button", { name: "Take back control" })).toBeTruthy();
	expect(compact.querySelector("dl")).toBeNull();
	await user.tab();
	expect(document.activeElement).toBe(screen.getByRole("button", { name: PANE_A.label }));

	view.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="fullscreen"
			view={COMPACT_TWO_PANE_B_VIEW}
		/>,
	);
	compact = screen.getByRole("region", { name: "Pane B compact agent status" });
	expect(compact.getAttribute("data-workbench-content")).toBe("compact");
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
});

test("prioritizes interrupted transport state over retained workhorse status", () => {
	for (const [state, label] of [
		["reconnecting", "Reconnecting"],
		["backoff", "Backoff"],
		["stale_snapshot", "Stale snapshot"],
	] as const) {
		const pane = framePane(PANE_A, retainedSnapshotTransport(PANE_A.id, state));
		const paneView = onePaneView(pane);
		const result = render(
			<WorkbenchFrame
				disclosure="collapsed"
				onActivePaneChange={noopPane}
				onDisclosureChange={noopDisclosure}
				request={EMPTY_REQUEST}
				space="workspace"
				view={paneView}
			/>,
		);
		const fact = document.querySelector("[data-workbench-connection-state]");
		expect(fact?.getAttribute("data-workbench-connection-state")).toBe(state);
		expect(fact?.textContent).toContain(label);
		result.unmount();
	}
});

test("tabs through pane choice and disclosure before the workhorse log", async () => {
	const user = userEvent.setup();
	render(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={TWO_PANE_A_VIEW}
		/>,
	);

	for (const expected of [
		screen.getByRole("button", { name: PANE_A.label }),
		screen.getByRole("button", { name: PANE_B.label }),
		screen.getByRole("button", { name: "Settings" }),
		screen.getByRole("button", { name: "Collapse" }),
		screen.getByRole("log", { name: "Agent activity" }),
	]) {
		await user.tab();
		expect(document.activeElement).toBe(expected);
	}
});

test("returns focus on collapse or fullscreen and leaves the request landmark visible", () => {
	const expanded = (
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>
	);
	const view = render(expanded);
	const log = screen.getByRole("log", { name: "Agent activity" });
	log.focus();
	expect(document.activeElement).toBe(log);

	view.rerender(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>,
	);
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
	expect(document.activeElement).toBe(screen.getByRole("button", { name: "Expand" }));
	expect(screen.queryByRole("region", { name: "Application-wide Codex requests" })).toBeNull();

	view.rerender(expanded);
	screen.getByRole("log", { name: "Agent activity" }).focus();
	view.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={EMPTY_REQUEST}
			space="fullscreen"
			view={ONE_PANE_VIEW}
		/>,
	);
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
	expect(document.activeElement).toBe(document.querySelector('[data-workbench-title=""]'));
	expect(screen.queryByRole("region", { name: "Application-wide Codex requests" })).toBeNull();
});

test("keeps the app-global request on its captured source across active-pane navigation", async () => {
	PANE_B_REQUEST_TRANSPORT.commands.length = 0;
	const user = userEvent.setup();
	const view = render(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={PRESENT_REQUEST}
			space="workspace"
			view={REQUEST_VIEW_A}
		/>,
	);
	let requestRegion = screen.getByRole("region", { name: "Application-wide Codex requests" });
	expect(requestRegion.getAttribute("data-workbench-request")).toBe("present");
	expect(requestRegion.querySelector("dd")?.textContent).toBe(PANE_B.label);
	expect(requestRegion.querySelector("h2")?.textContent).toBe("Approval requests");
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();

	view.rerender(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={PRESENT_REQUEST}
			space="workspace"
			view={REQUEST_VIEW_B}
		/>,
	);
	expect(screen.getByRole("button", { name: PANE_B.label }).getAttribute("aria-pressed")).toBe(
		"true",
	);
	requestRegion = screen.getByRole("region", { name: "Application-wide Codex requests" });
	expect(requestRegion.querySelector("dd")?.textContent).toBe(PANE_B.label);

	view.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={PRESENT_REQUEST}
			space="fullscreen"
			view={REQUEST_VIEW_A}
		/>,
	);
	requestRegion = screen.getByRole("region", { name: "Application-wide Codex requests" });
	await user.click(within(requestRegion).getByRole("button", { name: "Approve" }));
	await waitFor(() => expect(PANE_B_REQUEST_TRANSPORT.commands).toHaveLength(1));
	const command = PANE_B_REQUEST_TRANSPORT.commands[0];
	expect(command?.draft.command).toBe("approvalRespond");
	expect(command?.target?.paneId).toBe(PANE_B.id);
	expect(command?.target?.commandId).toBe(PANE_B_REQUEST_TRANSPORT.target?.commandId);
	expect(PANE_A_TRANSPORT.commands).toHaveLength(0);
});

test("refuses cross-transport and same-ID relabeled request sources", () => {
	expect(() =>
		captureWorkbenchFrameRequestSource({
			identity: PANE_A,
			transport: PANE_B_REQUEST_TRANSPORT.transport,
		}),
	).toThrow("does not match transport pane pane-b");
	for (const tamperedRequest of [FORGED_REQUEST, RELABELED_REQUEST]) {
		const result = render(
			<WorkbenchFrame
				disclosure="collapsed"
				onActivePaneChange={noopPane}
				onDisclosureChange={noopDisclosure}
				request={tamperedRequest}
				space="workspace"
				view={REQUEST_VIEW_A}
			/>,
		);
		const request = screen.getByRole("region", { name: "Application-wide Codex requests" });
		expect(request.getAttribute("data-workbench-request")).toBe("error");
		expect(request.textContent).toContain("not captured from the pane identity it displays");
		expect(request.querySelector("dd")).toBeNull();
		expect(within(request).queryByRole("button", { name: "Approve" })).toBeNull();
		result.unmount();
	}
});

test("revokes request actions when its subscribed transport moves to another pane", async () => {
	const fixture = mutableRequestFrame(PANE_B, fixedNow);
	render(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={fixture.request}
			space="workspace"
			view={fixture.view}
		/>,
	);
	const requestRegion = screen.getByRole("region", { name: "Application-wide Codex requests" });
	expect(requestRegion.getAttribute("data-workbench-request")).toBe("present");
	expect(requestRegion.querySelector("dd")?.textContent).toBe(PANE_B.label);
	expect(within(requestRegion).getByRole("button", { name: "Approve" })).toBeTruthy();

	act(() => retargetRequestTransportLease(fixture.fake, PANE_A.id));
	await waitFor(() => expect(requestRegion.getAttribute("data-workbench-request")).toBe("error"));
	expect(requestRegion.textContent).toContain("does not match transport pane pane-a");
	expect(requestRegion.querySelector("dd")).toBeNull();
	expect(within(requestRegion).queryByRole("button", { name: "Approve" })).toBeNull();
});

test("renders honest loading, empty, and error workbench projections", () => {
	for (const item of WORKBENCH_PROJECTION_CASES) {
		const result = render(
			<WorkbenchFrame
				disclosure="expanded"
				onActivePaneChange={noopPane}
				onDisclosureChange={noopDisclosure}
				request={EMPTY_REQUEST}
				space="workspace"
				view={item.view}
			/>,
		);
		const projection = document.querySelector(`[data-workbench-projection="${item.view.state}"]`);
		expect(projection?.getAttribute("role")).toBe(item.role);
		expect(projection?.textContent).toContain(item.text);
		if (item.view.state === "error") {
			expect(projection?.textContent).toContain(item.view.recovery);
		}
		result.unmount();
	}
});

test("keeps actionable request projections visible and omits empty inventory in fullscreen", () => {
	for (const request of REQUEST_PROJECTION_CASES) {
		const result = render(
			<WorkbenchFrame
				disclosure="expanded"
				onActivePaneChange={noopPane}
				onDisclosureChange={noopDisclosure}
				request={request}
				space="fullscreen"
				view={LOADING_VIEW}
			/>,
		);
		if (request.state === "empty") {
			expect(screen.queryByRole("region", { name: "Application-wide Codex requests" })).toBeNull();
			result.unmount();
			continue;
		}
		const region = screen.getByRole("region", { name: "Application-wide Codex requests" });
		expect(region.getAttribute("data-workbench-request")).toBe(request.state);
		expect(region.textContent).toContain(request.detail);
		if (request.state === "error") expect(region.textContent).toContain(request.recovery);
		expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
		result.unmount();
	}
});

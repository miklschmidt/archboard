import { afterAll, afterEach, expect, test } from "bun:test";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();
const { WorkbenchFrame } = await import("../index.js");
const { TEST_NOW, framePane, requestTransport, stoppedTransport } = await import("./support.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

const PANE_A = { id: "pane-a", label: "Pane A" } as const;
const PANE_B = { id: "pane-b", label: "Pane B" } as const;
const EMPTY_REQUEST = { state: "empty", detail: "No request needs a response." } as const;
const LOADING_REQUEST = {
	state: "loading",
	detail: "Checking for application-wide requests.",
} as const;
const PANE_A_TRANSPORT = stoppedTransport(PANE_A.id);
const PANE_A_PORT = framePane(PANE_A, PANE_A_TRANSPORT);
const PANE_B_PORT = framePane(PANE_B, stoppedTransport(PANE_B.id));
const PANE_B_REQUEST_TRANSPORT = requestTransport(PANE_B.id);
const PANE_B_REQUEST_PORT = framePane(PANE_B, PANE_B_REQUEST_TRANSPORT);
const PANE_B_COMPACT_PORT = {
	...PANE_B_REQUEST_PORT,
	boardStatus: {
		...PANE_B_REQUEST_PORT.boardStatus,
		claim: {
			state: "claimed",
			holderId: "agent-frame",
			holderKind: "agent",
			claimedAt: "2026-09-04T12:00:00.000Z",
			reason: "Refactoring frame hierarchy",
		},
		doing: [
			{
				doing: "Preserving compact hierarchy",
				at: "2026-09-04T12:01:00.000Z",
				by: "agent-frame",
				kind: "agent",
				claimed: true,
			},
		],
	},
} as const;
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
	source: { pane: PANE_B, transport: PANE_B_REQUEST_TRANSPORT.transport, now: fixedNow },
} as const;
const LOADING_VIEW = { state: "loading", detail: "Loading the workbench." } as const;
const selectedPaneIds: string[] = [];

function noopPane(): void {}
function noopDisclosure(): void {}
function fixedNow(): number {
	return TEST_NOW;
}
function capturePane(paneId: string): void {
	selectedPaneIds.push(paneId);
}

test("composes one pane in workhorse-first landmark and DOM order", () => {
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

	const frame = screen.getByRole("region", { name: "Agent workbench" });
	expect(frame.getAttribute("data-pane-count")).toBe("1");
	expect(frame.getAttribute("data-workbench-disclosure")).toBe("expanded");
	expect(frame.getAttribute("data-workbench-space")).toBe("workspace");
	for (const className of [
		"bg-background",
		"text-foreground",
		"border-border",
		"duration-control",
		"ease-control",
		"forced-color-adjust-auto",
		"forced-colors:border-current",
	]) {
		expect(frame.className).toContain(className);
	}

	const paneNav = screen.getByRole("navigation", { name: "Workbench panes" });
	const paneControl = within(paneNav).getByRole("button", { name: PANE_A.label });
	expect(paneControl.getAttribute("aria-pressed")).toBe("true");
	expect(paneControl.className).toContain("min-h-touch-target");
	expect(screen.getByRole("button", { name: "Collapse" }).className).toContain(
		"min-h-touch-target",
	);

	expect(screen.getByRole("region", { name: "Pane A workhorse" })).toBeTruthy();
	expect(screen.getByRole("complementary", { name: "Pane A workbench operations" })).toBeTruthy();
	expect(screen.getByRole("region", { name: "Board claim and doing" })).toBeTruthy();
	expect(screen.getByRole("region", { name: "Application-wide Codex requests" })).toBeTruthy();
	expect(screen.getByRole("log", { name: "Workhorse activity" })).toBeTruthy();
	expect(document.querySelector('[data-workbench-queue=""]')).toBeTruthy();
	expect(document.querySelector('[data-thread-link-pane="pane-a"]')).toBeTruthy();
	expect(document.querySelector('[data-coordinator-disclosure="read-only"]')).toBeTruthy();

	const order = [...document.querySelectorAll("[data-workbench-region]")].map((node) =>
		node.getAttribute("data-workbench-region"),
	);
	expect(order).toEqual(["workhorse", "operations", "app-global-request"]);
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

	const frame = screen.getByRole("region", { name: "Agent workbench" });
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
	expect(screen.getByRole("region", { name: "Pane B workhorse" })).toBeTruthy();
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

	const frame = screen.getByRole("region", { name: "Agent workbench" });
	expect(frame.getAttribute("data-pane-count")).toBe("2");
	expect(screen.getByRole("button", { name: PANE_B.label }).getAttribute("aria-pressed")).toBe(
		"true",
	);
	let compact = screen.getByRole("region", { name: "Pane B compact workbench status" });
	expect(compact.className).toContain("overflow-x-auto");
	expect(compact.className).toContain("focus-visible:outline-ring");
	expect(compact.querySelector("dl")?.className).toContain(
		"grid-cols-[repeat(6,minmax(10rem,1fr))]",
	);
	expect(compact.querySelector(".uppercase")).toBeNull();
	expect(compact.querySelector(".font-mono")).toBeNull();
	expect(
		[...compact.querySelectorAll("dd")].every((node) => node.classList.contains("font-sans")),
	).toBe(true);
	expect(
		[...compact.querySelectorAll("[data-workbench-compact-item]")].map((node) =>
			node.getAttribute("data-workbench-compact-item"),
		),
	).toEqual([
		"workhorse",
		"board-claim",
		"board-doing",
		"queue",
		"coordinator-history",
		"coordinator-settings",
	]);
	expect(compact.querySelector('[data-workbench-compact-item="workhorse"]')?.textContent).toContain(
		"Idle",
	);
	expect(
		compact.querySelector('[data-workbench-compact-item="board-claim"]')?.textContent,
	).toContain("Refactoring frame hierarchy");
	expect(
		compact.querySelector('[data-workbench-compact-item="board-doing"]')?.textContent,
	).toContain("Preserving compact hierarchy");
	expect(compact.querySelector('[data-workbench-compact-item="queue"]')?.textContent).toContain(
		"Outcome unknown · 0 items",
	);
	expect(
		compact.querySelector('[data-workbench-compact-item="coordinator-history"]')?.textContent,
	).toContain("Unavailable");
	expect(
		compact.querySelector('[data-workbench-compact-item="coordinator-settings"]')?.textContent,
	).toContain("gpt-5.6-luna · medium");
	for (const expected of [
		screen.getByRole("button", { name: PANE_A.label }),
		screen.getByRole("button", { name: PANE_B.label }),
		screen.getByRole("button", { name: "Expand" }),
		compact,
	]) {
		await user.tab();
		expect(document.activeElement).toBe(expected);
	}

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
	compact = screen.getByRole("region", { name: "Pane B compact workbench status" });
	expect(compact.getAttribute("data-workbench-content")).toBe("compact");
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
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
		screen.getByRole("button", { name: "Collapse" }),
		screen.getByRole("log", { name: "Workhorse activity" }),
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
			request={LOADING_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>
	);
	const view = render(expanded);
	const log = screen.getByRole("log", { name: "Workhorse activity" });
	log.focus();
	expect(document.activeElement).toBe(log);

	view.rerender(
		<WorkbenchFrame
			disclosure="collapsed"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={LOADING_REQUEST}
			space="workspace"
			view={ONE_PANE_VIEW}
		/>,
	);
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
	expect(document.activeElement).toBe(screen.getByRole("button", { name: "Expand" }));
	expect(screen.getByRole("region", { name: "Application-wide Codex requests" })).toBeTruthy();

	view.rerender(expanded);
	screen.getByRole("log", { name: "Workhorse activity" }).focus();
	view.rerender(
		<WorkbenchFrame
			disclosure="expanded"
			onActivePaneChange={noopPane}
			onDisclosureChange={noopDisclosure}
			request={LOADING_REQUEST}
			space="fullscreen"
			view={ONE_PANE_VIEW}
		/>,
	);
	expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
	expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Agent workbench" }));
	expect(screen.getByText("Fullscreen canvas")).toBeTruthy();
	expect(screen.getByRole("region", { name: "Application-wide Codex requests" })).toBeTruthy();
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
	expect(within(requestRegion).getByRole("button", { name: "Approve" })).toBeTruthy();
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

test("renders honest loading, empty, and error workbench projections", () => {
	const cases = [
		{
			view: { state: "loading", detail: "Loading the Codex workbench." } as const,
			role: "status",
			text: "Loading the Codex workbench.",
		},
		{
			view: { state: "empty", detail: "No pane is available for the workbench." } as const,
			role: "status",
			text: "No pane is available for the workbench.",
		},
		{
			view: {
				state: "error",
				detail: "The workbench projection failed.",
				recovery: "Reconnect Codex and reload the pane.",
			} as const,
			role: "alert",
			text: "The workbench projection failed.",
		},
	] as const;

	for (const item of cases) {
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

test("keeps loading, empty, and error request projections visible in fullscreen", () => {
	const requests = [
		{ state: "loading", detail: "Loading requests from the command lease." } as const,
		{ state: "empty", detail: "No application-wide request is active." } as const,
		{
			state: "error",
			detail: "The request source disconnected.",
			recovery: "Reconnect the originating pane before responding.",
		} as const,
	] as const;

	for (const request of requests) {
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
		const region = screen.getByRole("region", { name: "Application-wide Codex requests" });
		expect(region.getAttribute("data-workbench-request")).toBe(request.state);
		expect(region.textContent).toContain(request.detail);
		if (request.state === "error") expect(region.textContent).toContain(request.recovery);
		expect(document.querySelector('[data-workbench-content="expanded"]')).toBeNull();
		result.unmount();
	}
});

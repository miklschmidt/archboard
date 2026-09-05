// TEMPORARY presentation fixture. It supplies the shell with typed example
// data so the frame renders before the runtime is connected. TASK-150.07
// replaces it with the real board, pane and lock state and removes this file.

import type { ShellActions, ShellView } from "@/ui/shell";
import type { BoardIdentity, DoingEntry, LockHolder, PaneStatus } from "@/ui/types";

const CHECKOUT_CURRENT: BoardIdentity = { board: "Checkout", variant: "current", level: "L2" };
const CHECKOUT_PROPOSAL: BoardIdentity = {
	board: "Checkout",
	variant: "proposal-async-payments",
	level: "L2",
};
const RUNTIME_CURRENT: BoardIdentity = { board: "Runtime", variant: "current" };
const INVENTORY_DRAFT: BoardIdentity = {
	board: "Inventory reconciliation service",
	variant: "current",
};
const SCRATCH: BoardIdentity = { board: "scratch-7f3k", variant: "current" };

const AGENT_CLAIM: LockHolder = {
	id: "agent-codex-1",
	kind: "agent",
	since: "2026-09-05T09:12:04.000Z",
	until: "2026-09-05T09:42:04.000Z",
	process: "codex",
	reason: "Tracing repository bindings",
	claimed: true,
};

const DOING: DoingEntry[] = [
	{
		doing: "Scanning graph",
		at: "2026-09-05T09:12:11.000Z",
		by: "agent-codex-1",
		kind: "agent",
		claimed: true,
	},
	{
		doing: "Tracing repository bindings",
		at: "2026-09-05T09:14:31.000Z",
		by: "agent-codex-1",
		kind: "agent",
		claimed: true,
	},
];

const PANE_A: PaneStatus = {
	paneId: "A",
	clientId: "pane-a",
	connected: true,
	board: CHECKOUT_CURRENT,
	boardKey: "Checkout",
	elementCount: 18,
	lastChangeAt: "2026-09-05T09:14:31.000Z",
	hold: null,
	writtenElsewhere: null,
	doing: DOING,
};

const PANE_B: PaneStatus = {
	paneId: "B",
	clientId: "pane-b",
	connected: true,
	board: RUNTIME_CURRENT,
	boardKey: "Runtime",
	elementCount: 9,
	lastChangeAt: "2026-09-05T09:03:12.000Z",
	hold: null,
	writtenElsewhere: null,
	doing: [],
};

/** The example view: two panes, one claimed, a bound selection and a focused path. */
const EXAMPLE_VIEW: ShellView = {
	theme: "light",
	current: CHECKOUT_CURRENT,
	boards: {
		vault: "/vault",
		boards: [
			{ key: "Checkout", identity: CHECKOUT_CURRENT, file: "Checkout.md" },
			{
				key: "Checkout@proposal-async-payments",
				identity: CHECKOUT_PROPOSAL,
				file: "Checkout@proposal-async-payments.md",
			},
			{ key: "Runtime", identity: RUNTIME_CURRENT, file: "Runtime.md" },
		],
		open: [
			{ key: "Checkout", identity: CHECKOUT_CURRENT, elementCount: 18 },
			{ key: "Runtime", identity: RUNTIME_CURRENT, elementCount: 9 },
			{ key: "Inventory reconciliation service", identity: INVENTORY_DRAFT, elementCount: 3 },
		],
		onScreen: [
			{ paneId: "A", place: "left", board: "Checkout" },
			{ paneId: "B", place: "right", board: "Runtime" },
		],
	},
	boardsError: null,
	scratch: [{ key: "scratch-7f3k", identity: SCRATCH, placeholder: true }],
	previews: {},
	selectedBoardKey: "Checkout",
	panes: [
		{ status: PANE_A, holder: AGENT_CLAIM, takeBack: { kind: "idle" } },
		{ status: PANE_B, holder: null, takeBack: { kind: "idle" } },
	],
	activePaneId: "A",
	presentation: null,
	selection: {
		kind: "bound",
		element: {
			id: "k3m9",
			type: "rectangle",
			metadata: { node: "checkout", kind: "service", name: "Checkout Service", level: "L2" },
		},
		binding: {
			repo: "checkout",
			path: "services/checkout",
			branch: "main",
			commit: "a1b2c3d",
			confirmedAt: "2026-09-05T09:14:31.000Z",
		},
	},
	pathFocus: { kind: "connected", selectedId: "k3m9", elementIds: ["k3m9", "arr1", "pg7"] },
	pathFocusOverlay: {
		paneId: "A",
		rectangles: [
			{ x: 240, y: 180, width: 180, height: 96 },
			{ x: 520, y: 320, width: 160, height: 96 },
		],
	},
	notices: [
		{
			id: "code-target",
			title: "Checkout has no local checkout",
			description: "The bound repository is not registered on this machine.",
			tone: "default",
			actions: [
				{ kind: "settings", label: "Opener settings" },
				{ kind: "github", label: "Open on GitHub", href: "https://github.com/example/checkout" },
			],
		},
	],
};

/**
 * The no-op every example action shares. Nothing happens until TASK-150.07
 * connects the runtime.
 */
function noop(): void {
	// Intentionally empty: the fixture has nothing to act on.
}

/** Example actions: every one is the same no-op. */
const EXAMPLE_ACTIONS: Omit<ShellActions, "setTheme"> = {
	selectBoard: noop,
	refreshBoards: noop,
	createBoard: noop,
	nameBoard: noop,
	openBoard: noop,
	saveBoard: noop,
	clearBoard: noop,
	selectPane: noop,
	addPane: noop,
	closePane: noop,
	present: noop,
	takeBackControl: noop,
	openSettings: noop,
	selectNoticeAction: noop,
	dismissNotice: noop,
	openCode: noop,
	focusPath: noop,
	exitPathFocus: noop,
	canvasReady: noop,
};

export { EXAMPLE_VIEW, EXAMPLE_ACTIONS };

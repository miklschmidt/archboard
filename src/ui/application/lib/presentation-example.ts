// TEMPORARY presentation fixture. It supplies the shell with typed example
// data so the frame renders before the runtime is connected. TASK-150.07
// replaces it with the real board, pane and lock state and removes this file.

import type { ShellActions, ShellView } from "@/ui/shell";
import type { BoardIdentity, LockHolder, PaneStatus } from "@/ui/types";

const CHECKOUT_CURRENT: BoardIdentity = { board: "Checkout", variant: "current", level: "L2" };
const CHECKOUT_PROPOSAL: BoardIdentity = {
	board: "Checkout",
	variant: "proposal-async-payments",
	level: "L2",
};
const RUNTIME_CURRENT: BoardIdentity = { board: "Runtime", variant: "current" };
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
	doing: [
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
	],
};

/** The example view: two named boards, one scratch board, one claimed pane. */
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
		open: [{ key: "Checkout", identity: CHECKOUT_CURRENT, elementCount: 18 }],
		onScreen: [{ paneId: "A", place: "left", board: "Checkout" }],
	},
	scratch: [{ key: "scratch-7f3k", identity: SCRATCH }],
	previews: {},
	selectedBoardKey: "Checkout",
	panes: [{ status: PANE_A, holder: AGENT_CLAIM }],
	activePaneId: "A",
	presentation: null,
	selection: {
		elementId: "k3m9",
		title: "Checkout Service",
		elementType: "service",
		metadata: [
			{ label: "Element", value: "k3m9", technical: true },
			{ label: "Runtime", value: "Go 1.22", technical: false },
			{ label: "Updated", value: "09:14:31", technical: true },
		],
		binding: {
			repo: "checkout",
			path: "services/checkout",
			branch: "main",
			commit: "a1b2c3d",
		},
	},
	notices: [
		{
			id: "note-runtime",
			title: "Runtime was written by another editor",
			description:
				"The note changed on disk while this pane held the older board. Choose what to keep.",
			tone: "default",
			actions: [
				{ id: "reload", label: "Reload from note" },
				{ id: "save-as", label: "Save elsewhere" },
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
	createBoard: noop,
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
	openCode: noop,
	focusPath: noop,
	canvasReady: noop,
};

export { EXAMPLE_VIEW, EXAMPLE_ACTIONS };

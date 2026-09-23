import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";
import { Shell, type ShellActions, type ShellPane, type ShellView } from "@/ui/shell";
import type { AgentActivityEntry, CatalogBoard, ListedVariant } from "@/ui/types";

let root: Root;
beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});
afterEach(() => {
	act(() => root.unmount());
	document.body.replaceChildren();
	window.localStorage.clear();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * A listed variant.
 * @param boardKey The board's key.
 * @param id The variant id.
 * @param parentId Its predecessor, or null.
 * @param lifecycle Its standing.
 * @param opens Whether the board's bare name opens it.
 * @returns The variant.
 */
function variant(
	boardKey: string,
	id: string,
	parentId: string | null,
	lifecycle: ListedVariant["lifecycle"],
	opens = false,
): ListedVariant {
	return {
		id,
		name: `${boardKey} ${id}`,
		parentId,
		lifecycle,
		key: opens ? boardKey : `${boardKey}@${id}`,
	};
}

/**
 * A listed board with one current variant unless given more.
 * @param name Its name.
 * @param level Its level.
 * @param links The boards it drills down to.
 * @param variants Its variants; one current one when omitted.
 * @returns The board.
 */
function board(
	name: string,
	level: string,
	links: readonly string[] = [],
	variants?: readonly ListedVariant[],
): CatalogBoard {
	const key = name.toLowerCase();
	const listed = variants ?? [variant(key, "now", null, "current", true)];
	return {
		name,
		key,
		level,
		opens: listed.find((entry) => entry.key === key)?.id ?? null,
		variants: [...listed],
		links: links.map((target) => ({
			board: target,
			variant: null,
			node: target,
			container: false,
		})),
		description: null,
	};
}

/** A system that drills into a service, with a module under it, and a loose board. */
const BOARDS: readonly CatalogBoard[] = [
	board("Checkout", "system", ["Payments"]),
	board(
		"Payments",
		"service",
		["Ledger"],
		[
			variant("payments", "now", null, "current", true),
			variant("payments", "queued", "now", "draft"),
			variant("payments", "old", null, "historical"),
		],
	),
	board("Ledger", "module"),
	board("Audit", "service"),
];

/** No unrelated shell behaviour is exercised here. */
function ignore(): void {
	return;
}

/** What the navigator asked the shell to do. */
interface Asked {
	readonly selected: string[];
	readonly beside: string[];
}

/**
 * Mount the real shell over a fixed listing.
 * @param overrides Workspace state for the behaviour under test.
 * @returns What the navigator asked for.
 */
function mountNavigator(overrides: Partial<ShellView> = {}): Asked {
	const asked: Asked = { selected: [], beside: [] };
	const actions: ShellActions = {
		setTheme: ignore,
		/**
		 * Record a board opened in the active pane.
		 * @param key The board key.
		 */
		selectBoard: (key) => {
			asked.selected.push(key);
		},
		/**
		 * Record a board opened beside.
		 * @param key The board key.
		 */
		openBeside: (key) => {
			asked.beside.push(key);
		},
		refreshBoards: ignore,
		selectPane: ignore,
		addPane: ignore,
		closePane: ignore,
		present: ignore,
		takeBackControl: ignore,
		openSettings: ignore,
		selectNoticeAction: ignore,
		dismissNotice: ignore,
	};
	const view: ShellView = {
		theme: "light",
		current: { board: "Payments", variant: "current" },
		boards: { boards: [...BOARDS], levels: ["system", "service", "module"], onScreen: [] },
		boardsError: null,
		boardsLoading: false,
		selectedBoardKey: "payments",
		panes: [pane("A", "payments")],
		activePaneId: "A",
		presentation: null,
		notices: [],
		agentActivity: {},
		...overrides,
	};
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	act(() => root.render(createElement(Shell, { view, actions })));
	return asked;
}

/**
 * One local pane.
 * @param paneId The pane.
 * @param boardKey What it shows, or null.
 * @returns The pane.
 */
function pane(paneId: string, boardKey: string | null): ShellPane {
	return {
		status: {
			paneId,
			clientId: `${paneId}-client`,
			connected: true,
			registered: true,
			boardKey,
			opened: boardKey,
			board: null,
			view: null,
			lastChangeAt: null,
			doing: [],
			version: null,
		},
		stage: null,
		holder: null,
		takeBack: { kind: "idle" },
	};
}

/**
 * The tree's rows as `kind:id@level`, in order.
 * @returns The rows.
 */
function rows(): string[] {
	return [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].map(
		(item) =>
			`${item.dataset["rowKind"]}:${item.dataset["rowId"]}@${item.getAttribute("aria-level")}`,
	);
}

/**
 * A rendered row by its id.
 * @param id The row id.
 * @returns The row.
 */
function row(id: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
	if (found === null) throw new Error(`Missing row ${id}`);
	return found;
}

/**
 * Press a key on the focused element.
 * @param key The key.
 * @param altKey Whether Alt is held.
 */
function press(key: string, altKey = false): void {
	act(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key, altKey, bubbles: true }),
		);
	});
}

test("each board is one row, nested under the board it drills down from, with the read board's states under it", () => {
	mountNavigator();
	expect(rows()).toEqual([
		"board:board:audit@1",
		"board:board:checkout@1",
		"board:board:payments@2",
		"state:state:payments@3",
		"state:state:payments@queued@4",
		"state:state:payments@old@3",
		"board:board:ledger@3",
	]);
	expect(row("board:payments").getAttribute("aria-selected")).toBe("true");
	expect(row("state:payments").getAttribute("aria-selected")).toBe("true");
});

test("a board opens by its bare name and a state by its own key, beside with Alt", () => {
	const asked = mountNavigator();
	act(() => row("board:audit").click());
	act(() => {
		row("state:payments@queued").dispatchEvent(
			new MouseEvent("click", { bubbles: true, altKey: true }),
		);
	});
	expect(asked.selected).toEqual(["audit"]);
	expect(asked.beside).toEqual(["payments@queued"]);
});

test("the arrows walk the tree: left closes and climbs, right opens and descends, Enter opens", () => {
	const asked = mountNavigator({ panes: [pane("A", "audit")], selectedBoardKey: "audit" });
	expect(rows()).toEqual([
		"board:board:audit@1",
		"board:board:checkout@1",
		"board:board:payments@2",
	]);
	act(() => row("board:checkout").focus());
	press("ArrowDown");
	expect(document.activeElement).toBe(row("board:payments"));
	press("ArrowRight");
	expect(rows()).toContain("board:board:ledger@3");
	press("ArrowRight");
	expect(document.activeElement).toBe(row("board:ledger"));
	press("ArrowLeft");
	expect(document.activeElement).toBe(row("board:payments"));
	press("ArrowLeft");
	expect(rows()).not.toContain("board:board:ledger@3");
	press("Enter", true);
	expect(asked.beside).toEqual(["payments"]);
});

test("typing filters the tree in place, keeping the path to each match, and Enter opens the first", () => {
	const asked = mountNavigator({ panes: [pane("A", "audit")], selectedBoardKey: "audit" });
	act(() => row("board:audit").focus());
	press("q");
	const input = document.querySelector<HTMLInputElement>('input[type="search"]');
	expect(document.activeElement).toBe(input);
	expect(input?.value).toBe("q");
	expect(rows()).toEqual([
		"board:board:checkout@1",
		"board:board:payments@2",
		"state:state:payments@queued@3",
	]);
	expect(row("board:payments").getAttribute("aria-selected")).toBe("false");
	press("Enter");
	expect(asked.selected).toEqual(["payments@queued"]);
});

test("agent work is gathered in one block and never reorders or resizes the tree", () => {
	mountNavigator();
	const before = rows();
	expect(document.querySelector('[data-slot="working-now"]')).toBeNull();
	act(() => root.unmount());
	const activity: AgentActivityEntry = {
		board: "ledger",
		claim: null,
		doing: { doing: "adding the queue", at: new Date().toISOString(), by: "agent", kind: "agent" },
	};
	const asked = mountNavigator({ agentActivity: { ledger: activity } });
	expect(rows()).toEqual(before);
	const block = document.querySelector<HTMLElement>('[data-slot="working-now"]');
	const entry = block?.querySelector("button");
	act(() => entry?.click());
	expect(asked.selected).toEqual(["ledger"]);
	expect(row("board:ledger").querySelector('[data-slot="agent-activity"]')).not.toBeNull();
});

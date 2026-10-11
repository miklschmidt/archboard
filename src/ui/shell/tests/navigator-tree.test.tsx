import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";
import { buildOutline } from "@/ui/board-catalog";
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

/** What a mounted navigator asked for, and how to show it news. */
interface Mounted extends Asked {
	/**
	 * Draw the shell again with the same actions over a changed workspace.
	 * @param changes What changed.
	 */
	readonly show: (changes: Partial<ShellView>) => void;
}

/**
 * Mount the real shell over a fixed listing.
 * @param overrides Workspace state for the behaviour under test.
 * @returns What the navigator asked for, and how to show it news.
 */
function mountNavigator(overrides: Partial<ShellView> = {}): Mounted {
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
	// Built once, as the application builds it once per listing: the news a test shows keeps the listing.
	const outline = buildOutline(view.boards.boards, view.boards.levels);
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	// A board's mark is its level's, drawn from the vault vocabulary the shell reads through its query cache.
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	/**
	 * Draw the shell over a view.
	 * @param shown The view.
	 */
	const draw = (shown: ShellView): void => {
		act(() =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client },
					createElement(Shell, { view: shown, outline, actions }),
				),
			),
		);
	};
	draw(view);
	return {
		...asked,
		/**
		 * Draw the shell again with the same actions over a changed workspace.
		 * @param changes What changed.
		 */
		show: (changes) => {
			draw({ ...view, ...changes });
		},
	};
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
		boardName: null,
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
 * The lines a row draws to join it to what it sits under, as `shape` or `shape:lit`.
 * @param id The row id.
 * @returns One entry for each line drawn, outermost first.
 */
function guides(id: string): string[] {
	return [...row(id).querySelectorAll<HTMLElement>('[data-slot="tree-guide"]')].map(
		(line) => `${line.dataset["guide"]}${line.dataset["lit"] ? `:${line.dataset["lit"]}` : ""}`,
	);
}

/**
 * The rows carrying a pane's letter.
 * @param letter The letter.
 * @returns Their ids.
 */
function carrying(letter: string): string[] {
	return [...document.querySelectorAll(`[data-pane-letter="${letter}"]`)].map(
		(chip) => chip.closest<HTMLElement>('[role="treeitem"]')?.dataset["rowId"] ?? "",
	);
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

test("each board is one row under the board it drills down from, with the variants of the board on screen one depth in", () => {
	mountNavigator();
	expect(rows()).toEqual([
		"board:board:audit@1",
		"board:board:checkout@1",
		"board:board:payments@2",
		"variant:variant:payments@3",
		"variant:variant:payments@queued@4",
		"earlier:earlier:payments@3",
		"board:board:ledger@3",
	]);
	// One selected row: the variant being read, not also its board.
	expect(row("board:payments").getAttribute("aria-selected")).toBe("false");
	expect(row("variant:payments").getAttribute("aria-selected")).toBe("true");
	expect(document.querySelectorAll('[role="treeitem"][aria-selected="true"]')).toHaveLength(1);
});

test("a board with a history has a disclosure with no pane on it, and opens to its current variant and Earlier", () => {
	const archive = board(
		"Archive",
		"service",
		[],
		[
			variant("archive", "now", null, "current", true),
			variant("archive", "old", null, "historical"),
		],
	);
	mountNavigator({
		boards: { boards: [archive], levels: ["system", "service", "module"], onScreen: [] },
		panes: [pane("A", null)],
		selectedBoardKey: null,
	});
	expect(row("board:archive").getAttribute("aria-expanded")).toBe("false");
	act(() => {
		row("board:archive").querySelector("button")?.click();
	});
	expect(rows()).toEqual([
		"board:board:archive@1",
		"variant:variant:archive@2",
		"earlier:earlier:archive@2",
	]);
});

test("the tree turns a line to each row, ends it at the last sibling, and lights the way to the selected row", () => {
	mountNavigator();
	// A top row hangs from nothing.
	expect(guides("board:checkout")).toEqual([]);
	// The only board under Checkout, on the way to the selected variant: its line ends here, lit.
	expect(guides("board:payments")).toEqual(["last:branch"]);
	// The selected variant is not the last under its board, so its line goes on past it.
	expect(guides("variant:payments")).toEqual(["elbow:mid"]);
	// The last board under Payments ends the line, and is not on the way.
	expect(guides("board:ledger")).toEqual(["last"]);
});

test("every row at one depth has one indent, and each depth moves one step", () => {
	mountNavigator({ panes: [pane("A", "payments@old")] });
	const indents = new Map<number, Set<string>>();
	for (const item of document.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
		const level = Number(item.getAttribute("aria-level"));
		indents.set(level, (indents.get(level) ?? new Set()).add(item.style.paddingLeft));
	}
	// Folders are absent here; boards, variants, the Earlier row and what it holds are all drawn.
	expect([...indents.keys()].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4]);
	const steps = [1, 2, 3].map((level) => {
		const [here] = indents.get(level) ?? [];
		const [next] = indents.get(level + 1) ?? [];
		return Number.parseFloat(next ?? "") - Number.parseFloat(here ?? "");
	});
	for (const set of indents.values()) expect(set.size).toBe(1);
	expect(new Set(steps).size).toBe(1);
	expect(steps[0]).toBeGreaterThan(0);
});

test("each pane's letter sits on the one row that says what that pane shows", () => {
	mountNavigator({
		panes: [pane("A", "payments@old"), pane("B", "checkout")],
		activePaneId: "A",
	});
	// A historical variant on screen opens the Earlier row that holds it.
	expect(row("earlier:payments").getAttribute("aria-expanded")).toBe("true");
	expect(carrying("A")).toEqual(["variant:payments@old"]);
	// A board with one variant has nothing to list: its own row says it is on screen.
	expect(carrying("B")).toEqual(["board:checkout"]);
	expect(row("variant:payments@old").getAttribute("aria-selected")).toBe("true");
});

test("a board opens by its bare name and a variant by its own key, beside with Alt", () => {
	const asked = mountNavigator();
	act(() => row("board:audit").click());
	act(() => {
		row("variant:payments@queued").dispatchEvent(
			new MouseEvent("click", { bubbles: true, altKey: true }),
		);
	});
	expect(asked.selected).toEqual(["audit"]);
	expect(asked.beside).toEqual(["payments@queued"]);
});

test("the arrows walk the tree: right opens a row, then steps in; left closes it, then steps out; Enter opens", () => {
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
	// Opening a board with a proposal lists its variants and the boards under it together.
	expect(rows()).toContain("variant:variant:payments@queued@4");
	expect(rows()).toContain("board:board:ledger@3");
	press("ArrowRight");
	expect(document.activeElement).toBe(row("variant:payments"));
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
		"variant:variant:payments@queued@3",
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

/**
 * The props each row's element was last drawn with, by row id. React replaces
 * them only when it draws the row again, so the same object means the row was
 * left as it was.
 * @returns The props, by row id.
 */
function drawnRows(): Map<string, unknown> {
	return new Map(
		[...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].map((item) => {
			const key = Object.keys(item).find((name) => name.startsWith("__reactProps$"));
			return [item.dataset["rowId"] ?? "", key === undefined ? undefined : Reflect.get(item, key)];
		}),
	);
}

/**
 * The rows drawn again between two readings.
 * @param before The first reading.
 * @param after The second.
 * @returns Their ids.
 */
function redrawn(before: Map<string, unknown>, after: Map<string, unknown>): string[] {
	return [...after].filter(([id, props]) => before.get(id) !== props).map(([id]) => id);
}

test("pane news draws no row again unless it is about that row's board (TASK-385.04)", () => {
	const { show } = mountNavigator();
	const first = drawnRows();
	expect(first.size).toBeGreaterThan(2);

	// A claim on the board the pane shows: the shell hears it, and no row says anything new.
	const claimed = pane("A", "payments");
	show({
		panes: [
			{
				...claimed,
				holder: {
					id: "agent",
					kind: "agent",
					since: "2026-10-01T00:00:00.000Z",
					until: "2026-10-01T00:10:00.000Z",
					process: "1",
					claimed: true,
				},
			},
		],
	});
	const afterClaim = drawnRows();
	expect(redrawn(first, afterClaim)).toEqual([]);

	// An agent starts work on Audit: Audit's row says so, and no other row changes.
	const working: AgentActivityEntry = {
		board: "audit",
		claim: null,
		doing: { doing: "adding a trail", at: new Date().toISOString(), by: "agent", kind: "agent" },
	};
	show({ agentActivity: { audit: working } });
	expect(redrawn(afterClaim, drawnRows())).toEqual(["board:audit"]);
});

import { expect, test } from "bun:test";

import {
	SHOP,
	act,
	board,
	carrying,
	guides,
	inShop,
	mountNavigator,
	pane,
	press,
	row,
	rows,
	unmount,
	variant,
} from "@/ui/shell/tests/navigator-fixture";
import type { AgentActivityEntry } from "@/ui/types";

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
	// The repository's row hangs from nothing.
	expect(guides(`repository:${SHOP}`)).toEqual([]);
	// A top board hangs from its repository, and the last one, on the way to the selected variant, ends the line lit.
	expect(guides("board:checkout")).toEqual(["last:branch"]);
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
	// The repository's row is at the top, and every row of its outline under it.
	expect([...indents.keys()].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
	const steps = [1, 2, 3, 4].map((level) => {
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
	unmount();
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
			return [
				inShop(item.dataset["rowId"] ?? ""),
				key === undefined ? undefined : Reflect.get(item, key),
			];
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

test("a presented pane's bar names the board as the vault lists it, not as its key was typed", () => {
	const typed = pane("A", "web shop");
	mountNavigator({
		panes: [
			{
				...typed,
				status: { ...typed.status, board: { board: "web shop", variant: "current" } },
				boardName: "Web shop",
			},
		],
		presentation: { kind: "live", paneId: "A" },
	});
	expect(document.querySelector('[data-slot="presentation-bar"]')?.textContent).toContain(
		"Web shop",
	);
});

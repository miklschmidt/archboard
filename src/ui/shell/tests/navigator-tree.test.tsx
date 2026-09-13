import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";
import { Shell, type ShellActions, type ShellPane, type ShellView } from "@/ui/shell";
import type { BoardEntry } from "@/ui/types";

let root: Root;
beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});
afterEach(() => {
	act(() => root.unmount());
	document.body.replaceChildren();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * A listed variant whose ancestry and lifecycle are separate facts.
 * @param id The variant identity.
 * @param name Its name.
 * @param parentId Its predecessor, or null for a root.
 * @param lifecycle Its current standing.
 * @returns The listing row.
 */
function variant(
	id: string,
	name: string,
	parentId: string | null,
	lifecycle: NonNullable<BoardEntry["variant"]>["lifecycle"],
): BoardEntry {
	return {
		key: lifecycle === "current" ? "Message delivery" : `Message delivery@${id}`,
		identity: { board: "Message delivery", variant: name },
		variant: { id, name, parentId, lifecycle },
	};
}

/** A family deliberately listed out of ancestry order, with two roots. */
const BOARDS = [
	variant("next", "Batch acknowledgement", "now", "draft"),
	variant("other", "Independent exploration", null, "draft"),
	variant("now", "Queued delivery", "old", "current"),
	variant("sibling", "Direct delivery", "old", "draft"),
	variant("old", "Initial", null, "historical"),
];

/** No unrelated shell behavior is exercised here. */
function ignore(): void {
	return;
}

/**
 * Mount the real navigator over a fixed server listing.
 * @param overrides Workspace state for the behavior under test.
 * @returns The selected board keys.
 */
function mountNavigator(overrides: Partial<ShellView> = {}): string[] {
	const selected: string[] = [];
	const actions: ShellActions = {
		setTheme: ignore,
		/**
		 * Record the variant chosen through the real shell.
		 * @param key The selected board address.
		 */
		selectBoard: (key) => {
			selected.push(key);
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
		current: { board: "Message delivery", variant: "current" },
		boards: {
			boards: BOARDS,
			onScreen: [{ paneId: "A", place: "left", board: "Message delivery@now" }],
		},
		boardsError: null,
		boardsLoading: false,
		selectedBoardKey: "Message delivery@Queued delivery",
		panes: [pane("local-left", "Message delivery@now")],
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
	return selected;
}

/**
 * One local pane; its server ID need not be its displayed letter.
 * @param paneId The server-assigned pane identity.
 * @param boardKey The board address this pane is displaying, or null when empty.
 * @returns The shell's local pane state.
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

test("architecture level appears once on the board heading, shared across its variant tree", () => {
	mountNavigator({
		boards: {
			boards: BOARDS.map((entry) => ({ ...entry, level: "module" })),
			onScreen: [],
		},
	});
	const rows = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')];
	expect(rows.filter((row) => row.textContent.includes("Module"))).toHaveLength(1);
	expect(treeRow("Message delivery").textContent).toBe("Message deliveryModule");
	expect(treeRow("Message delivery").getAttribute("aria-level")).toBe("1");
});

test("pane badges describe this workspace even when other browser tabs hold boards", () => {
	mountNavigator({
		boards: {
			boards: [
				...BOARDS,
				{
					key: "Agent workbench",
					identity: { board: "Agent workbench", variant: "Current architecture" },
					variant: {
						id: "work",
						name: "Current architecture",
						parentId: null,
						lifecycle: "current",
					},
				},
			],
			onScreen: [
				{ paneId: "remote", place: "left", board: "Agent workbench" },
				{ paneId: "local-left", place: "left", board: "Message delivery@old" },
				{ paneId: "local-right", place: "right", board: "Message delivery" },
			],
		},
		panes: [pane("local-left", "Message delivery@old"), pane("local-right", "Message delivery")],
	});
	expect(treeRow("Current architecture").textContent).not.toContain("on screen in pane");
	expect(treeRow("Initial").textContent).toContain("on screen in pane A");
	expect(treeRow("Queued delivery").textContent).toContain("on screen in pane B");
});

test("current ID and name aliases can mark the same variant in both local panes", () => {
	mountNavigator({
		panes: [
			pane("left", "Message delivery@now"),
			pane("right", "Message delivery@Queued delivery"),
		],
	});
	const row = treeRow("Queued delivery");
	expect(row.textContent).toContain("on screen in pane A");
	expect(row.textContent).toContain("on screen in pane B");
});

test("an empty first pane leaves the second pane labelled B", () => {
	mountNavigator({ panes: [pane("left", null), pane("right", "Message delivery@old")] });
	expect(treeRow("Initial").textContent).toContain("on screen in pane B");
	expect(treeRow("Queued delivery").textContent).not.toContain("on screen in pane");
});

test("variant ancestry stays rooted across lifecycle changes and keyboard navigation follows it", () => {
	const selected = mountNavigator();
	const rows = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')];
	expect(rows.map((row) => row.textContent)).toEqual([
		"Message delivery",
		"Independent explorationDraft",
		"InitialHistorical",
		"Direct deliveryDraft",
		"Queued deliveryCurrenton screen in pane A",
		"Batch acknowledgementDraft",
	]);
	expect(rows.map((row) => row.getAttribute("aria-level"))).toEqual(["1", "2", "2", "3", "3", "4"]);
	const current = treeRow("Queued delivery");
	expect(current.getAttribute("aria-selected")).toBe("true");
	act(() => current.focus());
	press("ArrowRight");
	expect(document.activeElement).toBe(treeRow("Batch acknowledgement"));
	act(() => treeRow("Batch acknowledgement").click());
	expect(selected).toEqual(["Message delivery@next"]);
	press("ArrowLeft");
	expect(document.activeElement).toBe(current);
	press("ArrowLeft");
	expect(current.getAttribute("aria-expanded")).toBe("false");
	expect(treeRow("Batch acknowledgement").closest("[hidden]")).not.toBeNull();
	press("ArrowLeft");
	expect(document.activeElement).toBe(treeRow("Initial"));
	const expand = document.querySelector<HTMLButtonElement>('[aria-label="Expand Queued delivery"]');
	act(() => expand?.click());
	expect(document.activeElement).toBe(current);
	expect(current.getAttribute("aria-expanded")).toBe("true");
	expect(selected).toEqual(["Message delivery@next"]);
});

/**
 * A rendered variant row by its visible name.
 * @param name The name to find.
 * @returns The row, refusing a missing fixture row.
 */
function treeRow(name: string): HTMLButtonElement {
	const found = [...document.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')].find((row) =>
		row.textContent.startsWith(name),
	);
	if (found === undefined) throw new Error("Missing tree row: " + name);
	return found;
}

/**
 * Dispatch a horizontal tree key on the focused row.
 * @param key The arrow key.
 */
function press(key: string): void {
	act(() => {
		document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

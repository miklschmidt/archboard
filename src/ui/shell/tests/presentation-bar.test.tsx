import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";
import { PresentationBar } from "@/ui/shell/components/PresentationBar";
import type { ShellActions, ShellPane } from "@/ui/shell";

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

/** Nothing: the bar under test asks for no action. */
function ignore(): void {
	return;
}

const ACTIONS: ShellActions = {
	setTheme: ignore,
	selectBoard: ignore,
	openBeside: ignore,
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

/**
 * Draw the bar over a pane showing a board.
 * @param board The key the pane reports.
 * @param boardName The name the vault lists it under, or null.
 * @returns The bar's text.
 */
function barText(board: string, boardName: string | null): string {
	const pane: ShellPane = {
		status: {
			paneId: "A",
			clientId: "A-client",
			connected: true,
			registered: true,
			boardKey: board,
			opened: board,
			board: { board, variant: "current" },
			view: null,
			lastChangeAt: null,
			doing: [],
			version: null,
		},
		stage: null,
		holder: null,
		takeBack: { kind: "idle" },
		boardName,
	};
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	act(() =>
		root.render(
			createElement(PresentationBar, {
				pane,
				error: null,
				voiceControls: null,
				actions: ACTIONS,
			}),
		),
	);
	return container.textContent ?? "";
}

test("the presentation bar names the board as the vault lists it, not as its key was typed", () => {
	expect(barText("web shop", "Web shop")).toContain("Web shop");
});

test("a board the vault does not list is named by the key the pane reports", () => {
	expect(barText("scratch", null)).toContain("scratch");
});

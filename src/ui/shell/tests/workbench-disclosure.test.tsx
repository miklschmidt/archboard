import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Shell, type ShellActions, type ShellView } from "@/ui/shell";

/** No pane or navigation behavior is exercised by the disclosure. */
function ignore(): void {
	return;
}

const actions: ShellActions = {
	setTheme: ignore,
	selectBoard: ignore,
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
	current: { board: "", variant: "current" },
	boards: { boards: [], onScreen: [] },
	boardsError: null,
	boardsLoading: false,
	selectedBoardKey: null,
	panes: [],
	activePaneId: "A",
	presentation: null,
	notices: [],
	agentActivity: {},
};

let root: Root | undefined;
beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});
afterEach(() => {
	act(() => root?.unmount());
	root = undefined;
	document.body.replaceChildren();
	window.localStorage.clear();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Mount a new dock, as on reload, and find its disclosure control.
 * @returns The disclosure button.
 */
function mountDock(): HTMLButtonElement {
	act(() => root?.unmount());
	const container = document.createElement("div");
	document.body.replaceChildren(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(Shell, { view, actions }));
	});
	const button = container.querySelector<HTMLButtonElement>("button[aria-label$='workbench']");
	if (!button) throw new Error("The dock disclosure did not mount.");
	return button;
}

test("starts closed and restores both disclosure choices after remounting", () => {
	let button = mountDock();
	expect(button.getAttribute("aria-expanded")).toBe("false");
	act(() => button.click());
	expect(button.getAttribute("aria-expanded")).toBe("true");
	button = mountDock();
	expect(button.getAttribute("aria-expanded")).toBe("true");
	act(() => button.click());
	button = mountDock();
	expect(button.getAttribute("aria-expanded")).toBe("false");
});

test("starts closed and remains operable when browser storage is unavailable", () => {
	const read = spyOn(window.localStorage, "getItem").mockImplementation(() => {
		throw new Error("Storage unavailable");
	});
	const write = spyOn(window.localStorage, "setItem").mockImplementation(() => {
		throw new Error("Storage unavailable");
	});
	try {
		const button = mountDock();
		expect(button.getAttribute("aria-expanded")).toBe("false");
		act(() => button.click());
		expect(button.getAttribute("aria-expanded")).toBe("true");
		act(() => button.click());
		expect(button.getAttribute("aria-expanded")).toBe("false");
	} finally {
		read.mockRestore();
		write.mockRestore();
	}
});

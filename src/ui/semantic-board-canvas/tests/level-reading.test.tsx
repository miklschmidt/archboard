// How a board a level down is read, once the pane has moved between repositories.
//
// What this catches: a view chosen on one repository's board carried to a board
// of the same name, at the same depth, in another repository, where its id
// names nothing (ADR 0050).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createElement, type JSX } from "react";

import { PaneVaultContext } from "@/ui/semantic-board-canvas";
import { useLevelReading } from "@/ui/semantic-board-canvas/drilling";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterEach(() => {
	cleanup();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Nothing to do: the moves are not what this reads.
 * @returns That the board on screen did not change.
 */
function nowhere(): boolean {
	return false;
}

/** A pane one level down its own board, on a board called api, in whichever vault it is in. */
const DOWN_IN_API: Parameters<typeof useLevelReading>[0] = {
	board: "api",
	variant: undefined,
	trail: [{ board: "overview", variant: undefined, vault: "/any", repository: null }],
	own: 0,
	open: nowhere,
	backTo: nowhere,
};

/** What the shell says about the pane's own board: nothing this test reads. */
const SHELL = { view: undefined, onView: undefined, onVariant: undefined };

/**
 * The level's reading, drawn: the view it reads, and a way to choose one.
 * @returns The view, and the control.
 */
function Probe(): JSX.Element {
	const reading = useLevelReading(DOWN_IN_API, SHELL);
	/** Choose a view of the board on screen. */
	const choose = (): void => {
		reading.onView?.("sv1");
	};
	return createElement("button", {
		type: "button",
		"data-view": reading.view ?? "",
		onClick: choose,
	});
}

/**
 * The probe, in a pane in one vault.
 * @param vault The vault.
 * @returns The tree.
 */
function paneIn(vault: string): JSX.Element {
	return createElement(PaneVaultContext, { value: vault }, createElement(Probe));
}

/**
 * The view the probe reads.
 * @returns Its id, "" for the whole variant, or null when nothing is drawn.
 */
function viewRead(): string | null {
	return document.querySelector("button")?.getAttribute("data-view") ?? null;
}

test("a view chosen a level down stays with that repository's board", () => {
	const { rerender } = render(paneIn("/shop"));
	act(() => {
		fireEvent.click(document.querySelector("button")!);
	});
	expect(viewRead()).toBe("sv1");

	// The pane moved to another repository, and the reader went down into its
	// board of the same name, as deep.
	rerender(paneIn("/payments"));
	expect(viewRead()).toBe("");
});

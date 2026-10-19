// Which board a level is, and how it is read, once the pane has moved between
// repositories (ADR 0050).
//
// What these catch: a pane that arrives in another repository drawing, for one
// frame, a board of the vault it left, read in the vault it arrived in; and a
// view chosen on one repository's board carried to a board of the same name,
// at the same depth, in another repository, where its id names nothing; and a
// drill asked for before somebody pointed the pane elsewhere, as a flight that
// lands late, opening its board over the board the pane holds now.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createElement, useEffect, type JSX } from "react";

import { PaneVaultContext } from "#ui/state/semantic-board-canvas/pane-vault.ts";
import { useDrillDown } from "#ui/hooks/semantic-board-canvas/use-drill-down.ts";
import { useLevelReading } from "#ui/hooks/semantic-board-canvas/use-level-reading.ts";

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

/** Where the pane in the arrival test is pointed, and what it has drawn. */
interface Pointed {
	readonly board: string;
	readonly vault: string;
	readonly arrival: number;
	/**
	 * The board on screen was drawn.
	 * @param where Its vault and name.
	 */
	readonly onDrawn: (where: string) => void;
}

/** The moves of the pane in the arrival test, once it has drawn. */
const moves: { current: ReturnType<typeof useDrillDown> | null } = { current: null };

/**
 * Hand the test the pane's moves, from an effect as a shell would hear of them.
 * @param drill The pane's moves.
 */
function useHandedMoves(drill: ReturnType<typeof useDrillDown>): void {
	useEffect(() => {
		moves.current = drill;
	}, [drill]);
}

/**
 * Where the pane is, drawn: each board it has on screen is reported once drawn.
 * @param props Where the shell pointed it, and who hears what it drew.
 * @returns Nothing to see.
 */
function DrillProbe(props: Pointed): null {
	const { board, vault, arrival, onDrawn } = props;
	const drill = useDrillDown({ board, variant: undefined, arrival, vault, repository: null }, () =>
		Promise.resolve(true),
	);
	useHandedMoves(drill);
	const shown = `${vault}:${drill.board}`;
	useEffect(() => {
		onDrawn(shown);
	}, [onDrawn, shown]);
	return null;
}

test("a pane that dives into another repository never draws a board of the vault it left there", () => {
	const drawn: string[] = [];
	/**
	 * The board on screen was drawn.
	 * @param where Its vault and name.
	 */
	const onDrawn = (where: string): void => {
		drawn.push(where);
	};
	const { rerender } = render(
		createElement(DrillProbe, { board: "shop", vault: "/shop", arrival: 0, onDrawn }),
	);
	// Down a level in the pane's own vault, then into a board of another repository.
	act(() => {
		moves.current?.open("cart", undefined);
	});
	act(() => {
		moves.current?.open("ledger", undefined, { vault: "/payments", repository: "payments" });
	});
	// The shell moved the pane there.
	rerender(createElement(DrillProbe, { board: "ledger", vault: "/payments", arrival: 1, onDrawn }));

	expect(drawn).toEqual(["/shop:shop", "/shop:cart", "/payments:ledger"]);
	expect(moves.current?.trail.map((stop) => stop.board)).toEqual(["shop", "cart"]);
});

test("a drill asked for before the pane was pointed elsewhere opens nothing over the new board", () => {
	const drawn: string[] = [];
	/**
	 * The board on screen was drawn.
	 * @param where Its vault and name.
	 */
	const onDrawn = (where: string): void => {
		drawn.push(where);
	};
	const { rerender } = render(
		createElement(DrillProbe, { board: "shop", vault: "/shop", arrival: 0, onDrawn }),
	);
	// The reader asked for a card's board, and its flight is still in the air.
	const asked = moves.current;
	// Somebody else pointed the pane at another repository's board meanwhile.
	rerender(createElement(DrillProbe, { board: "ledger", vault: "/payments", arrival: 1, onDrawn }));
	act(() => {
		asked?.open("cart", undefined);
	});

	expect(drawn.at(-1)).toBe("/payments:ledger");
	expect(moves.current?.trail).toEqual([]);
});

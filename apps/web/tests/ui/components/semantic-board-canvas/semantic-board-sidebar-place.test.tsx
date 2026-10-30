// Where the sidebar is beside a pane, and how a person shows it, hides it and
// puts it away: the one control in the pane's header, a panel laid over the
// picture while two panes share the centre, and the search shortcut.
//
// What these catch: a sidebar that leaves a bar or an empty column behind, a
// hidden sidebar that comes back somewhere else, a pick that docks a sidebar and
// so refits the picture under the pointer that made it, a float the person
// asked for that a released pick takes away, a panel that is put away without
// giving the keyboard back, and a shortcut that does nothing until the sidebar
// has been opened some other way, a control that says the sidebar is shown while
// a presented walkthrough has it stepped aside, and a tab chosen in a docked
// sidebar that turns into a float when a second pane arrives, a pick during
// a presented walkthrough that lays a panel nobody sees over the picture, and a
// pick on the About page that lays a panel over the page's own controls.

import { act, fireEvent } from "@testing-library/react";
import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";

import type { PaneChrome } from "#ui/components/semantic-board-canvas/PaneChrome.tsx";
import { ModelSearch } from "#ui/components/architecture-model/ModelSearch.tsx";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { EXPLAINED_BOARD } from "#tests/ui/support/semantic-board-canvas/render-answers.ts";
import {
	changeChromeInShell,
	drawing,
	driveInShell,
	inPicture,
	mountStage,
	openSidebarTab,
	part,
	server,
	settle,
	viewport,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { sidebarSettled } from "#tests/ui/support/semantic-board-canvas/sidebar-probes.ts";
import { openAboutPage } from "#tests/ui/support/semantic-board-canvas/variants-page.ts";

beforeAll(() => {
	// This DOM has no fullscreen to report; a browser that is not in one says null.
	Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
});

/** A pane that shares the centre with another, which leaves its sidebar away until it is asked for. */
const SHARED: PaneChrome = {
	letter: null,
	controls: null,
	notice: null,
	shared: true,
	active: true,
};

/** The same pane while the other one has focus. */
const NOT_ACTIVE: PaneChrome = { ...SHARED, active: false };

/** Nothing is chosen in these tests. */
function noChoice(): void {
	// A search that finds nothing has nothing to choose.
}

/** The ordinary search field over an empty canonical model. */
const SEARCH = createElement(ModelSearch, {
	model: {
		manifest: { schemaVersion: 1, id: "Fixture", name: "Fixture", current: null },
		modules: [],
		policy: DEFAULT_SEMANTIC_POLICY,
	},
	onChoose: noChoice,
});

/**
 * Mount a pane that holds its own selection, with a picture drawn.
 * @param chrome What the shell puts in its header.
 * @returns Settles once the picture is up.
 */
async function mountPane(chrome?: PaneChrome): Promise<void> {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { live: true, chrome, search: SEARCH });
	await settle();
}

/**
 * The sidebar's column, when it is drawn.
 * @returns The column, or null.
 */
function column(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-slot='semantic-sidebar']");
}

/**
 * Where the drawn sidebar is: docked beside the picture or floating over it.
 * @returns Its place, or null while it is away.
 */
function placeNow(): string | null {
	return column()?.getAttribute("data-place") ?? null;
}

/**
 * Which part of the pane has focus.
 * @returns Its `data-slot`, or null while nothing in the page has focus.
 */
function focusedSlot(): string | null {
	return document.activeElement?.getAttribute("data-slot") ?? null;
}

/**
 * Press one of the pane's controls.
 * @param slot Which.
 */
function press(slot: string): void {
	act(() => {
		fireEvent.click(part(slot));
	});
}

/**
 * Pick the card out, as a person does.
 * @returns Settles once the pick has been answered.
 */
async function pickCard(): Promise<void> {
	act(() => {
		fireEvent.click(inPicture("card"));
	});
	await settle();
}

/**
 * Let go of the selection, as Escape in the picture does.
 * @returns Settles once the sidebar has had time to leave.
 */
async function letGo(): Promise<void> {
	act(() => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await sidebarSettled();
}

test("the control hides a docked sidebar and shows it again, and says which it will do", async () => {
	await mountPane();
	expect(placeNow()).toBe("docked");
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("true");

	press("semantic-sidebar-toggle");
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
	// It is on its way out, and out of reach while it is.
	expect(column()?.hasAttribute("data-leaving")).toBe(true);
	expect(part("semantic-sidebar-panel").hasAttribute("inert")).toBe(true);

	// Once it has left it is nowhere: no bar, no column, nothing to tab to.
	await sidebarSettled();
	expect(column()).toBeNull();

	press("semantic-sidebar-toggle");
	expect(placeNow()).toBe("docked");
});

test("with two panes the sidebar rests, the control lays it over the picture, and Escape puts it away and gives the keyboard back", async () => {
	await mountPane(SHARED);
	expect(column()).toBeNull();

	press("semantic-sidebar-toggle");
	expect(placeNow()).toBe("floating");
	expect(part("semantic-sidebar-pin")).not.toBeNull();

	const inside = part("semantic-sidebar-tab");
	act(() => inside.focus());
	act(() => {
		fireEvent.keyDown(inside, { key: "Escape" });
	});
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
	expect(focusedSlot()).toBe("semantic-sidebar-toggle");
});

test("a pick lays a resting sidebar over the picture and letting go puts it away, so neither refits the picture", async () => {
	await mountPane(SHARED);
	await pickCard();
	expect(placeNow()).toBe("floating");
	expect(part("semantic-sidebar").getAttribute("data-tab")).toBe("selection");

	await letGo();
	expect(column()).toBeNull();
});

test("a float the person asked for outlasts the pick", async () => {
	await mountPane(SHARED);
	press("semantic-sidebar-toggle");
	await pickCard();
	await letGo();
	expect(placeNow()).toBe("floating");
});

test("pinning docks a floating panel, and hiding it then asking for it back docks it again", async () => {
	await mountPane(SHARED);
	press("semantic-sidebar-toggle");
	press("semantic-sidebar-pin");
	expect(placeNow()).toBe("docked");
	expect(document.querySelector("[data-slot='semantic-sidebar-pin']")).toBeNull();

	press("semantic-sidebar-toggle");
	await sidebarSettled();
	expect(column()).toBeNull();
	press("semantic-sidebar-toggle");
	expect(placeNow()).toBe("docked");
});

/**
 * Press the shortcut for the search over parts.
 */
function pressSearchShortcut(): void {
	act(() => {
		fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
	});
}

test("the search shortcut shows an away sidebar in the pane with focus and takes focus in the field", async () => {
	await mountPane(SHARED);
	expect(column()).toBeNull();

	pressSearchShortcut();
	await settle();
	expect(placeNow()).toBe("floating");
	const field = document.activeElement;
	expect(field?.getAttribute("role")).toBe("combobox");
	// Nothing is typed, so no list is drawn, and the field names none.
	expect(field?.hasAttribute("aria-controls")).toBe(false);

	// Escape in the empty field lets go of the field and puts the float away, and
	// the keyboard goes back to the control, not to the body of the page.
	act(() => {
		fireEvent.keyDown(field ?? document.body, { key: "Escape" });
	});
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
	expect(focusedSlot()).toBe("semantic-sidebar-toggle");
});

test("the search shortcut is for the pane with focus alone", async () => {
	await mountPane(NOT_ACTIVE);
	pressSearchShortcut();
	await settle();
	expect(column()).toBeNull();
});

test("letting go of a pick from inside the panel that it floated gives the keyboard back to the control", async () => {
	await mountPane(SHARED);
	await pickCard();
	const clear = part("semantic-selection-clear");
	act(() => clear.focus());
	expect(focusedSlot()).toBe("semantic-selection-clear");

	act(() => {
		fireEvent.click(clear);
	});
	await settle();
	expect(focusedSlot()).toBe("semantic-sidebar-toggle");
});

test("a tab chosen in a docked sidebar does not turn it into a float when a second pane arrives", async () => {
	await mountPane();
	openSidebarTab("selection");
	await settle();
	changeChromeInShell(SHARED);
	await sidebarSettled();
	expect(column()).toBeNull();
});

test("a presented walkthrough steps the sidebar aside: its control is held, and nothing brings the sidebar back", async () => {
	server.documents["pipeline"] = EXPLAINED_BOARD;
	await mountPane(SHARED);
	await settle();
	driveInShell({ request: "present", walkthrough: "tour", beat: 0 });
	await settle();
	expect(part("semantic-sidebar-toggle").getAttribute("aria-disabled")).toBe("true");
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");

	press("semantic-sidebar-toggle");
	pressSearchShortcut();
	await settle();
	expect(column()).toBeNull();

	// A pick on the picture does not lay a panel over it either, so nothing moves
	// the picture to keep clear of a panel that is not there.
	await pickCard();
	await sidebarSettled();
	expect(column()).toBeNull();

	// Leaving gives the pick its panel.
	act(() => {
		fireEvent.keyDown(document.body, { key: "Escape" });
	});
	await settle();
	expect(placeNow()).toBe("floating");
	expect(part("semantic-sidebar-toggle").hasAttribute("aria-disabled")).toBe(false);
});

test("a pick on the About page lays no panel over the page, and the diagram gives the pick its panel", async () => {
	server.documents["pipeline"] = EXPLAINED_BOARD;
	await mountPane(SHARED);
	await settle();
	openAboutPage();
	await settle();

	act(() => {
		fireEvent.click(document.querySelector("[data-slot='about-part'][data-part='n1']")!);
	});
	await sidebarSettled();
	expect(column()).toBeNull();
	expect(part("semantic-sidebar-toggle").getAttribute("aria-expanded")).toBe("false");

	act(() => {
		fireEvent.click(document.querySelector("[data-slot='board-tab'][data-tab='diagram']")!);
	});
	await settle();
	expect(placeNow()).toBe("floating");
	expect(part("semantic-sidebar").getAttribute("data-tab")).toBe("selection");
});

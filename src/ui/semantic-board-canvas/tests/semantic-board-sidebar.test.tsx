// The sidebar beside a semantic pane: which tab it shows as the user picks
// things out and lets go of them, and that moving between its tabs leaves the
// picture where the user was looking.
//
// What these catch: a pick that leaves the key open and the details out of
// sight, a cleared selection that strands the user on an empty panel, a tab
// the user chose being taken from them, and a tab switch that refits or
// moves the diagram.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	drawing,
	inPicture,
	mountStage,
	openSidebarTab,
	part,
	server,
	settle,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
import { cameraNow, pressKey } from "@/ui/semantic-board-canvas/tests/camera-probes";

/**
 * Which tab the sidebar has open.
 * @returns The tab.
 */
function openTab(): string | null {
	return part("semantic-sidebar").getAttribute("data-tab");
}

/**
 * Pick the card out the way a user does, in a pane that holds its selection.
 */
function pickCard(): void {
	act(() => {
		fireEvent.click(inPicture("card"));
	});
}

test("picking something out opens the selection, and letting go gives back the tab that was open", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { live: true });
	await settle();
	expect(openTab()).toBe("board");
	expect(part("semantic-board-panel")).not.toBeNull();

	pickCard();
	await settle();
	expect(openTab()).toBe("selection");
	expect(part("semantic-inspector")).not.toBeNull();

	act(() => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await settle();
	expect(openTab()).toBe("board");
});

test("a tab the user chooses while something is selected stays theirs until they pick again", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { live: true });
	await settle();
	pickCard();
	await settle();
	openSidebarTab("board");
	await settle();
	expect(openTab()).toBe("board");

	// Letting go leaves them where they are.
	act(() => {
		fireEvent.keyDown(viewport(), { key: "Escape" });
	});
	await settle();
	expect(openTab()).toBe("board");

	// A new pick is a new request to be told about something.
	pickCard();
	await settle();
	expect(openTab()).toBe("selection");
});

test("moving between tabs leaves the picture where the user was looking", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { live: true });
	await settle();
	pressKey("ArrowLeft");
	const before = cameraNow();
	openSidebarTab("selection");
	await settle();
	openSidebarTab("board");
	await settle();
	pickCard();
	await settle();
	expect(cameraNow()).toEqual(before);
});

/**
 * The panel of the tab that is open, which scrolls.
 * @returns The panel.
 */
function openPanel(): HTMLElement {
	return (
		part("semantic-sidebar-panel").querySelector<HTMLElement>("[data-slot='tabs-content']") ??
		part("semantic-sidebar-panel")
	);
}

test("a new pick opens the selection at its top", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { live: true });
	await settle();
	pickCard();
	await settle();
	openPanel().scrollTop = 120;
	expect(openPanel().scrollTop).toBe(120);

	act(() => {
		fireEvent.click(inPicture("wire"));
	});
	await settle();
	expect(openPanel().scrollTop).toBe(0);
});

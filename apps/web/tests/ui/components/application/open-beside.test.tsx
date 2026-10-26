// A proposal opened beside, from the About page or the navigator, is read
// through the view of the pane it was opened from (TASK-538.04). With one pane
// the second opens; with two, the pane beside is replaced and no pane is added.
//
// What the panes report to the server is what is checked, because that is what
// an agent is told each pane reads (ADR 0023).

import { expect, test } from "bun:test";

import {
	FakeSocket,
	act,
	fireEvent,
	paneShowing,
	settle,
	settleUntil,
} from "#tests/ui/support/application/application-page.ts";
import {
	QUERIES,
	chooseViewIn,
	draws,
	pane,
	viewsRead,
} from "#tests/ui/support/application/shop-panes.ts";

/**
 * Open a variant beside from one pane's About page, the way a person does.
 * @param paneId The pane.
 * @param name The variant's name.
 */
async function openBesideFromAbout(paneId: string, name: string): Promise<void> {
	const tab = pane(paneId)!.querySelector("[data-slot='board-tab'][data-tab='about']")!;
	act(() => {
		fireEvent.mouseDown(tab, { button: 0 });
		fireEvent.click(tab);
	});
	await settleUntil(() => besideControl(paneId, name) !== null);
	act(() => {
		fireEvent.click(besideControl(paneId, name)!);
	});
	await settle();
}

/**
 * The Open beside control of one variant on one pane's About page.
 * @param paneId The pane.
 * @param name The variant's name.
 * @returns The control, or null while the page does not offer it.
 */
function besideControl(paneId: string, name: string): Element | null {
	return (
		pane(paneId)?.querySelector(`[data-slot='variant-beside'][aria-label='Open ${name} beside']`) ??
		null
	);
}

/**
 * The second pane's socket, opened, once the page has made it.
 * @param made How many sockets the page had made before.
 */
async function secondPaneOpens(made: number): Promise<void> {
	await settleUntil(() => FakeSocket.made.length > made);
	act(() => FakeSocket.made.at(-1)!.open());
	await settle();
}

test("the About page opens a proposal beside through the view on screen, and the next one replaces the pane beside", async () => {
	await paneShowing("shop");
	await chooseViewIn("A", QUERIES.id);
	const made = FakeSocket.made.length;
	await openBesideFromAbout("A", "Returns desk");
	await secondPaneOpens(made);
	await settleUntil(() => draws("B", "shop@v2"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });

	// A shelved variant takes the pane beside, and no pane is added.
	await openBesideFromAbout("A", "Gift wrap");
	await settleUntil(() => draws("B", "shop@v3"));
	expect(FakeSocket.made.length).toBe(made + 1);
	expect(document.querySelectorAll("[data-slot='pane-stage']")).toHaveLength(2);
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
});

test("Alt on a navigator row opens a proposal beside through the view of the active pane", async () => {
	await paneShowing("shop");
	await chooseViewIn("A", QUERIES.id);
	const made = FakeSocket.made.length;
	const row = [...document.querySelectorAll("[data-row-kind='variant']")].find((one) =>
		one.textContent.includes("Returns desk"),
	);
	act(() => {
		row!.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
	});
	await secondPaneOpens(made);
	await settleUntil(() => draws("B", "shop@v2"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
});

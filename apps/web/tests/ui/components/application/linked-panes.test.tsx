// Two panes on one board are linked (TASK-538.02): a part picked in one is
// picked in the other, and letting go clears both. Only the pane the person
// picked in says that the person changed it (ADR 0034). A drill-down ends the
// link, and the pane it leaves behind keeps its pick. A pane whose variant lacks
// the part names the variant beside that holds it.
//
// A view chosen in one linked pane is read in both, as one history entry, and
// Back reads each pane as it was (TASK-538.03). A pane that drilled into the
// board beside it keeps the view of its own level.
//
// What the panes report to the server is what is checked, because that is what
// an agent is told each pane reads (ADR 0023).

import { expect, test } from "bun:test";

import {
	act,
	fireEvent,
	settle,
	settleUntil,
} from "#tests/ui/support/application/application-page.ts";
import {
	QUERIES,
	chooseViewIn,
	draws,
	onScreen,
	pane,
	pointAt,
	readings,
	twoPanes,
	viewsRead,
} from "#tests/ui/support/application/shop-panes.ts";

/**
 * Pick a part out in one pane, the way a person does.
 * @param paneId The pane.
 * @param id The part.
 */
async function pickIn(paneId: string, id: string): Promise<void> {
	const card = pane(paneId)?.querySelector(`[data-semantic-id='${id}']`);
	if (card == null) throw new Error(`Pane ${paneId} draws no ${id}.`);
	const at = { pointerId: 1, button: 0, clientX: 5, clientY: 5 };
	await act(async () => {
		fireEvent.pointerDown(card, at);
		fireEvent.pointerUp(card, at);
		fireEvent.click(card, at);
	});
	await settle();
}

/**
 * Go back the way a person does.
 */
async function goBack(): Promise<void> {
	act(() => {
		window.history.back();
	});
	await settle();
}

/**
 * What one pane last reported, once its reports have settled.
 * @param paneId The pane.
 * @returns What it picked and whether the person's hand changed that, or null before any report.
 */
async function reported(paneId: string): Promise<{ picked: string[]; byHand: boolean } | null> {
	await settleUntil(() => false, 12);
	const last = readings.findLast((one) => one.paneId === paneId);
	return last === undefined
		? null
		: {
				picked: last.selection.map((subject) => subject.id),
				byHand: last.byUser?.includes("selection") ?? false,
			};
}

test("a part picked in one linked pane is picked in the other, only the picking pane says the person did it, and letting go clears both", async () => {
	await twoPanes();
	await pickIn("A", "pay");
	expect(await reported("A")).toEqual({ picked: ["pay"], byHand: true });
	expect(await reported("B")).toEqual({ picked: ["pay"], byHand: false });

	act(() => {
		fireEvent.keyDown(pane("B")!.querySelector("[data-slot='semantic-board-viewport']")!, {
			key: "Escape",
		});
	});
	expect(await reported("B")).toEqual({ picked: [], byHand: true });
	expect(await reported("A")).toEqual({ picked: [], byHand: false });
});

test("a drill-down ends the link, and the pane left behind keeps its pick", async () => {
	await twoPanes();
	await pickIn("A", "ord");
	act(() => {
		fireEvent.doubleClick(pane("A")!.querySelector("[data-semantic-id='ord'] rect")!);
	});
	await settleUntil(() => onScreen("A") === "orders");
	expect((await reported("B"))?.picked).toEqual(["ord"]);

	await pickIn("B", "pay");
	expect((await reported("B"))?.picked).toEqual(["pay"]);
	expect((await reported("A"))?.picked).toEqual([]);
});

test("a pane whose variant lacks the part picked beside it names the variant that holds it", async () => {
	await twoPanes();
	await pickIn("B", "ref");
	expect((await reported("A"))?.picked).toEqual(["ref"]);
	const inspector = pane("A")?.querySelector("[data-slot='semantic-inspector']");
	expect(inspector?.getAttribute("data-subject")).toBe("unknown");
	expect(inspector?.textContent).toContain("Returns desk");
});

test("a view chosen in one linked pane is read in both, as one history entry, and Back reads both as they were", async () => {
	await twoPanes();
	const before = window.history.length;
	await chooseViewIn("A", QUERIES.id);
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
	expect(window.history.length).toBe(before + 1);
	const address = new URLSearchParams(window.location.search);
	expect([address.get("viewA"), address.get("viewB")]).toEqual([QUERIES.id, QUERIES.id]);

	await goBack();
	expect(await viewsRead()).toEqual({ A: null, B: null });
});

test("Back reads each linked pane through the view it read before, not the other pane's", async () => {
	const { b } = await twoPanes("shop", "orders");
	await chooseViewIn("A", "Everything");
	// The proposal opened beside the view pane A reads, and the panes are linked.
	pointAt(b, "shop@v2");
	await settleUntil(() => draws("B", "shop@v2"));
	await chooseViewIn("A", QUERIES.id);
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });

	await goBack();
	expect(await viewsRead()).toEqual({ A: "Everything", B: null });
});

test("a pane that drilled into the board beside it keeps the view of its own level", async () => {
	await twoPanes("orders", "shop");
	await chooseViewIn("B", QUERIES.id);
	act(() => {
		fireEvent.doubleClick(pane("B")!.querySelector("[data-semantic-id='ord'] rect")!);
	});
	await settleUntil(() => onScreen("B") === "orders");
	// Both read the orders board now, and are linked: a view chosen at the drilled level stays there.
	await chooseViewIn("B", "Everything");
	expect(await viewsRead()).toEqual({ A: null, B: "Everything" });

	// And a view chosen beside it does not reach the board it was opened on.
	await chooseViewIn("A", "Everything");
	act(() => {
		fireEvent.click([...pane("B")!.querySelectorAll("[data-slot='pane-crumb']")].at(-1)!);
	});
	await settleUntil(() => onScreen("B") === "shop");
	expect((await viewsRead()).B).toBe(QUERIES.id);
});

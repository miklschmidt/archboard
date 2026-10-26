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

import { expect, jest, test } from "bun:test";

import { PANE_MS } from "@archboard/timing";

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
function pickNow(paneId: string, id: string): void {
	const card = pane(paneId)?.querySelector(`[data-semantic-id='${id}']`);
	if (card == null) throw new Error(`Pane ${paneId} draws no ${id}.`);
	const at = { pointerId: 1, button: 0, clientX: 5, clientY: 5 };
	act(() => {
		fireEvent.pointerDown(card, at);
		fireEvent.pointerUp(card, at);
		fireEvent.click(card, at);
	});
}

/**
 * Pick a part and let the page settle.
 * @param paneId The pane.
 * @param id The part.
 */
async function pickIn(paneId: string, id: string): Promise<void> {
	pickNow(paneId, id);
	await settle();
}

/**
 * Apply two gestures before the report timer can publish either one.
 * @param gestures The gestures.
 */
async function beforeReport(gestures: () => void): Promise<void> {
	jest.useFakeTimers();
	try {
		await act(async () => {
			gestures();
		});
		await act(async () => {
			jest.advanceTimersByTime(PANE_MS.selectionDebounce);
		});
	} finally {
		jest.useRealTimers();
	}
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
 * Step through a question in one pane, without choosing a view by hand.
 * @param paneId The pane.
 * @param part The answer's subject.
 */
async function stepIn(paneId: string, part: string): Promise<void> {
	const selector = `[data-slot='semantic-board-question-result'][data-part='${part}']`;
	if (pane(paneId)!.querySelector(selector) === null) {
		act(() => {
			const boardTab = pane(paneId)!.querySelector(
				"[data-slot='semantic-sidebar-tab'][data-tab='board']",
			);
			fireEvent.click(
				boardTab ?? pane(paneId)!.querySelector("[data-slot='semantic-sidebar-toggle']")!,
			);
		});
		await settleUntil(() => pane(paneId)!.querySelector(selector) !== null);
	}
	act(() => {
		fireEvent.click(pane(paneId)!.querySelector(selector)!);
	});
	await settle();
}

/**
 * The subjects that carry an attention class in one pane's picture.
 * @param paneId The pane.
 * @param mark The attention class.
 * @returns Their ids, sorted.
 */
function attendedIn(paneId: string, mark: "is-selected" | "is-lit"): string[] {
	const surface = pane(paneId)!.querySelector("[data-slot='semantic-board-surface']")!;
	return [...surface.querySelectorAll(`[data-semantic-id].${mark}`)]
		.map((subject) => subject.getAttribute("data-semantic-id")!)
		.toSorted();
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

test("a question step opens Everything only in its own pane, without a view gesture or history entry", async () => {
	await twoPanes();
	const before = window.history.length;
	readings.length = 0;
	await stepIn("A", "charge");
	expect(await viewsRead()).toEqual({ A: "Everything", B: null });
	expect(window.history.length).toBe(before);
	const address = new URLSearchParams(window.location.search);
	expect([address.get("viewA"), address.get("viewB")]).toEqual(["Everything", null]);
	expect(readings.some((reading) => reading.byUser?.includes("view"))).toBe(false);
});

test("a linked pick takes each pane's answer light and letting go restores each pane's own step", async () => {
	await twoPanes();
	await stepIn("A", "charge");
	await stepIn("B", "refund");
	await viewsRead();
	const before = { address: window.location.search, history: window.history.length };
	const lights = { A: attendedIn("A", "is-lit"), B: attendedIn("B", "is-lit") };
	expect(attendedIn("A", "is-selected")).toEqual(["charge"]);
	expect(attendedIn("B", "is-selected")).toEqual(["refund"]);
	expect(lights.A).not.toEqual(lights.B);
	readings.length = 0;
	await pickIn("B", "pay");
	expect(await reported("A")).toEqual({ picked: ["pay"], byHand: false });
	expect(await reported("B")).toEqual({ picked: ["pay"], byHand: true });
	expect(attendedIn("A", "is-selected")).toEqual(["pay"]);
	expect(attendedIn("B", "is-selected")).toEqual(["pay"]);
	expect(attendedIn("A", "is-lit")).not.toEqual(lights.A);
	act(() => {
		fireEvent.keyDown(pane("B")!.querySelector("[data-slot='semantic-board-viewport']")!, {
			key: "Escape",
		});
	});
	expect(await reported("A")).toEqual({ picked: [], byHand: false });
	expect(await reported("B")).toEqual({ picked: [], byHand: true });
	expect(attendedIn("A", "is-selected")).toEqual(["charge"]);
	expect(attendedIn("B", "is-selected")).toEqual(["refund"]);
	expect(attendedIn("A", "is-lit")).toEqual(lights.A);
	expect(attendedIn("B", "is-lit")).toEqual(lights.B);
	expect({ address: window.location.search, history: window.history.length }).toEqual(before);
});

test("a question step does not claim a later linked pick as its pane's own gesture", async () => {
	await twoPanes();
	await chooseViewIn("A", "Everything");
	await viewsRead();
	await stepIn("A", "charge");
	await viewsRead();
	readings.length = 0;
	await pickIn("B", "pay");
	expect(await reported("A")).toEqual({ picked: ["pay"], byHand: false });
	expect(await reported("B")).toEqual({ picked: ["pay"], byHand: true });
});

test("a no-op view choice does not label a later question reveal as a view gesture", async () => {
	await twoPanes();
	await viewsRead();
	await chooseViewIn("A", "");
	await viewsRead();
	readings.length = 0;
	await stepIn("A", "charge");
	await viewsRead();
	expect(readings.some((reading) => reading.byUser?.includes("view"))).toBe(false);
});

test("a linked pick that overtakes a local pick reports only its own pane's gesture", async () => {
	await twoPanes();
	await stepIn("A", "charge");
	await viewsRead();
	readings.length = 0;
	await beforeReport(() => {
		pickNow("A", "ord");
		pickNow("B", "pay");
	});
	expect(await reported("A")).toEqual({ picked: ["pay"], byHand: false });
	expect(await reported("B")).toEqual({ picked: ["pay"], byHand: true });
});

test("a linked view that overtakes a local view reports only its own pane's gesture", async () => {
	await twoPanes();
	await chooseViewIn("A", "Everything");
	await viewsRead();
	await stepIn("A", "charge");
	await viewsRead();
	act(() => {
		fireEvent.click(pane("B")!.querySelector("[data-slot='semantic-sidebar-toggle']")!);
	});
	await settle();
	readings.length = 0;
	await beforeReport(() => {
		fireEvent.click(
			pane("A")!.querySelector(
				`[data-slot='semantic-view-choice'][data-semantic-view='${QUERIES.id}']`,
			)!,
		);
		fireEvent.click(
			pane("B")!.querySelector("[data-slot='semantic-view-choice'][data-semantic-view='']")!,
		);
	});
	expect(await viewsRead()).toEqual({ A: null, B: null });
	expect(readings.findLast((reading) => reading.paneId === "A")?.byUser ?? []).not.toContain(
		"view",
	);
	expect(readings.findLast((reading) => reading.paneId === "B")?.byUser).toContain("view");
});

test("linked views and Back keep pane-local answer steps, and closing one pane keeps the other's attention", async () => {
	const { b } = await twoPanes();
	await stepIn("A", "charge");
	const before = window.history.length;
	await chooseViewIn("A", QUERIES.id);
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
	expect(window.history.length).toBe(before + 1);
	await goBack();
	expect(await viewsRead()).toEqual({ A: "Everything", B: null });
	expect(attendedIn("A", "is-selected")).toEqual(["charge"]);
	expect(attendedIn("B", "is-selected")).toEqual([]);
	act(() => b.say({ type: "pane_close" }));
	await settleUntil(() => pane("B") === null);
	expect(pane("B")).toBeNull();
	expect(attendedIn("A", "is-selected")).toEqual(["charge"]);
});

test("a drill-down drops only its pane's answer step, and returning does not revive it", async () => {
	await twoPanes();
	await stepIn("A", "charge");
	await stepIn("B", "refund");
	await viewsRead();
	await pickIn("A", "ord");
	act(() => {
		fireEvent.doubleClick(pane("A")!.querySelector("[data-semantic-id='ord'] rect")!);
	});
	await settleUntil(() => onScreen("A") === "orders");
	expect((await reported("B"))?.picked).toEqual(["ord"]);
	act(() => {
		fireEvent.keyDown(pane("B")!.querySelector("[data-slot='semantic-board-viewport']")!, {
			key: "Escape",
		});
	});
	await settle();
	expect(attendedIn("B", "is-selected")).toEqual(["refund"]);
	act(() => {
		fireEvent.click([...pane("A")!.querySelectorAll("[data-slot='pane-crumb']")].at(-1)!);
	});
	await settleUntil(() => onScreen("A") === "shop");
	expect(attendedIn("A", "is-selected")).toEqual([]);
	expect(attendedIn("B", "is-selected")).toEqual(["refund"]);
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

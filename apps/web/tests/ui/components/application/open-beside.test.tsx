// A proposal opened beside, from the About page or the navigator, is read
// through the view of the pane it was opened from (TASK-538.04). With one pane
// the second opens on the board, which its socket names so the server starts it
// there, as one history entry that Back undoes (TASK-550). With two, the pane
// beside is replaced and no pane is added.
//
// What the panes report to the server is what is checked, because that is what
// an agent is told each pane reads (ADR 0023).

import { afterEach, expect, spyOn, test, type Mock } from "bun:test";

import {
	FakeSocket,
	act,
	answer,
	fireEvent,
	paneShowing,
	server,
	settle,
	settleUntil,
} from "#tests/ui/support/application/application-page.ts";
import {
	QUERIES,
	chooseViewIn,
	draws,
	pane,
	pointAt,
	readings,
	twoPanes,
	viewsRead,
} from "#tests/ui/support/application/shop-panes.ts";

/** Every address the page writes, pushed or replaced, while a test watches. */
const written: URLSearchParams[] = [];
/** The watches on the history, which each test lets go. */
const watches: Mock<History["pushState"]>[] = [];

/** Watch the addresses the page writes from here on. */
function watchAddresses(): void {
	for (const method of ["pushState", "replaceState"] as const) {
		const write = window.history[method].bind(window.history);
		const watch = spyOn(window.history, method).mockImplementation((state, title, url) => {
			written.push(new URL(String(url), window.location.href).searchParams);
			write(state, title, url);
		});
		watches.push(watch);
	}
}

afterEach(() => {
	for (const watch of watches.splice(0)) watch.mockRestore();
	written.length = 0;
});

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
 * The second pane's socket, once the page has made it, opened and started as the
 * server starts it: on the board it names, else on the board in front of the person.
 * @param made How many sockets the page had made before.
 * @returns The board the socket named, or null.
 */
async function secondPaneStarts(made: number): Promise<string | null> {
	await settleUntil(() => FakeSocket.made.length > made);
	const socket = FakeSocket.made.at(-1)!;
	act(() => socket.open());
	await settle();
	const named = new URL(socket.url).searchParams.get("board");
	pointAt(socket, named ?? "shop");
	return named;
}

test("with one pane, the About page opens a proposal beside on its board through the view on screen, as one history entry that Back undoes", async () => {
	await paneShowing("shop");
	await chooseViewIn("A", QUERIES.id);
	const made = FakeSocket.made.length;
	const before = window.history.length;
	watchAddresses();
	await openBesideFromAbout("A", "Returns desk");
	expect(await secondPaneStarts(made)).toBe("shop@v2");
	await settleUntil(() => draws("B", "shop@v2"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
	// The person chose the board, so the pane says so, as a board shown by hand does (ADR 0034).
	const reportsOfB = readings.filter((one) => one.paneId === "B");
	expect(reportsOfB.some((one) => one.byUser?.includes("board") === true)).toBe(true);

	expect(window.history.length).toBe(before + 1);
	// No address names the pane beside on another board, or as the active pane.
	const naming = written.filter((address) => address.has("paneB"));
	expect(naming.map((address) => [address.get("paneB"), address.get("pane")])).toContainEqual([
		"shop@v2",
		null,
	]);
	expect(naming.every((address) => address.get("paneB") === "shop@v2")).toBe(true);
	expect(naming.every((address) => address.get("pane") === null)).toBe(true);

	act(() => {
		window.history.back();
	});
	await settleUntil(() => pane("B") === null);
	expect(new URLSearchParams(window.location.search).get("viewA")).toBe(QUERIES.id);
	expect((await viewsRead()).A).toBe(QUERIES.id);
});

test("with two panes, a shelved variant opened beside replaces the pane beside, as one history entry, and adds no pane", async () => {
	await twoPanes();
	await chooseViewIn("A", QUERIES.id);
	const made = FakeSocket.made.length;
	const before = window.history.length;
	await openBesideFromAbout("A", "Gift wrap");
	await settleUntil(() => draws("B", "shop@v3"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
	expect(FakeSocket.made.length).toBe(made);
	expect(document.querySelectorAll("[data-slot='pane-stage']")).toHaveLength(2);
	expect(window.history.length).toBe(before + 1);
});

test("Alt on a navigator row opens a proposal beside on its board through the view of the active pane", async () => {
	await paneShowing("shop");
	await chooseViewIn("A", QUERIES.id);
	const made = FakeSocket.made.length;
	const row = [...document.querySelectorAll("[data-row-kind='variant']")].find((one) =>
		one.textContent.includes("Returns desk"),
	);
	act(() => {
		row!.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
	});
	expect(await secondPaneStarts(made)).toBe("shop@v2");
	await settleUntil(() => draws("B", "shop@v2"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: QUERIES.id });
});

test("a refused open beside keeps the other pane's view and address", async () => {
	const { b } = await twoPanes("shop", "orders");
	await chooseViewIn("A", QUERIES.id);
	pointAt(b, "shop@v2");
	await settleUntil(() => draws("B", "shop@v2"));
	expect(await viewsRead()).toEqual({ A: QUERIES.id, B: null });
	const before = window.location.search;
	const answering = server.answering;
	/**
	 * Refuse the show without moving the pane.
	 * @param url The route.
	 * @param init The request.
	 * @returns The refusal, or the fixture's normal answer.
	 */
	server.answering = function refuseShow(url, init) {
		return url.pathname === "/api/panes/show"
			? answer({ success: false, error: "The variant is unavailable." }, 404)
			: answering(url, init);
	};
	try {
		await openBesideFromAbout("A", "Gift wrap");
		expect(await viewsRead()).toEqual({ A: QUERIES.id, B: null });
		expect(draws("B", "shop@v2")).toBe(true);
		expect(window.location.search).toBe(before);
	} finally {
		server.answering = answering;
	}
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, createElement, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { BoardCatalog, ScratchBoards } from "@/ui/board-catalog";
import type { MountedPreviewSnapshot, PreviewSource } from "@/ui/board-preview";
import { fakeServer, mountedScene, type FakeServer } from "@/ui/board-catalog/tests/fake-server";

// The catalog's interface reaches Excalidraw through the preview card, whose
// exporter wants a real canvas as it loads. Nothing here draws a card, so the
// one function that graph uses is stood in for and the document is registered
// before the interface is taken, rather than above with the static imports.
GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

await mock.module("@excalidraw/excalidraw", () => ({
	/** Never called: no card is drawn in this owner. */
	exportToSvg: (): never => {
		throw new Error("A preview was exported where none should be.");
	},
}));

const { BoardCatalogProvider, useBoardCatalog, useBoardPreviewSource, useScratchBoards } =
	await import("@/ui/board-catalog");

/**
 * One turn of the event loop.
 * @returns Settles on the next tick.
 */
async function tick(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Let the answers in flight, and the reads they start, reach the probe. The
 * cache answers on real promises and tells its subscribers on a timer, so this
 * waits on the loop rather than on microtasks alone.
 * @returns Settles once the probe has re-rendered over whatever arrived.
 */
async function settle(): Promise<void> {
	await act(async () => {
		await tick();
		await tick();
		await tick();
	});
}

/** What the probe is told to ask about. */
interface ProbeView {
	boardKey: string;
	mounted: MountedPreviewSnapshot | null;
	held: boolean;
}

/** What one render of the probe saw. */
interface ProbeFrame {
	catalog: BoardCatalog;
	source: PreviewSource | null;
	scratch: ScratchBoards;
}

/** Inputs for the probe. */
interface ProbeProps extends ProbeView {
	scratchBoards: readonly string[];
	frames: ProbeFrame[];
}

/**
 * A consumer of the catalog's public hooks that records what they answered.
 * @param props What to ask about and where to record it.
 * @returns Nothing rendered; the frames are the observation.
 */
function CatalogProbe(props: ProbeProps): JSX.Element | null {
	const catalog = useBoardCatalog();
	const source = useBoardPreviewSource({
		boardKey: props.boardKey,
		mounted: props.mounted,
		held: props.held,
	});
	const scratch = useScratchBoards(props.scratchBoards);
	props.frames.push({ catalog, source, scratch });
	return null;
}

/** A mounted probe and what it has seen. */
interface Mounted {
	readonly frames: ProbeFrame[];
	readonly show: (view: ProbeView) => Promise<void>;
	readonly close: () => Promise<void>;
}

const FIRST_VIEW: ProbeView = { boardKey: "Checkout", mounted: null, held: false };

/** The open boards whose name state the probe asks about. */
const SCRATCH_BOARDS: readonly string[] = ["Draft"];

/**
 * Mount the probe under a real provider, with this product's read defaults.
 * @returns The mounted probe.
 */
function mount(): Mounted {
	const container = document.createElement("div");
	document.body.append(container);
	const root: Root = createRoot(container);
	const frames: ProbeFrame[] = [];
	/**
	 * Render the probe over one view and let the cache settle.
	 * @param view What to ask about.
	 */
	async function show(view: ProbeView): Promise<void> {
		await act(async () => {
			root.render(
				createElement(
					BoardCatalogProvider,
					null,
					createElement(CatalogProbe, {
						...view,
						scratchBoards: SCRATCH_BOARDS,
						frames,
						key: "probe",
					}),
				),
			);
		});
		await settle();
	}
	/** Unmount and remove the container. */
	async function close(): Promise<void> {
		await act(async () => root.unmount());
		container.remove();
	}
	return { frames, show, close };
}

/**
 * The latest frame the probe recorded.
 * @param mounted The mounted probe.
 * @returns The frame.
 */
function latest(mounted: Mounted): ProbeFrame {
	const frame = mounted.frames.at(-1);
	if (frame === undefined) {
		throw new Error("The probe rendered nothing.");
	}
	return frame;
}

/**
 * Run one of the catalog's invalidations and let the reads it starts settle.
 * @param mounted The mounted probe.
 * @param invalidate What to call on the catalog.
 */
async function invalidateWith(
	mounted: Mounted,
	invalidate: (catalog: BoardCatalog) => void,
): Promise<void> {
	await act(async () => {
		invalidate(latest(mounted).catalog);
	});
	await settle();
}

let server: FakeServer;

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

beforeEach(() => {
	server = fakeServer();
});

afterEach(() => {
	server.restore();
});

describe("the board cache over a real server boundary", () => {
	test("reads each resource once and again only when something invalidates it", async () => {
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			expect(latest(mounted).catalog.listing.boards.map((board) => board.key)).toEqual([
				"Checkout",
			]);
			expect(latest(mounted).catalog.listing.open.map((board) => board.key)).toEqual(["Draft"]);
			expect(latest(mounted).catalog.loading).toBe(false);
			expect(server.reads("/api/boards")).toBe(1);
			expect(server.reads("/api/panes")).toBe(1);

			// A render that changes nothing is not a read: the answer is still fresh.
			await mounted.show(FIRST_VIEW);
			expect(server.reads("/api/boards")).toBe(1);

			server.addBoard("Billing");
			await invalidateWith(mounted, (catalog) => catalog.refresh());
			expect(server.reads("/api/boards")).toBe(2);
			expect(server.reads("/api/panes")).toBe(2);
			expect(latest(mounted).catalog.listing.boards.map((board) => board.key)).toEqual([
				"Checkout",
				"Billing",
			]);
		} finally {
			await mounted.close();
		}
	});

	test("a vault that cannot be read says so without retrying, and recovers", async () => {
		server.fail("/api/boards", "the vault is unreadable");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			expect(latest(mounted).catalog.error).toContain("The board listing could not be read");
			expect(latest(mounted).catalog.error).toContain("the vault is unreadable");
			// One attempt, not three: a refusal from this machine is a fact.
			expect(server.reads("/api/boards")).toBe(1);

			server.recover("/api/boards");
			await invalidateWith(mounted, (catalog) => catalog.reload());
			expect(latest(mounted).catalog.error).toBeNull();
			expect(latest(mounted).catalog.listing.boards).toHaveLength(1);
		} finally {
			await mounted.close();
		}
	});

	test("a pane inventory that cannot be read leaves the vault's boards listed", async () => {
		server.fail("/api/panes", "the panes are unreadable");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			const { catalog } = latest(mounted);
			expect(catalog.listing.boards.map((board) => board.key)).toEqual(["Checkout"]);
			expect(catalog.listing.open).toEqual([]);
			expect(catalog.error).toContain("The open boards could not be read");
			expect(catalog.loading).toBe(false);
		} finally {
			await mounted.close();
		}
	});

	test("a snapshot that answers after a pane took the board does not replace its scene", async () => {
		const held = server.defer("/api/boards/preview");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			expect(latest(mounted).source).toBeNull();

			// The pane adopts the board while that read is still in flight.
			const scene = mountedScene("Checkout");
			await mounted.show({ boardKey: "Checkout", mounted: scene, held: true });
			await act(async () => held.answer());
			await settle();
			expect(latest(mounted).source).toBe(scene);

			// The late answer was kept, and is what depicts the board once no pane
			// holds it. Nothing was read again for it.
			await mounted.show(FIRST_VIEW);
			expect(latest(mounted).source?.fingerprint).toBe("server-1");
			expect(server.reads("/api/boards/preview")).toBe(1);
		} finally {
			await mounted.close();
		}
	});

	test("an event during a first read still forces an answer from after it", async () => {
		const vault = server.defer("/api/boards");
		const preview = server.defer("/api/boards/preview");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			// Both reads are on the wire with nothing in the cache behind them.
			expect(latest(mounted).catalog.loading).toBe(true);

			// The vault gains a board and the previewed board is redrawn, and the
			// events that say so arrive while those first reads are still out.
			server.addBoard("Billing");
			server.redrawBoard();
			await invalidateWith(mounted, (catalog) => catalog.boardsChanged(["Checkout"]));
			await act(async () => {
				vault.answer();
				preview.answer();
			});
			await settle();

			// The answers those reads carried were decided before the events, so
			// neither is allowed to settle as what the shell shows.
			expect(latest(mounted).catalog.listing.boards.map((board) => board.key)).toEqual([
				"Checkout",
				"Billing",
			]);
			expect(latest(mounted).source?.fingerprint).toBe("server-2");
			expect(server.reads("/api/boards")).toBe(2);
			expect(server.reads("/api/boards/preview")).toBe(2);
		} finally {
			await mounted.close();
		}
	});

	test("a burst of events during one first read converges on one more read", async () => {
		const vault = server.defer("/api/boards");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			server.addBoard("Billing");
			await invalidateWith(mounted, (catalog) => {
				catalog.refresh();
				catalog.refresh();
				catalog.refresh();
			});
			await act(async () => vault.answer());
			await settle();
			expect(latest(mounted).catalog.listing.boards).toHaveLength(2);
			// Bounded: the reads settle rather than chasing each other.
			expect(server.reads("/api/boards")).toBe(2);
			expect(latest(mounted).catalog.error).toBeNull();
		} finally {
			await mounted.close();
		}
	});

	test("a name state that could not be read is withheld, said, and recovered by a refresh", async () => {
		server.fail("/api/boards/info", "the board could not be read");
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			// No affordance is offered for a board nobody could ask about, and the
			// navigator is told how many there were rather than quietly omitting it.
			expect([...latest(mounted).scratch.keys]).toEqual([]);
			expect(latest(mounted).scratch.unreadable).toBe(1);
			expect(server.reads("/api/boards/info")).toBe(1);
			// The vault is untouched by it.
			expect(latest(mounted).catalog.error).toBeNull();
			expect(latest(mounted).catalog.listing.boards).toHaveLength(1);

			// The navigator refresh is the recovery, and it reaches this read too.
			server.recover("/api/boards/info");
			await invalidateWith(mounted, (catalog) => catalog.reload());
			expect(server.reads("/api/boards/info")).toBe(2);
			expect([...latest(mounted).scratch.keys]).toEqual(["Draft"]);
			expect(latest(mounted).scratch.unreadable).toBe(0);
		} finally {
			await mounted.close();
		}
	});

	test("a board an agent settled on is depicted from what the server holds now", async () => {
		const mounted = mount();
		try {
			await mounted.show(FIRST_VIEW);
			expect(latest(mounted).source?.fingerprint).toBe("server-1");

			server.redrawBoard();
			await invalidateWith(mounted, (catalog) => catalog.boardsChanged(["Checkout"]));
			expect(server.reads("/api/boards/preview")).toBe(2);
			expect(latest(mounted).source?.fingerprint).toBe("server-2");

			// A board nothing said anything about is not read again.
			await invalidateWith(mounted, (catalog) => catalog.boardsChanged(["Billing"]));
			expect(server.reads("/api/boards/preview")).toBe(2);
		} finally {
			await mounted.close();
		}
	});
});

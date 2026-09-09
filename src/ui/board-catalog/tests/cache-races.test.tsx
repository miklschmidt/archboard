import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, createElement, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { BoardCatalog } from "@/ui/board-catalog";
import type { MountedPreviewSnapshot, PreviewSource } from "@/ui/board-preview";
import { fakeServer, mountedScene, type FakeServer } from "@/ui/board-catalog/tests/fake-server";

// The catalog's interface reaches Excalidraw through the preview card, whose
// exporter wants a real canvas as it loads. Nothing here draws a card.
GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

await mock.module("@excalidraw/excalidraw", () => ({
	/** Never called: no card is drawn in this owner. */
	exportToSvg: (): never => {
		throw new Error("A preview was exported where none should be.");
	},
}));

const { BoardCatalogProvider, useBoardCatalog, useBoardPreviewSource } =
	await import("@/ui/board-catalog");

/**
 * One turn of the event loop.
 * @returns Settles on the next tick.
 */
async function tick(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Let what is in flight land and the reads it starts go out.
 * @returns Settles once the probe has re-rendered.
 */
async function settle(): Promise<void> {
	await act(async () => {
		await tick();
		await tick();
		await tick();
	});
}

/** One board the probe is watching. */
interface WatchedBoard {
	boardKey: string;
	mounted: MountedPreviewSnapshot | null;
	held: boolean;
}

/** What one board's preview answered, by board key. */
type Depictions = Record<string, PreviewSource | null>;

/** Inputs for one watched board. */
interface PreviewProbeProps extends WatchedBoard {
	record: (board: string, source: PreviewSource | null) => void;
}

/**
 * One board's preview, recorded.
 * @param props The board and where to record what it answered.
 * @returns Nothing rendered.
 */
function PreviewProbe(props: PreviewProbeProps): JSX.Element | null {
	const source = useBoardPreviewSource({
		boardKey: props.boardKey,
		mounted: props.mounted,
		held: props.held,
	});
	props.record(props.boardKey, source);
	return null;
}

/** Inputs for the probe. */
interface ProbeProps {
	boards: readonly WatchedBoard[];
	record: (board: string, source: PreviewSource | null) => void;
	catalogs: BoardCatalog[];
}

/**
 * The catalog and one preview probe per watched board.
 * @param props The boards and where to record.
 * @returns The probes.
 */
function Probe(props: ProbeProps): JSX.Element {
	props.catalogs.push(useBoardCatalog());
	return createElement(
		"div",
		null,
		props.boards.map((board) =>
			createElement(PreviewProbe, { ...board, record: props.record, key: board.boardKey }),
		),
	);
}

/** A mounted probe and what it has seen. */
interface Mounted {
	readonly depictions: Depictions;
	readonly catalog: () => BoardCatalog;
	readonly watch: (boards: readonly WatchedBoard[]) => Promise<void>;
	readonly close: () => Promise<void>;
}

/**
 * Mount the probe under a real provider.
 * @returns The mounted probe.
 */
function mount(): Mounted {
	const container = document.createElement("div");
	document.body.append(container);
	const root: Root = createRoot(container);
	const depictions: Depictions = {};
	const catalogs: BoardCatalog[] = [];
	/**
	 * Record what one board was depicted by.
	 * @param board The board key.
	 * @param source What it was depicted by.
	 */
	function record(board: string, source: PreviewSource | null): void {
		depictions[board] = source;
	}
	/**
	 * Watch these boards and let the reads it starts go out.
	 * @param boards The boards to watch.
	 */
	async function watch(boards: readonly WatchedBoard[]): Promise<void> {
		await act(async () => {
			root.render(
				createElement(
					BoardCatalogProvider,
					null,
					createElement(Probe, { boards, record, catalogs, key: "probe" }),
				),
			);
		});
		await settle();
	}
	/**
	 * The catalog as it last answered.
	 * @returns The catalog.
	 */
	function catalog(): BoardCatalog {
		const latest = catalogs.at(-1);
		if (latest === undefined) {
			throw new Error("The probe rendered nothing.");
		}
		return latest;
	}
	/** Unmount and remove the container. */
	async function close(): Promise<void> {
		await act(async () => root.unmount());
		container.remove();
	}
	return { depictions, catalog, watch, close };
}

/**
 * One board watched by a pane, or by nobody.
 * @param boardKey The board.
 * @param held Whether a pane holds it.
 * @param mounted The pane's scene, when it has one.
 * @returns The watched board.
 */
function watching(
	boardKey: string,
	held: boolean,
	mounted: MountedPreviewSnapshot | null = null,
): WatchedBoard {
	return { boardKey, held, mounted };
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

describe("what an event has to beat", () => {
	test("a board taken by a pane mid-read is not depicted by the answer that was owed", async () => {
		const previews = server.defer("/api/boards/preview");
		const mounted = mount();
		try {
			await mounted.watch([watching("Checkout", false)]);
			expect(server.reads("/api/boards/preview")).toBe(1);

			// A pane takes the board while that first read is still owed, which
			// stops anything being read for it at all.
			const scene = mountedScene("Checkout");
			await mounted.watch([watching("Checkout", true, scene)]);
			expect(mounted.depictions["Checkout"]).toBe(scene);

			// The board is written and the event says so. Nothing can be read for a
			// board a pane holds, so the invalidation has to survive until one can.
			server.redrawBoard();
			await act(async () => {
				mounted.catalog().boardsChanged(["Checkout"]);
			});
			await act(async () => previews.answer());
			await settle();
			// The pane still depicts it, and the answer that was owed is not what
			// the cache now calls current.
			expect(mounted.depictions["Checkout"]).toBe(scene);

			// The pane lets the board go: what is drawn is read after the write.
			await mounted.watch([watching("Checkout", false)]);
			await settle();
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-2");
		} finally {
			await mounted.close();
		}
	});

	test("an event reaches a board whose first read began after an earlier event", async () => {
		const previews = server.defer("/api/boards/preview");
		const mounted = mount();
		try {
			await mounted.watch([watching("Checkout", false)]);
			server.redrawBoard();
			await act(async () => {
				mounted.catalog().reload();
			});

			// A second board is listed and starts its own first read, after the
			// first event and before the first board's read has answered.
			await mounted.watch([watching("Checkout", false), watching("Billing", false)]);
			server.redrawBoard();
			await act(async () => {
				mounted.catalog().reload();
			});
			await act(async () => previews.answer());
			await settle();

			// Neither board keeps an answer from before the event that named it.
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-3");
			expect(mounted.depictions["Billing"]?.fingerprint).toBe("server-3");
		} finally {
			await mounted.close();
		}
	});

	test("a cancelled read leaves no failure behind and keeps what was already drawn", async () => {
		const mounted = mount();
		try {
			await mounted.watch([watching("Checkout", false)]);
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-1");

			// A refresh over a read that is still out must not blank the card or
			// report a failure: a cancellation is not something a person did.
			const previews = server.defer("/api/boards/preview");
			server.redrawBoard();
			await act(async () => {
				mounted.catalog().reload();
			});
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-1");
			await act(async () => {
				mounted.catalog().reload();
			});
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-1");
			await act(async () => previews.answer());
			await settle();
			expect(mounted.depictions["Checkout"]?.fingerprint).toBe("server-2");
			expect(mounted.catalog().error).toBeNull();
		} finally {
			await mounted.close();
		}
	});
});

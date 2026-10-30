// When a pane asks for a board's locality (ADR 0045): once each time a pick
// subscribes to it, and never on a timer, on the vault check's 5-second poll,
// on a return to the tab or on a reconnect. A walk of a year of Git is work for
// the server, and only somebody picking a part out asks for it. The selection
// tab is drawn again for each pick, so each pick is a new subscription; the
// stage test `semantic-board-history.test.tsx` holds that each pick asks once.
// A pick made while a read runs waits for it, so a person who steps through
// the parts during the first walk does not start the walk again at each part.
//
// The query library decides when it loads whether it runs in a browser, and
// only a browser runs intervals. So this file registers the DOM before it loads
// anything that loads the library, and drives the clock by hand.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, jest, test } from "bun:test";
import { createElement, type JSX } from "react";

import type { LocalityAnswer } from "@archboard/code-intel/history";
import { BOARD_CACHE_MS } from "@archboard/timing";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { QueryClient, QueryClientProvider, QueryObserver, focusManager, onlineManager, useQuery } =
	await import("@tanstack/react-query");
const { act, cleanup, render } = await import("@testing-library/react");
const { localityQuery, vaultCheckQuery } =
	await import("#ui/clients/semantic-board-canvas/reads/queries.ts");
const { readBoardsFrom } = await import("#ui/clients/semantic-board-canvas/reads/board-reads.ts");

afterAll(async () => {
	cleanup();
	jest.useRealTimers();
	await GlobalRegistrator.unregister();
});

/** The vault the pane is in. */
const VAULT = "/work/archboard/.archboard/vault";

/** The answer: one part read, which no commit changed. */
const ANSWER: LocalityAnswer = {
	board: "pipeline",
	version: 1,
	variant: { id: "v1", name: "as it is", lifecycle: "current" },
	periods: [],
	commits: [],
	hotspots: [
		{
			subject: { id: "a", kind: "node", name: "A" },
			repo: "example/pipeline",
			path: "src/a.ts",
			commits: [],
			count: 0,
		},
	],
	coupling: [],
	leftOut: { largeCommits: 0 },
	skipped: [],
};

/** How many times each read was asked. */
const asked = { locality: 0, vaultCheck: 0 };

/** A read the server has not answered yet, while a test holds it. */
let walking: ReturnType<typeof Promise.withResolvers<LocalityAnswer>> | undefined;

readBoardsFrom({
	/**
	 * No board is read here.
	 * @returns Nothing.
	 */
	document: async () => undefined,
	/**
	 * No findings.
	 * @returns No readings.
	 */
	codeFindings: async () => ({ readings: [] }),
	/**
	 * No exposed names.
	 * @returns No reading.
	 */
	exposure: async () => null,
	/**
	 * The vault check, counted: a checker that refuses, which the poll asks again all the same.
	 * @throws {Error} Always.
	 */
	vaultCheck: async () => {
		asked.vaultCheck += 1;
		throw new Error("no checker");
	},
	/**
	 * The locality, counted.
	 * @returns The answer.
	 */
	locality: async () => {
		asked.locality += 1;
		return walking === undefined ? ANSWER : await walking.promise;
	},
});

/**
 * The vault check, polled as every open canvas polls it.
 * @returns Nothing visible.
 */
function Poll(): null {
	useQuery(vaultCheckQuery(VAULT));
	return null;
}

/**
 * One pick's subscription to the board's locality, as the history region holds it.
 * @returns Nothing visible.
 */
function Picked(): null {
	useQuery(localityQuery({ vault: VAULT, board: "pipeline", variant: "v1", version: 1 }));
	return null;
}

/**
 * The poll, and the subscription of the pick on screen, drawn again for each pick.
 * @param props Which pick is on screen.
 * @param props.pick A number for each pick, or null for none.
 * @returns The tree.
 */
function Pane(props: { readonly pick: number | null }): JSX.Element {
	return createElement(
		"div",
		null,
		createElement(Poll),
		props.pick === null ? null : createElement(Picked, { key: props.pick }),
	);
}

/**
 * Mount the pane with nothing picked, and a way to pick.
 * @param client The query cache of the tab.
 * @returns How to pick a part out, or let go, and how to unmount.
 */
function mountPane(client: InstanceType<typeof QueryClient>): {
	readonly choose: (pick: number | null) => Promise<void>;
	readonly unmount: () => void;
} {
	/**
	 * The tab's tree with one pick on screen.
	 * @param pick A number for each pick, or null for none.
	 * @returns The tree.
	 */
	function tree(pick: number | null): JSX.Element {
		return createElement(QueryClientProvider, { client }, createElement(Pane, { pick }));
	}
	const mounted = render(tree(null));
	return {
		/**
		 * Pick a part out, or let go.
		 * @param pick A number for each pick, or null for none.
		 */
		choose: async (pick) => {
			mounted.rerender(tree(pick));
			await pass(0);
		},
		/** Take the tree down. */
		unmount: () => {
			mounted.unmount();
		},
	};
}

/**
 * Let time go by on the hand-driven clock, and what it sets off settle.
 * @param ms How long.
 */
async function pass(ms: number): Promise<void> {
	await act(async () => {
		jest.advanceTimersByTime(ms);
	});
	await act(async () => {
		jest.advanceTimersByTime(0);
	});
}

test("the locality is asked once for each pick, and never on the poll, a return to the tab or a reconnect", async () => {
	jest.useFakeTimers();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const { choose, unmount } = mountPane(client);
	await pass(3 * BOARD_CACHE_MS.vaultCheck);
	expect(asked.vaultCheck).toBeGreaterThan(1);
	expect(asked.locality).toBe(0);

	await choose(1);
	expect(asked.locality).toBe(1);
	const polls = asked.vaultCheck;
	await pass(3 * BOARD_CACHE_MS.vaultCheck);
	await act(async () => {
		focusManager.setFocused(false);
		focusManager.setFocused(true);
		onlineManager.setOnline(false);
		onlineManager.setOnline(true);
	});
	await pass(0);
	expect(asked.vaultCheck).toBeGreaterThan(polls);
	expect(asked.locality).toBe(1);

	// The next pick asks again, so a commit since the last pick is read; the
	// server answers from its memory while every HEAD stays.
	await choose(2);
	expect(asked.locality).toBe(2);
	await choose(null);
	await pass(3 * BOARD_CACHE_MS.vaultCheck);
	expect(asked.locality).toBe(2);
	unmount();
	client.clear();
	focusManager.setFocused(undefined);
});

test("picks made while the locality is read wait for that read and ask nothing more", async () => {
	jest.useFakeTimers();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const { choose, unmount } = mountPane(client);
	asked.locality = 0;
	walking = Promise.withResolvers<LocalityAnswer>();

	await choose(1);
	await choose(2);
	await choose(3);
	expect(asked.locality).toBe(1);

	walking.resolve(ANSWER);
	walking = undefined;
	await pass(0);
	await choose(4);
	expect(asked.locality).toBe(2);
	unmount();
	client.clear();
});

test("a pane that moves to another repository shows none of the last one's history while it reads", async () => {
	jest.useFakeTimers();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const on = { board: "pipeline", variant: "v1", version: 1 } as const;
	const observer = new QueryObserver(client, localityQuery({ vault: VAULT, ...on }));
	const unsubscribe = observer.subscribe(() => undefined);
	await pass(0);
	expect(observer.getCurrentResult().data).toEqual(ANSWER);

	// The same board in another checkout, whose history is its own.
	walking = Promise.withResolvers<LocalityAnswer>();
	observer.setOptions(localityQuery({ vault: "/work/archboard-next/.archboard/vault", ...on }));
	expect(observer.getCurrentResult().data).toBeUndefined();

	walking.resolve(ANSWER);
	walking = undefined;
	await pass(0);
	unsubscribe();
	client.clear();
});

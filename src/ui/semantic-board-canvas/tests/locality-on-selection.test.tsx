// When a pane asks for a board's locality (ADR 0045): once each time a pick
// subscribes to it, and never on a timer, on the vault check's 5-second poll,
// on a return to the tab or on a reconnect. A walk of a year of Git is work for
// the server, and only somebody picking a part out asks for it. The selection
// tab is drawn again for each pick, so each pick is a new subscription; the
// stage test `semantic-board-history.test.tsx` holds that each pick asks once.
//
// The query library decides when it loads whether it runs in a browser, and
// only a browser runs intervals. So this file registers the DOM before it loads
// anything that loads the library, and drives the clock by hand.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, jest, test } from "bun:test";
import { createElement, type JSX } from "react";

import type { LocalityAnswer } from "@/shared/locality/index";
import { VAULT_CHECK_POLL_MS } from "@/shared/timing/timing";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { QueryClient, QueryClientProvider, focusManager, onlineManager, useQuery } =
	await import("@tanstack/react-query");
const { act, cleanup, render } = await import("@testing-library/react");
const { localityQuery, readBoardsFrom, vaultCheckQuery } =
	await import("@/ui/semantic-board-canvas");

afterAll(async () => {
	cleanup();
	jest.useRealTimers();
	await GlobalRegistrator.unregister();
});

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
		return ANSWER;
	},
});

/**
 * The vault check, polled as every open canvas polls it.
 * @returns Nothing visible.
 */
function Poll(): null {
	useQuery(vaultCheckQuery());
	return null;
}

/**
 * One pick's subscription to the board's locality, as the history region holds it.
 * @returns Nothing visible.
 */
function Picked(): null {
	useQuery(localityQuery({ board: "pipeline", variant: "v1", version: 1 }));
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
	const mounted = render(
		createElement(QueryClientProvider, { client }, createElement(Pane, { pick: null })),
	);
	/**
	 * Pick a part out, or let go.
	 * @param pick A number for each pick, or null for none.
	 */
	async function choose(pick: number | null): Promise<void> {
		mounted.rerender(createElement(QueryClientProvider, { client }, createElement(Pane, { pick })));
		await pass(0);
	}
	await pass(3 * VAULT_CHECK_POLL_MS);
	expect(asked.vaultCheck).toBeGreaterThan(1);
	expect(asked.locality).toBe(0);

	await choose(1);
	expect(asked.locality).toBe(1);
	const polls = asked.vaultCheck;
	await pass(3 * VAULT_CHECK_POLL_MS);
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
	await pass(3 * VAULT_CHECK_POLL_MS);
	expect(asked.locality).toBe(2);
	mounted.unmount();
	client.clear();
	focusManager.setFocused(undefined);
});

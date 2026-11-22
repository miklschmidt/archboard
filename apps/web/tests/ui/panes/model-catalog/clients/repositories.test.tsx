// The repositories of this machine as a tab holds them: the server sends the listing over the
// tab's feed, and a choice is answered with the listing. Tests cross the seam that callers use,
// `useRepositories` and `chooseCheckout`, with the server's end of the feed and of the choice.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, jest, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ArchitectureFeedFrame } from "@archboard/model/contract";
import { paneMs } from "@archboard/timing";
import { checkoutChoiceSchema } from "@archboard/workspace/repositories";
import { installFeedServer, type FeedSocket } from "#tests/ui/support/model-catalog/feed-server.ts";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { createElement } = await import("react");
const { QueryClientProvider } = await import("@tanstack/react-query");
const { createModelQueryClient } = await import("#ui/panes/model-catalog/clients/query-client.ts");
const { chooseCheckout } = await import("#ui/panes/model-catalog/clients/repositories.ts");
const { useRepositories } = await import("#ui/panes/model-catalog/hooks/use-repositories.ts");

type Frame = Extract<ArchitectureFeedFrame, { type: "repositories" }>;

const ORDERS = "github.com/acme/orders";
const MAIN = "/work/orders";
const FEATURE = "/work/orders-feature";

/**
 * The listing of one repository whose chosen checkout is the one named.
 * @param choice The chosen checkout.
 * @param revision The server's count of its listings.
 * @returns The frame the server sends.
 */
function listing(choice: string, revision: number): Frame {
	return {
		type: "repositories",
		revision,
		repositories: [
			{
				name: ORDERS,
				untracked: false,
				vault: `${choice}/.archboard/vault`,
				state: "ready",
				checkouts: [MAIN, FEATURE].map((root) => ({
					root,
					chosen: root === choice,
					exists: true,
					hasVault: true,
				})),
			},
		],
	};
}

/**
 * The checkout a tab holds as chosen.
 * @param result What the tab's reader returned last.
 * @param result.current It.
 * @returns The vault of the chosen checkout, if the tab holds a listing.
 */
function chosenVault(result: { current: ReturnType<typeof useRepositories> }): string | undefined {
	return result.current.repositories?.[0]?.vault ?? undefined;
}

const feed = installFeedServer();
const realFetch = globalThis.fetch;

afterEach(() => {
	cleanup();
	feed.reset();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	feed.uninstall();
	await GlobalRegistrator.unregister();
});

/**
 * Run a test on a clock it moves itself, so a redial comes when the test says.
 * @param run The test.
 * @returns When it ran.
 */
async function onTestClock(run: () => Promise<void>): Promise<void> {
	jest.useFakeTimers();
	try {
		await run();
	} finally {
		jest.useRealTimers();
	}
}

/** Let the tab dial its feed again, as it does once the reconnect wait has passed. */
async function redial(): Promise<void> {
	await act(async () => jest.advanceTimersByTime(paneMs("socketReconnect")));
	await act(async () => {});
}

/**
 * The socket a tab opened that follows the repositories now, on a clock the test moves.
 * @returns It.
 */
function followingNow(): FeedSocket {
	const socket = feed.sockets.findLast((each) => each.topics.has("repositories"));
	expect(socket).toBeDefined();
	return socket!;
}

/**
 * Read the repositories in a tab of its own.
 * @param client The tab's query cache.
 * @returns The reader.
 */
function readIn(client: QueryClient) {
	return renderHook(() => useRepositories(), {
		/**
		 * The tab's cache, as the application provides it.
		 * @param props The reader.
		 * @param props.children It.
		 * @returns The provider.
		 */
		wrapper: (props: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, props.children),
	});
}

/**
 * The socket a tab opened that follows the repositories now.
 * @param from The sockets to look in.
 * @returns It, once the tab has asked.
 */
async function following(from: () => readonly FeedSocket[]): Promise<FeedSocket> {
	return waitFor(() => {
		const socket = from().find((each) => each.topics.has("repositories"));
		expect(socket).toBeDefined();
		return socket!;
	});
}

test("a cache opens nothing, and the follow starts with the first reader and stops with the last", async () => {
	const client = createModelQueryClient();
	expect(feed.sockets).toHaveLength(0);
	const first = readIn(client);
	const second = readIn(client);
	const socket = await following(() => feed.sockets);
	expect(feed.sockets).toHaveLength(1);
	expect(first.result.current).toEqual({ error: null, loading: true });
	await act(async () => socket.receive(listing(MAIN, 0)));
	expect(chosenVault(second.result)).toBe(`${MAIN}/.archboard/vault`);
	first.unmount();
	expect(socket.topics.has("repositories")).toBe(true);
	second.unmount();
	expect(socket.topics.size).toBe(0);
	expect(socket.readyState).toBe(3);
});

test("a reconnect takes the server's snapshot, even from a server that counts from nought again", () =>
	onTestClock(async () => {
		const { result } = readIn(createModelQueryClient());
		await act(async () => {});
		const first = followingNow();
		await act(async () => first.receive(listing(MAIN, 4)));
		// The server restarts: the tab keeps what it holds and says nothing is wrong while it redials.
		await act(async () => first.close());
		expect(chosenVault(result)).toBe(`${MAIN}/.archboard/vault`);
		expect(result.current.error).toBeNull();
		await redial();
		const again = followingNow();
		expect(again).not.toBe(first);
		await act(async () => again.receive(listing(FEATURE, 0)));
		expect(chosenVault(result)).toBe(`${FEATURE}/.archboard/vault`);
	}));

test("two tabs that choose at once each end on the newest listing, whatever order the answers come in", async () => {
	const tabs = [createModelQueryClient(), createModelQueryClient()];
	const readers = tabs.map(readIn);
	await waitFor(() => expect(feed.sockets.filter((each) => each.topics.size > 0)).toHaveLength(2));
	const [left, right] = feed.sockets;
	await act(async () => {
		for (const socket of [left!, right!]) socket.receive(listing(MAIN, 0));
	});
	// The server chose MAIN for the left tab (revision 1), then FEATURE for the right (revision 2).
	// The left tab's answer comes after the feed sent it both; the right tab's comes first.
	const answers: Record<string, Frame> = {
		[MAIN]: listing(MAIN, 1),
		[FEATURE]: listing(FEATURE, 2),
	};
	globalThis.fetch = Object.assign(
		async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const { root } = checkoutChoiceSchema().parse(await new Response(init?.body).json());
			const { revision, repositories } = answers[root]!;
			return Response.json({ success: true, revision, repositories });
		},
		{ preconnect: realFetch.preconnect },
	);
	await act(async () => {
		await chooseCheckout(tabs[1]!, { repository: ORDERS, root: FEATURE });
		for (const socket of [left!, right!]) {
			socket.receive(answers[MAIN]!);
			socket.receive(answers[FEATURE]!);
		}
		await chooseCheckout(tabs[0]!, { repository: ORDERS, root: MAIN });
	});
	for (const reader of readers)
		expect(chosenVault(reader.result)).toBe(`${FEATURE}/.archboard/vault`);
});

test("a server that does not answer is named, and the listing replaces the reason once it does", () =>
	onTestClock(async () => {
		feed.refuse(true);
		const { result } = readIn(createModelQueryClient());
		await act(async () => {});
		expect(result.current.error).not.toBeNull();
		expect([result.current.loading, chosenVault(result)]).toEqual([false, undefined]);
		feed.refuse(false);
		await redial();
		await act(async () => followingNow().receive(listing(MAIN, 0)));
		expect(result.current).toMatchObject({ error: null, loading: false });
		expect(chosenVault(result)).toBe(`${MAIN}/.archboard/vault`);
	}));

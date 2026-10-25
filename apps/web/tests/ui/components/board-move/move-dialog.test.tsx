// A person moves a board from its pane (ADR 0051). The move names the board
// without the variant on screen, and the dialog stays open while the move is
// under way, so a refusal is read where the person asked for the move.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { createElement } = await import("react");
const { Tooltip } = await import("@archboard/ui-kit/components");
const { MoveBoardControl } = await import("#ui/components/board-move/MoveBoardControl.tsx");

const SHOP = "github.com/acme/shop";
const SHOP_VAULT = "/work/shop/.archboard/vault";
const ORDERS = "github.com/acme/orders";
const ORDERS_VAULT = "/work/orders/.archboard/vault";

/**
 * A JSON answer.
 * @param body The body.
 * @param status The status.
 * @returns The response.
 */
function answer(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * One repository the navigator lists as ready.
 * @param name Its identity.
 * @param vault Its chosen checkout's vault.
 * @returns The listing's entry.
 */
const ready = (name: string, vault: string) => ({
	name,
	untracked: false,
	vault,
	state: "ready",
	checkouts: [],
});

/** The two repositories the board can be in. */
const REPOSITORIES = {
	success: true,
	served: SHOP_VAULT,
	repositories: [ready(ORDERS, ORDERS_VAULT), ready(SHOP, SHOP_VAULT)],
};

/** A move from the shop to orders that rewrites nothing. */
const PREVIEW = {
	success: true,
	version: 7,
	from: { vault: SHOP_VAULT, repository: SHOP },
	to: { vault: ORDERS_VAULT, repository: ORDERS },
	rewritten: [],
};

/**
 * The URL a request asks for.
 * @param input What fetch was given.
 * @returns The URL.
 */
function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	return input instanceof URL ? input.href : input.url;
}

const originalFetch = globalThis.fetch;
afterAll(async () => {
	cleanup();
	globalThis.fetch = originalFetch;
	await GlobalRegistrator.unregister();
});

test("a move under way keeps the dialog open, and its refusal is shown there", async () => {
	const moved = Promise.withResolvers<Response>();
	const posted: unknown[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = urlOf(input);
			if (url.startsWith("/api/repositories")) return answer(REPOSITORIES);
			if (url.startsWith("/api/semantic-boards/move-preview")) return answer(PREVIEW);
			posted.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
			return moved.promise;
		},
		{ preconnect: originalFetch.preconnect },
	);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const status = { vault: SHOP_VAULT, boardKey: "ledger@draft", repository: SHOP, version: 7 };
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(
				Tooltip.Provider,
				null,
				createElement(MoveBoardControl, { status, boardName: "ledger" }),
			),
		),
	);

	fireEvent.click(screen.getByRole("button", { name: "Move ledger to another repository" }));
	fireEvent.click(await screen.findByRole("radio"));
	const move = await screen.findByRole("button", { name: "Move" });
	await waitFor(() => expect(move).toHaveProperty("disabled", false));
	fireEvent.click(move);
	await waitFor(() => expect(posted).toHaveLength(1));
	// The board moves with every variant, so the move names it without one.
	expect(posted[0]).toMatchObject({ board: "ledger", origin: "human" });

	await waitFor(() => expect(move).toHaveProperty("disabled", true));
	fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
	expect(screen.queryByRole("dialog")).not.toBeNull();

	moved.resolve(answer({ success: false, code: "CLAIMED", error: "Somebody claims it." }, 409));
	const refusal = await screen.findByRole("alert");
	expect(refusal.textContent).toContain("Somebody claims it.");
	expect(screen.queryByRole("dialog")).not.toBeNull();
});

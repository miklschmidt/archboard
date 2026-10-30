// Captured read and drawing providers for the retained-stage UI owners.

import { z } from "zod";
import { VaultCheckSchema } from "@archboard/board/policy";
import { RememberedFindingsSchema } from "@archboard/code-intel/code-check";
import { SemanticRenderReplySchema } from "@archboard/board/render-reply";
import { readBoardsFrom } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import {
	SemanticBoardError,
	type SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { withFixtureOrders } from "#tests/ui/support/semantic-board-canvas/fixture-orders.ts";

/** What the fake server answers a request with. */
type Reply = { readonly status: number; readonly body: unknown } | "pending";

/** A server no code pass has run on yet. */
const NO_FINDINGS = { success: true, readings: [] } as const;

/**
 * The reply the next request gets, every request made so far, and the board
 * documents inspection reads.
 *
 * Documents are answered by name rather than by turn, because a pane inspecting
 * a drill-down reads two boards at once and which of them answers first is not
 * something a test should have to predict.
 */
const server: {
	reply: Reply;
	calls: string[];
	documents: Record<string, unknown>;
	/** Boards whose document is answered only once the promise settles. */
	held: Record<string, Promise<unknown>>;
	/** What the vault checker answers, or undefined for a checker that refuses. */
	vault: unknown;
	/** What the last code pass left in the server's memory, as its route answers it. */
	findings: unknown;
} = {
	reply: "pending",
	calls: [],
	documents: {},
	held: {},
	vault: undefined,
	findings: NO_FINDINGS,
};

const realFetch = globalThis.fetch;

/** Restore the fixture transport and discard each test's captured inputs. */
function resetCapture(): void {
	globalThis.fetch = realFetch;
	server.reply = "pending";
	server.calls = [];
	server.documents = {};
	server.held = {};
	server.vault = undefined;
	server.findings = NO_FINDINGS;
}

/** The route the shared vault checker answers on. */
const VAULT_ROUTE = "/api/vault/check";

/** The route the findings of the last code pass are read from. */
const FINDINGS_ROUTE = "/api/vault/code-findings";

/** The route a pane reads a whole board through. */
const BOARD_ROUTE = "retained-document";

/** The route a pane asks for a picture through. */
const RENDER_ROUTE = "retained-render";

/**
 * Every picture the pane has asked for, in the order it asked.
 *
 * A pane reads two routes — the picture, and the board itself, for what a
 * picture does not carry — so a question about what was drawn is asked of the
 * render requests rather than of whichever request happened to be last.
 * @returns The render requests.
 */
function renderCalls(): string[] {
	return server.calls.filter((call) => call.startsWith(RENDER_ROUTE));
}

/**
 * The board a document request named.
 * @param url The request's URL.
 * @returns The board name, or null when the request was for something else.
 */
function documentAsked(url: string): string | null {
	return url.startsWith(BOARD_ROUTE)
		? (new URLSearchParams(url.split("?")[1]).get("board") ?? "")
		: null;
}

/**
 * The URL a request named, whichever way it was spelled.
 * @param input What the caller passed to fetch.
 * @returns The URL as a string.
 */
function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	return input instanceof URL ? input.href : input.url;
}

/**
 * Answer every request from `server`, recording what was asked for.
 * @param input The request.
 * @returns The reply, or a promise that never settles while it is pending.
 */
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const url = urlOf(input);
	if (url.startsWith(FINDINGS_ROUTE)) return answered({ status: 200, body: server.findings });
	return serverReply(url);
}

/**
 * Answer one request other than the findings from `server`, recording it.
 * @param url The request's URL.
 * @returns The reply, or a promise that never settles while it is pending.
 */
function serverReply(url: string): Promise<Response> {
	server.calls.push(url);
	const board = documentAsked(url);
	if (board !== null) {
		const held = server.held[board];
		return held === undefined
			? answered(documentReply(board))
			: held.then(() => answered(documentReply(board)));
	}
	if (url.startsWith(VAULT_ROUTE)) {
		return answered(
			server.vault === undefined
				? { status: 503, body: { success: false, error: "no checker" } }
				: { status: 200, body: server.vault },
		);
	}
	const reply = server.reply;
	return reply === "pending" ? new Promise<Response>(() => undefined) : answered(reply);
}

/**
 * What a document request for one board is answered with.
 * @param board The board asked for.
 * @returns The reply, refusing a board the test never put there.
 */
function documentReply(board: string): StubReply {
	const held = server.documents[board];
	if (held === undefined) {
		return {
			status: 404,
			body: {
				success: false,
				code: "BOARD_MISSING",
				error: `there is no semantic board called "${board}"`,
			},
		};
	}
	return { status: 200, body: { success: true, board: withFixtureOrders(held) } };
}

/** A reply the fake server is about to give. */
interface StubReply {
	/** Its HTTP status. */
	readonly status: number;
	/** Its body, before it is serialised. */
	readonly body: unknown;
}

/**
 * One reply, as a response.
 * @param reply Its status and body.
 * @returns The response.
 */
function answered(reply: StubReply): Promise<Response> {
	return Promise.resolve(
		new Response(JSON.stringify(reply.body), {
			status: reply.status,
			headers: { "Content-Type": "application/json" },
		}),
	);
}

/**
 * Read a fixture result through the explicit capture boundary.
 * @param resource The fixture resource, never a live board route.
 * @returns The authored fixture body.
 * @throws {SemanticBoardError} When the fixture supplies a refusal.
 */
async function captured(resource: string): Promise<unknown> {
	const response = await fakeFetch(resource);
	const body: unknown = await response.json();
	if (!response.ok) {
		const refusal = z
			.object({
				code: z
					.enum(["BOARD_MISSING", "UNKNOWN_VARIANT", "UNKNOWN_VIEW", "BOARD_UNREADABLE"])
					.optional(),
				error: z.string(),
			})
			.parse(body);
		throw new SemanticBoardError(refusal.code ?? "REPLY_INVALID", refusal.error);
	}
	return body;
}

/**
 * Preserve the diagram requests observed by the existing UI owners.
 * @param request The exact retained reading.
 * @returns The fixture drawing.
 */
async function capturedDrawing(request: SemanticRenderRequest) {
	const fields = {
		board: request.board,
		variant: request.variant,
		view: request.view,
		against: request.against,
		comparison: request.comparison === false ? "off" : undefined,
		layout: request.layout,
	};
	const parameters = new URLSearchParams(
		Object.entries(fields).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
	);
	const reply = SemanticRenderReplySchema.parse(await captured(`${RENDER_ROUTE}?${parameters}`));
	return "empty" in reply
		? { ...reply, kind: "empty" as const }
		: { ...reply, kind: "drawn" as const };
}

/** Install exact fixture providers before mounting the retained stage. */
function supplyCapture(): void {
	globalThis.fetch = serving;
	readBoardsFrom({
		/**
		 * Keep repository discovery outside the retained fixture.
		 * @returns No live repository discovery from a retained stage.
		 */
		listing: async () => ({ levels: [], boards: [] }),
		/**
		 * Read a retained fixture document.
		 * @param _vault The fixture namespace.
		 * @param board The recorded document name.
		 * @returns Its original document.
		 */
		document: async (_vault, board) =>
			z
				.object({ board: z.unknown() })
				.parse(await captured(`${BOARD_ROUTE}?board=${encodeURIComponent(board)}`)).board,
		/**
		 * Read the policy captured by this fixture.
		 * @returns The captured policy.
		 */
		vaultCheck: async () => VaultCheckSchema.parse(await captured(VAULT_ROUTE)),
		/**
		 * Read the fixture findings without a code pass.
		 * @returns The findings supplied by this UI fixture.
		 */
		codeFindings: async () => RememberedFindingsSchema.parse(await captured(FINDINGS_ROUTE)),
	});
	takePicturesFrom({ draw: capturedDrawing });
}

/**
 * The fake wearing the one extra member the runtime's own `fetch` carries, so
 * it can stand in for it without an assertion.
 */
const serving: typeof fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });

export { server, renderCalls, supplyCapture, resetCapture };

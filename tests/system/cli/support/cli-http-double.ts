// A canvas that is only a canvas as far as the CLI can tell.
//
// The CLI's own owners need something on the other end of `EXPRESS_SERVER_URL`
// that identifies itself and answers the handful of routes a command touches,
// without a real canvas, a real vault or a real browser. What it is for is
// process behaviour — what the CLI leaves behind, what it exits with — so the
// answers are the smallest true ones rather than a second implementation.

import { z } from "zod";
import { CANVAS_SERVICE_NAME } from "../../../../src/runtime/engine/canvas-client.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.boolean(),
		z.number(),
		z.string(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

/** One request the double saw. */
interface RecordedRequest {
	method: string;
	url: URL;
	body: unknown;
}

/** The double, and what it saw. */
interface CliHttpDouble {
	readonly url: string;
	readonly requests: readonly RecordedRequest[];
	readonly contacts: readonly string[];
	setBrowserClients(count: number): void;
	dispose(): Promise<void>;
	[Symbol.asyncDispose](): Promise<void>;
}

const paneRef = { paneId: "pane-right", clientId: "client-right", place: "right", position: 2 };

/**
 * The answer to one of the routes a command reaches for, or null when this
 * double has nothing to say about it.
 * @param method The request method.
 * @param url The request URL.
 * @returns The response, or null.
 */
function answerFor(method: string, url: URL): Response | null {
	if (method === "GET" && url.pathname === "/api/sync/status") {
		return Response.json({ success: true, boards: [], timestamp: new Date().toISOString() });
	}
	if (method === "GET" && url.pathname === "/api/panes") {
		return Response.json({
			success: true,
			paneCount: 0,
			arrangement: "none",
			focused: null,
			sameBoard: true,
			panes: [],
			summary: "No pane is open, so nothing is on screen.",
			text: "No pane is open, so nothing is on screen.",
		});
	}
	if (method === "POST" && url.pathname === "/api/panes/open") {
		return Response.json({
			success: true,
			pane: paneRef,
			paneCount: 2,
			onScreen: [{ paneId: paneRef.paneId, place: paneRef.place, board: "contract" }],
		});
	}
	if (method === "POST" && url.pathname === "/api/panes/show") {
		return Response.json({
			success: true,
			board: "contract",
			identity: { board: "contract", variant: "current" },
			paneId: paneRef.paneId,
			pane: paneRef,
		});
	}
	return null;
}

/**
 * Start a canvas double on a free loopback port.
 * @param observed Where every contact is also recorded, for a shared log.
 * @returns The double.
 */
function createCliHttpDouble(observed: string[] = []): CliHttpDouble {
	const requests: RecordedRequest[] = [];
	const contacts: string[] = [];
	let browserClients = 1;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const url = new URL(request.url);
			const contact = `${request.method} ${url.pathname}`;
			contacts.push(contact);
			observed.push(contact);
			if (url.pathname === "/health") {
				return Response.json({
					service: CANVAS_SERVICE_NAME,
					status: "ok",
					websocket_clients: browserClients,
				});
			}
			const text = request.method === "GET" ? "" : await request.text();
			let body: unknown = null;
			if (text) {
				try {
					body = jsonValueSchema.parse(JSON.parse(text));
				} catch {
					return Response.json({ success: false, error: "invalid JSON" }, { status: 400 });
				}
			}
			requests.push({ method: request.method, url, body });
			return (
				answerFor(request.method, url) ??
				Response.json({ success: false, error: `unexpected ${url.pathname}` }, { status: 404 })
			);
		},
	});
	const dispose = async (): Promise<void> => {
		await server.stop(true);
	};
	return {
		url: `http://127.0.0.1:${server.port}`,
		requests,
		contacts,
		setBrowserClients: (count: number): void => {
			browserClients = count;
		},
		dispose,
		[Symbol.asyncDispose]: dispose,
	};
}

export { createCliHttpDouble, type CliHttpDouble, type RecordedRequest };

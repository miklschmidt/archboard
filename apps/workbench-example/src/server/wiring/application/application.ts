import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createVoiceAgent, resolveCodexExecutable } from "@archboard/codex-realtime-voice/server";
import type { ExampleOptions } from "#server/rules/startup/options.ts";
import { WORKBENCH_SOCKET_PATH, type ExampleConfiguration } from "#shared/protocol/application.ts";

const assets = new Map([
	["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
	["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
	["/app.css", { file: "app.css", contentType: "text/css; charset=utf-8" }],
]);

/**
 * Require the browser build before starting a private Codex process.
 * @param directory The host-supplied build directory.
 */
function requireAssets(directory: string): void {
	for (const { file } of assets.values()) {
		try {
			if (!statSync(join(directory, file)).isFile()) throw new Error("not a file");
		} catch {
			throw new Error(
				`Missing browser asset ${join(directory, file)}. Run bun run example:workbench:build or pass --browser-directory.`,
			);
		}
	}
}

/**
 * Compare browser request metadata to the exact loopback listener.
 * @param request The request.
 * @param expected The listener's HTTP origin.
 * @returns Whether the request belongs to this localhost application.
 */
function sameOrigin(request: Request, expected: string): boolean {
	const origin = request.headers.get("origin");
	return (
		request.headers.get("host") === new URL(expected).host &&
		(origin === null || origin === expected)
	);
}

/**
 * Answer one of the example's own routes: its configuration and its browser build.
 * @param request The request, which is no socket upgrade on the socket path.
 * @param origin The listener's HTTP origin.
 * @param options The admitted host inputs.
 * @returns The route's answer.
 */
async function route(request: Request, origin: string, options: ExampleOptions): Promise<Response> {
	if (!sameOrigin(request, origin)) return new Response(null, { status: 403 });
	if (request.method !== "GET")
		return new Response(null, { status: 405, headers: { Allow: "GET" } });
	const path = new URL(request.url).pathname;
	const headers = { "Cache-Control": "no-store" };
	if (path === "/api/config") {
		const configuration: ExampleConfiguration = {
			checkout: { label: basename(options.checkout), path: options.checkout },
			socketPath: WORKBENCH_SOCKET_PATH,
		};
		return Response.json(configuration, { headers });
	}
	const asset = assets.get(path);
	if (asset === undefined) return new Response(null, { status: 404, headers });
	try {
		const body = await readFile(join(options.browserDirectory, asset.file));
		return new Response(body, { headers: { ...headers, "Content-Type": asset.contentType } });
	} catch (error) {
		console.error(error);
		return new Response(
			"Cannot read the browser build. Rebuild it and restart the example server.",
			{
				status: 500,
			},
		);
	}
}

/**
 * Start one localhost application around the public voice agent.
 * @param options The admitted host inputs.
 * @param onFatal The application lifetime's failure handler.
 * @param signal Stops owned resources even while Codex startup is pending.
 * @returns The listener URL and idempotent application shutdown.
 */
export async function startExample(
	options: ExampleOptions,
	onFatal: (error: unknown) => void,
	signal: AbortSignal,
) {
	requireAssets(options.browserDirectory);
	const executablePath = resolveCodexExecutable(
		options.codex === undefined ? {} : { executablePath: options.codex },
	);
	const agent = createVoiceAgent({
		storage: { directory: options.state },
		codex: { executablePath },
		checkouts: [options.checkout],
		identity: { serviceName: "workbench-example", threadSource: "workbench-example" },
		instructions: {
			coordinator:
				"Answer brief questions and coordinate sustained work in the admitted checkout.\n",
			workhorse: "Complete the person's requested work in the admitted checkout.\n",
		},
		onFatal,
	});
	let server: Bun.Server<unknown> | undefined;
	let stopping: Promise<void> | undefined;
	/**
	 * Close only this host's listener, sockets, and private child, once.
	 * @returns Resolves after owned resources close.
	 */
	const shutdown = (): Promise<void> =>
		(stopping ??= (async () => {
			signal.removeEventListener("abort", abort);
			const stopped = server?.stop();
			try {
				await agent.shutdown();
			} finally {
				await stopped;
			}
		})());
	/** Stop the private child without waiting for startup readiness. */
	const abort = (): void => {
		void shutdown().catch(onFatal);
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		signal.throwIfAborted();
		await agent.start();
		signal.throwIfAborted();
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: options.port,
			...agent.bunHandlers({
				path: WORKBENCH_SOCKET_PATH,
				/**
				 * Answer the example's own routes for the listener's origin.
				 * @param request The request.
				 * @param receiving The server that received it.
				 * @returns The route's answer.
				 */
				fetch: (request, receiving) => route(request, receiving.url.origin, options),
			}),
		});
		return { url: server.url.origin, shutdown };
	} catch (error) {
		await shutdown();
		signal.throwIfAborted();
		throw error;
	}
}

import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { createCodexWorkbench } from "@archboard/codex-realtime-voice/server";
import { createWorkbenchThreadProfile } from "@archboard/codex-realtime-voice/runtime";
import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "@archboard/codex-app-server/process";
import type { ExampleOptions } from "#server/rules/startup/options.ts";
import { attachBrowserSockets, sameOrigin } from "#server/sockets/browser/browser.ts";
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
 * Add the example's short domain instructions to the core role protocol.
 * @param role The thread's role.
 * @param domainInstructions The application's instructions.
 * @returns The immutable thread profile.
 */
function profile(role: "coordinator" | "workhorse", domainInstructions: string) {
	return createWorkbenchThreadProfile({
		identity: { serviceName: "workbench-example", threadSource: "workbench-example" },
		role,
		domainInstructions,
		dynamicTools: [],
	});
}

/**
 * Start one localhost application around the public Codex workbench factory.
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
	const executablePath = verifyCodexExecutable(
		options.codex ?? resolveProjectCodexExecutable(),
	).executablePath;
	const workbench = createCodexWorkbench({
		storage: { rootDirectory: options.state },
		process: { executablePath },
		host: {
			allowedCheckouts: [options.checkout],
			onFatal,
			instructions: {
				coordinator: profile(
					"coordinator",
					"Answer brief questions and coordinate sustained work in the admitted checkout.\n",
				),
				workhorse: profile(
					"workhorse",
					"Complete the person's requested work in the admitted checkout.\n",
				),
			},
		},
	});
	let origin = "";
	const server = createServer((request, response) => {
		void (async () => {
			if (!sameOrigin(request.headers.host, request.headers.origin, origin)) {
				response.writeHead(403).end();
				return;
			}
			if (request.method !== "GET") {
				response.writeHead(405, { Allow: "GET" }).end();
				return;
			}
			const path = new URL(request.url ?? "/", origin).pathname;
			response.setHeader("Cache-Control", "no-store");
			if (path === "/api/config") {
				const configuration: ExampleConfiguration = {
					checkout: { label: basename(options.checkout), path: options.checkout },
					socketPath: WORKBENCH_SOCKET_PATH,
				};
				response
					.writeHead(200, { "Content-Type": "application/json" })
					.end(JSON.stringify(configuration));
				return;
			}
			const asset = assets.get(path);
			if (asset === undefined) {
				response.writeHead(404).end();
				return;
			}
			const body = await readFile(join(options.browserDirectory, asset.file));
			response.writeHead(200, { "Content-Type": asset.contentType }).end(body);
		})().catch((error: unknown) => {
			console.error(error);
			response
				.writeHead(500)
				.end("Cannot read the browser build. Rebuild it and restart the example server.");
		});
	});
	let closeSockets: (() => Promise<void>) | undefined;
	let stopping: Promise<void> | undefined;
	/**
	 * Close only this host's listener, sockets, and private child, once.
	 * @returns Resolves after owned resources close.
	 */
	const shutdown = (): Promise<void> =>
		(stopping ??= (async () => {
			signal.removeEventListener("abort", abort);
			const closed = new Promise<void>((resolve, reject) => {
				server.close((error) =>
					error && "code" in error && error.code !== "ERR_SERVER_NOT_RUNNING"
						? reject(error)
						: resolve(),
				);
			});
			try {
				await closeSockets?.();
			} finally {
				try {
					await workbench.shutdown();
				} finally {
					await closed;
				}
			}
		})());
	/** Stop the private child without waiting for startup readiness. */
	const abort = (): void => {
		void shutdown().catch(onFatal);
	};
	signal.addEventListener("abort", abort, { once: true });
	try {
		signal.throwIfAborted();
		const status = await workbench.start();
		signal.throwIfAborted();
		if (!status.ready)
			throw new Error(
				`Codex did not become ready: ${JSON.stringify(status.failure)}. Restart the example server.`,
			);
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(options.port, "127.0.0.1", () => {
				server.off("error", reject);
				resolve();
			});
		});
		const address = server.address();
		if (address === null || typeof address === "string")
			throw new Error("The localhost listener has no TCP address.");
		origin = `http://127.0.0.1:${address.port}`;
		closeSockets = attachBrowserSockets(server, workbench, options.checkout, origin);
		server.on("error", onFatal);
		return { url: origin, shutdown };
	} catch (error) {
		await shutdown();
		signal.throwIfAborted();
		throw error;
	}
}

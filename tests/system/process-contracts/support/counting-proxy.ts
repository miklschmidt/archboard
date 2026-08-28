import { createServer } from "node:http";

import { z } from "zod";

import { startOwnedPeer, type OwnedPeer } from "./owned-peer-process.ts";
import { ReadySchema, type ChildEnvironment } from "./process-http.ts";

export const ProxyRecordSchema = z.object({
	method: z.string(),
	pathname: z.string(),
	query: z.string(),
	bodyBase64: z.string(),
});
export const ProxySnapshotSchema = z.object({ records: z.array(ProxyRecordSchema) });
const ProxyReadySchema = ReadySchema.extend({ port: z.number().int().positive() });
export type ProxyRecord = z.infer<typeof ProxyRecordSchema>;

export interface CountingProxy {
	readonly base: string;
	readonly peer: OwnedPeer<z.infer<typeof ProxyReadySchema>>;
	reset(): Promise<void>;
	snapshot(): Promise<ProxyRecord[]>;
	dispose(): Promise<void>;
}

export async function startCountingProxy(options: {
	port: number;
	upstream: string;
	env: ChildEnvironment;
}): Promise<CountingProxy> {
	const peer = await startOwnedPeer({
		argv: [process.execPath, import.meta.filename],
		env: {
			...options.env,
			ARCHBOARD_TEST_PROXY_PORT: String(options.port),
			ARCHBOARD_TEST_PROXY_UPSTREAM: options.upstream,
		},
		readySchema: ProxyReadySchema,
	});
	const base = `http://127.0.0.1:${options.port}`;
	const control = async (action: "reset" | "snapshot") => {
		const response = await fetch(`${base}/__archboard_proxy/${action}`, {
			method: action === "reset" ? "POST" : "GET",
		});
		const payload: unknown = await response.json();
		const parsed = ProxySnapshotSchema.safeParse(payload);
		if (!parsed.success)
			throw new Error(
				`Proxy ${action} response was invalid: ${JSON.stringify(payload)}\n${parsed.error.message}\nProxy stderr:\n${peer.stderr}`,
			);
		return parsed.data.records;
	};
	return {
		base,
		peer,
		async reset() {
			await control("reset");
		},
		snapshot: () => control("snapshot"),
		dispose: () => peer.dispose(),
	};
}

if (import.meta.main) {
	const port = Number(process.env.ARCHBOARD_TEST_PROXY_PORT);
	const upstream = process.env.ARCHBOARD_TEST_PROXY_UPSTREAM;
	if (!port || !upstream) throw new Error("Proxy port and upstream are required.");
	let records: ProxyRecord[] = [];
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", async () => {
			const body = Buffer.concat(chunks);
			const url = new URL(request.url ?? "/", "http://proxy");
			if (url.pathname === "/__archboard_proxy/reset") {
				records = [];
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ records }));
				return;
			}
			if (url.pathname === "/__archboard_proxy/snapshot") {
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ records }));
				return;
			}
			records.push({
				method: request.method ?? "GET",
				pathname: url.pathname,
				query: url.search,
				bodyBase64: body.toString("base64"),
			});
			try {
				const forwarded = await fetch(`${upstream}${url.pathname}${url.search}`, {
					method: request.method,
					headers: request.headers["content-type"]
						? { "Content-Type": request.headers["content-type"] }
						: undefined,
					body: body.length ? body : undefined,
				});
				response.writeHead(forwarded.status, {
					"Content-Type": forwarded.headers.get("content-type") ?? "application/json",
				});
				response.end(Buffer.from(await forwarded.arrayBuffer()));
			} catch (error) {
				response.writeHead(502, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ error: String(error) }));
			}
		});
	});
	server.listen(port, "127.0.0.1", () => {
		// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
		console.log(JSON.stringify({ pid: process.pid, port }));
	});
	const stop = () => server.close(() => process.exit(0));
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}

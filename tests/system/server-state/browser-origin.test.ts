import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { request, type IncomingMessage } from "node:http";
import { WebSocket } from "ws";

import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

test("every HTTP surface and socket upgrade refuses foreign pages before work", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-browser-origin-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = vaultIn(join(root, "vault"));
	const server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	resources.defer(() => server.dispose());
	const boardFile = join(vault, "payments.semantic.json");
	const named = `vault=${encodeURIComponent(server.vault)}`;
	const create = `/api/semantic-boards/create?${named}&doing=checking%20local%20tools`;
	const body = JSON.stringify({
		board: "payments",
		create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] },
	});

	for (const [path, method] of [
		[`/api/semantic-boards?${named}`, "GET"],
		[create, "POST"],
		[`/api/vault/code-check?${named}`, "GET"],
		["/assets/diagram-icons/RiServerLine.json", "GET"],
		["/health", "OPTIONS"],
		["/missing-route", "GET"],
	] as const) {
		const response = await fetch(`${server.base}${path}`, {
			method,
			headers: { Origin: "https://example.com", "Content-Type": "application/json" },
			// Invalid JSON proves refusal precedes the body parser too.
			...(method === "POST" ? { body: "{" } : {}),
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ success: false, code: "CROSS_ORIGIN_REFUSED" });
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	}
	expect(existsSync(boardFile)).toBeFalse();
	const findings = await (await fetch(`${server.base}/api/vault/code-findings?${named}`)).json();
	expect(findings).toMatchObject({ success: true, readings: [] });

	// Originless local tools still create/read, and the pane still reads static assets.
	expect(
		(
			await fetch(`${server.base}${create}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
			})
		).status,
	).toBe(200);
	const before = readFileSync(boardFile);
	for (const headers of [
		{},
		{ Origin: server.base, "Sec-Fetch-Site": "same-origin" },
		{ Referer: `${server.base}/?paneA=payments`, "Sec-Fetch-Site": "same-origin" },
		// The Vite proxy preserves this browser Host for the shared origin guard.
		{ Host: "localhost:5173", Origin: "http://localhost:5173", "Sec-Fetch-Site": "same-origin" },
	]) {
		const response = await fetch(
			`${server.base}/api/semantic-boards/board?${named}&board=payments`,
			{
				headers,
			},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	}
	expect(
		(
			await fetch(`${server.base}/assets/diagram-icons/RiServerLine.json`, {
				headers: { Referer: `${server.base}/`, "Sec-Fetch-Site": "same-origin" },
			})
		).status,
	).toBe(200);
	const refusedEdit = await fetch(
		`${server.base}/api/semantic-boards/edit?${named}&doing=foreign%20write`,
		{
			method: "POST",
			headers: { Origin: "https://example.com", "Content-Type": "application/json" },
			body: JSON.stringify({
				board: "payments",
				edit: { nodes: [{ name: "Foreign", kind: "service" }] },
			}),
		},
	);
	expect(refusedEdit.status).toBe(403);
	expect(readFileSync(boardFile)).toEqual(before);

	const socketUrl = `${server.base.replace(/^http/u, "ws")}/?vault=${encodeURIComponent(server.vault)}`;
	const response = await new Promise<IncomingMessage>((received, reject) => {
		const upgrade = request(
			server.base,
			{
				headers: {
					Origin: "https://example.com",
					Connection: "Upgrade",
					Upgrade: "websocket",
					"Sec-WebSocket-Version": "13",
					"Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
				},
			},
			received,
		);
		resources.defer(() => {
			upgrade.destroy();
		});
		upgrade.once("error", reject);
		upgrade.once("upgrade", (_response, socket) => {
			socket.destroy();
			reject(new Error("A foreign page's WebSocket upgrade was accepted."));
		});
		upgrade.end();
	});
	expect(response.statusCode).toBe(403);
	response.resume();
	for (const origin of [undefined, server.base]) {
		const socket = new WebSocket(
			socketUrl,
			origin === undefined ? {} : { headers: { Origin: origin } },
		);
		resources.defer(() => socket.terminate());
		await once(socket, "open");
		const closed = once(socket, "close");
		socket.close();
		await closed;
	}
});

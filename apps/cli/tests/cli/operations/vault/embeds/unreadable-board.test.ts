// An embed whose board the vault lists but cannot read (ADR 0057). The board
// listing names no id for such a board, so the embeds check cannot tell
// whether the embed's board is gone or is the one that cannot be read; its
// finding names the boards the vault cannot read instead of only calling the
// board gone. Only the Archboard server is a stand-in.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-unreadable-")));
const checkout = path.join(root, "docs");
const vault = path.join(checkout, ".archboard", "vault");
const digest = `sha256:${"0".repeat(64)}`;
const recipe = {
	recipe: 1,
	board: { id: "bOrders", name: "orders" },
	vault: { repo: "github.com/example/docs" },
	variant: "current",
	view: "overview",
	comparison: "on",
	theme: "auto",
	layout: null,
	title: null,
	legend: null,
	fingerprint: digest,
	picture: digest,
};

let service = "";
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		if (pathname !== "/api/semantic-boards") {
			return Response.json({ success: false, error: `unexpected ${pathname}` }, { status: 404 });
		}
		// The board file is there, and the server could not read it.
		const unreadable = { name: "orders", key: "orders", variants: [], opens: null, links: [] };
		return Response.json({
			success: true,
			levels: [],
			boards: [{ ...unreadable, description: null, error: "Unexpected end of JSON input" }],
		});
	},
});
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
process.env["ARCHBOARD_URL"] = `http://127.0.0.1:${server.port}`;
process.env["ARCHBOARD_REPOS"] = path.join(root, "repos.json");
// Imported only now, because the CLI reads where its server is as it loads.
const [{ checkEmbedsAt }, client] = await Promise.all([
	import("#cli/operations/vault/embeds/embeds-check.ts"),
	import("@archboard/server-lifecycle/server-client"),
]);
service = client.ARCHBOARD_SERVICE_NAME;

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	fs.rmSync(root, { recursive: true, force: true });
});

test("an embed of a board its vault cannot read names the unreadable boards", async () => {
	const git = (...args: string[]) =>
		expect(spawnSync("git", args, { cwd: checkout }).status).toBe(0);
	fs.mkdirSync(vault, { recursive: true });
	git("init", "-q");
	git("remote", "add", "origin", "https://github.com/example/docs.git");
	fs.writeFileSync(
		path.join(checkout, "orders.svg"),
		`<svg xmlns="http://www.w3.org/2000/svg"><metadata><archboard:render-recipe>${JSON.stringify(recipe)}</archboard:render-recipe></metadata></svg>`,
	);
	git("add", "orders.svg");
	const part = await checkEmbedsAt({ vault }, { fix: true, signal: AbortSignal.timeout(10_000) });
	expect(part.embeds).toEqual(["orders.svg"]);
	expect(part.fixed).toEqual([]);
	expect(part.findings).toMatchObject([
		{ severity: "warning", code: "EMBED_SOURCE_MISSING", unreadableBoards: ["orders"] },
	]);
});

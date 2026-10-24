// The tracked embeds of another repository that the tracked embeds system test
// does not draw (ADR 0057): a tracked embed is an embed, so a file Git does not
// track in that repository's checkout is none, and a file that two boards
// track and whose recipe names one of them is read once, for that board, and
// is no embed of the other. Only the Archboard server is a stand-in.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-tracked-unit-")));
const models = path.join(root, "models");
const docs = path.join(root, "docs");
const vault = path.join(models, ".archboard", "vault");
const MODELS = "github.com/example/models";
const DOCS = "github.com/example/docs";
const orders = { id: "bOrders", name: "orders" };
const ledger = { id: "bLedger", name: "ledger" };

/** An SVG document that carries the recipe of a board of the models vault. */
function svgOf(board: { id: string; name: string }): string {
	const digest = `sha256:${"0".repeat(64)}`;
	const recipe = {
		recipe: 1,
		board,
		vault: { repo: MODELS },
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
	return `<svg xmlns="http://www.w3.org/2000/svg"><metadata><archboard:render-recipe>${JSON.stringify(recipe)}</archboard:render-recipe></metadata></svg>`;
}

let service = "";
const rendered: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") return Response.json({ service, status: "ok" });
		if (url.pathname === "/api/semantic-boards/render") {
			rendered.push(url.searchParams.get("board") ?? "");
			return Response.json(
				{ success: false, error: "No such view.", code: "UNKNOWN_VIEW" },
				{ status: 404 },
			);
		}
		if (url.pathname !== "/api/semantic-boards") {
			return Response.json(
				{ success: false, error: `unexpected ${url.pathname}` },
				{ status: 404 },
			);
		}
		const listed = (board: { id: string; name: string }, files: string[]) => ({
			...board,
			key: board.name,
			variants: [],
			opens: null,
			links: [],
			description: null,
			trackedEmbeds: files.map((file) => ({ repo: DOCS, path: file })),
		});
		return Response.json({
			success: true,
			levels: [],
			boards: [
				listed(orders, ["docs/draft.svg", "docs/shared.svg"]),
				listed(ledger, ["docs/shared.svg"]),
			],
			repository: MODELS,
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
const [{ checkEmbedsAt }, client, { declareDirectory }] = await Promise.all([
	import("#cli/operations/vault/embeds/embeds-check.ts"),
	import("@archboard/server-lifecycle/server-client"),
	import("@archboard/workspace/checkouts"),
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

test("a tracked file of another repository is read only as an embed of a board that tracks it", async () => {
	for (const [checkout, identity] of [
		[models, MODELS],
		[docs, DOCS],
	] as const) {
		fs.mkdirSync(checkout, { recursive: true });
		const git = (...args: string[]) =>
			expect(spawnSync("git", args, { cwd: checkout }).status).toBe(0);
		git("init", "-q");
		git("remote", "add", "origin", `https://${identity}.git`);
	}
	fs.mkdirSync(vault, { recursive: true });
	fs.mkdirSync(path.join(docs, "docs"));
	// Rendered and not committed: Git does not track it, so it is no embed yet.
	fs.writeFileSync(path.join(docs, "docs", "draft.svg"), svgOf(orders));
	// Drawn last from ledger, so it is no embed of orders any more.
	fs.writeFileSync(path.join(docs, "docs", "shared.svg"), svgOf(ledger));
	expect(spawnSync("git", ["add", "docs/shared.svg"], { cwd: docs }).status).toBe(0);
	await declareDirectory(docs);

	const part = await checkEmbedsAt({ vault }, { fix: false, signal: AbortSignal.timeout(10_000) });
	expect(rendered).toEqual(["ledger"]);
	expect(
		part.findings.map((one) => `${one.code} ${one.embedRepo}:${one.file} ${one.board?.name}`),
	).toEqual([
		`EMBED_SOURCE_MISSING ${DOCS}:docs/shared.svg ledger`,
		`EMBED_TRACKED_MISSING ${DOCS}:docs/draft.svg orders`,
		`EMBED_TRACKED_MISSING ${DOCS}:docs/shared.svg orders`,
	]);
	expect(part.findings.every((one) => one.severity === "information")).toBe(true);
});

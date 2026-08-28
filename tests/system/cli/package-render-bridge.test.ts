import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BridgeRemoveResultSchema, BridgeResultSchema } from "../../../src/cli/commands/bridge.ts";
import { FindingRenderManifestSchema } from "../../../src/cli/finding-rendering/index.ts";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import { createPackageCliOwner, packageFailure } from "./support/package-cli.ts";

const requestBodySchema = z.record(z.string(), z.unknown());
const bodyOf = (body: unknown) => requestBodySchema.parse(body);

async function closedUrl(): Promise<string> {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const url = server.url.origin;
	await server.stop(true);
	return url;
}

describe("package finding rendering", () => {
	test("writes validated PNG bytes before a relative public manifest", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const output = join(owner.outside, "findings");
		mkdirSync(output);
		const before = http.requests.length;
		const result = await owner.run(
			[
				"render-findings",
				"--board",
				"contract",
				"--out",
				output,
				"--font-family",
				"5",
				"--dimension-tolerance",
				"0.75",
				"--intersection-tolerance",
				"0.25",
				"--overlap-tolerance",
				"1.5",
			],
			{ url: http.url },
		);
		const diagnostic = packageFailure(result);
		expect(result.status, diagnostic).toBe(0);
		expect(result.signal, diagnostic).toBeNull();
		expect(result.stderr, diagnostic).toBe("");
		const manifest = FindingRenderManifestSchema.parse(JSON.parse(result.stdout));
		expect(manifest.complete, diagnostic).toBeTrue();
		expect(manifest.entries, diagnostic).toHaveLength(1);
		const rendered = manifest.entries[0];
		expect(rendered?.status, diagnostic).toBe("rendered");
		if (rendered?.status !== "rendered") throw new Error(diagnostic);
		expect(existsSync(join(output, rendered.file)), diagnostic).toBeTrue();
		expect(result.stdout.includes(output), diagnostic).toBeFalse();
		expect(readFileSync(join(output, "manifest.json"), "utf8"), diagnostic).toBe(result.stdout);
		const contacts = http.requests.slice(before);
		expect(contacts, diagnostic).toHaveLength(1);
		expect(contacts[0]?.method, diagnostic).toBe("POST");
		expect(contacts[0]?.url.pathname, diagnostic).toBe("/api/export/findings");
		expect(contacts[0]?.url.searchParams.get("board"), diagnostic).toBe("contract");
		expect(bodyOf(contacts[0]?.body), diagnostic).toEqual({
			policy: {
				allowedFontFamilies: [5],
				dimensionTolerance: 0.75,
				intersectionTolerance: 0.25,
				overlapTolerance: 1.5,
			},
		});
	});

	test("refuses unusable destinations and unavailable rendering prerequisites without artifacts", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const nonempty = join(owner.outside, "nonempty");
		mkdirSync(nonempty);
		writeFileSync(join(nonempty, "owned.txt"), "keep");
		let before = http.contacts.length;
		const occupied = await owner.run(
			["render-findings", "--board", "contract", "--out", nonempty],
			{ url: http.url },
		);
		let diagnostic = packageFailure(occupied);
		expect(occupied.status, diagnostic).toBe(2);
		expect(occupied.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
		expect(readdirSync(nonempty), diagnostic).toEqual(["owned.txt"]);

		const missing = join(owner.outside, "missing");
		before = http.contacts.length;
		const absent = await owner.run(["render-findings", "--board", "contract", "--out", missing], {
			url: http.url,
		});
		diagnostic = packageFailure(absent);
		expect(absent.status, diagnostic).toBe(2);
		expect(absent.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
		expect(existsSync(missing), diagnostic).toBeFalse();

		const closed = join(owner.outside, "closed");
		mkdirSync(closed);
		const unavailable = await owner.run(
			["render-findings", "--board", "contract", "--out", closed],
			{ url: await closedUrl() },
		);
		diagnostic = packageFailure(unavailable);
		expect(unavailable.status, diagnostic).toBe(3);
		expect(unavailable.stdout, diagnostic).toBe("");
		expect(readdirSync(closed), diagnostic).toEqual([]);

		const noBrowser = join(owner.outside, "no-browser");
		mkdirSync(noBrowser);
		http.setBrowserClients(0);
		before = http.contacts.length;
		const detached = await owner.run(
			["render-findings", "--board", "contract", "--out", noBrowser],
			{ url: http.url },
		);
		http.setBrowserClients(1);
		diagnostic = packageFailure(detached);
		expect(detached.status, diagnostic).toBe(4);
		expect(detached.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual(["GET /health", "GET /health"]);
		expect(readdirSync(noBrowser), diagnostic).toEqual([]);
	});

	test("commits no artifact for malformed data and a manifest only for unrenderable input", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const malformed = join(owner.outside, "malformed");
		mkdirSync(malformed);
		let before = http.requests.length;
		const rejected = await owner.run(
			["render-findings", "--board", "malformed-render", "--out", malformed],
			{ url: http.url },
		);
		let diagnostic = packageFailure(rejected);
		expect(rejected.status, diagnostic).toBe(1);
		expect(rejected.stdout, diagnostic).toBe("");
		expect(
			http.requests.slice(before).map((r) => `${r.method} ${r.url.pathname}`),
			diagnostic,
		).toEqual(["POST /api/export/findings"]);
		expect(readdirSync(malformed), diagnostic).toEqual([]);

		const unrenderable = join(owner.outside, "unrenderable");
		mkdirSync(unrenderable);
		before = http.requests.length;
		const partial = await owner.run(
			["render-findings", "--board", "unrenderable", "--out", unrenderable],
			{ url: http.url },
		);
		diagnostic = packageFailure(partial);
		expect(partial.status, diagnostic).toBe(0);
		expect(partial.stderr, diagnostic).toBe("");
		expect(
			http.requests.slice(before).map((r) => `${r.method} ${r.url.pathname}`),
			diagnostic,
		).toEqual(["POST /api/export/findings"]);
		const manifest = FindingRenderManifestSchema.parse(JSON.parse(partial.stdout));
		expect(manifest.complete, diagnostic).toBeFalse();
		const failed = manifest.entries[0];
		expect(failed?.status, diagnostic).toBe("failed");
		if (failed?.status !== "failed") throw new Error(diagnostic);
		expect(failed.failure, diagnostic).toBe("source-not-renderable");
		expect(readdirSync(unrenderable), diagnostic).toEqual(["manifest.json"]);
	});
});

const bridgeArgs = (over: string, background = "#ffffff", at?: string) => [
	"bridge",
	"--over",
	over,
	"--under",
	"under",
	"--background",
	background,
	...(at ? ["--at", at] : []),
	"--board",
	"contract",
	"--doing",
	"checking crossing",
];

describe("package bridge commands", () => {
	test("creates and removes a bridge through one exact route apiece", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		let before = http.requests.length;
		const created = await owner.run(bridgeArgs("over", "#FFFFFF", "50,50"), { url: http.url });
		let diagnostic = packageFailure(created);
		expect(created.status, diagnostic).toBe(0);
		expect(created.stderr, diagnostic).toBe("");
		const result = BridgeResultSchema.parse(JSON.parse(created.stdout));
		expect(
			result.elements.map((part) => part.customData?.archboard?.bridge?.role),
			diagnostic,
		).toEqual(["mask", "redraw"]);
		const writes = http.writesSince(before);
		expect(writes, diagnostic).toHaveLength(1);
		expect(writes[0]?.method, diagnostic).toBe("POST");
		expect(writes[0]?.url.pathname, diagnostic).toBe("/api/bridges");
		expect(bodyOf(writes[0]?.body).background, diagnostic).toBe("#ffffff");

		before = http.requests.length;
		const removed = await owner.run(
			["bridge", "remove", "Bridge01", "--board", "contract", "--doing", "removing crossing"],
			{ url: http.url },
		);
		diagnostic = packageFailure(removed);
		expect(removed.status, diagnostic).toBe(0);
		expect(removed.stderr, diagnostic).toBe("");
		expect(BridgeRemoveResultSchema.parse(JSON.parse(removed.stdout)).deleted, diagnostic).toEqual([
			"Bridge01",
			"Redraw01",
		]);
		const removals = http.requests.slice(before);
		expect(
			removals.map((r) => `${r.method} ${r.url.pathname}`),
			diagnostic,
		).toEqual(["DELETE /api/bridges/Bridge01"]);
	});

	test("rejects blank coordinates and invalid backgrounds before contact", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		for (const coordinate of ["1,", ",2", " , "]) {
			const before = http.contacts.length;
			const result = await owner.run(bridgeArgs("over", "#ffffff", coordinate), { url: http.url });
			const diagnostic = packageFailure(result);
			expect(result.status, diagnostic).toBe(2);
			expect(result.stdout, diagnostic).toBe("");
			expect(http.contacts.slice(before), diagnostic).toEqual([]);
			expect(
				readdirSync(owner.outside).filter((name) => name.startsWith("bridge")),
				diagnostic,
			).toEqual([]);
		}
		const before = http.contacts.length;
		const background = await owner.run(bridgeArgs("over", "transparent"), { url: http.url });
		const diagnostic = packageFailure(background);
		expect(background.status, diagnostic).toBe(2);
		expect(background.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
	});

	test("rejects invalid and source-colliding receipts after the exact route", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		for (const source of ["invalid-receipt", "mask-source-collision", "redraw-source-collision"]) {
			const before = http.requests.length;
			const result = await owner.run(bridgeArgs(source), { url: http.url });
			const diagnostic = packageFailure(result);
			expect(result.status, diagnostic).toBe(2);
			expect(result.stdout, diagnostic).toBe("");
			expect(
				http.requests.slice(before).map((r) => `${r.method} ${r.url.pathname}`),
				diagnostic,
			).toEqual(["POST /api/bridges"]);
			expect(
				readdirSync(owner.outside).filter((name) => name.startsWith("bridge")),
				diagnostic,
			).toEqual([]);
		}
		const before = http.requests.length;
		const removed = await owner.run(
			[
				"bridge",
				"remove",
				"InvalidReceipt",
				"--board",
				"contract",
				"--doing",
				"checking removal receipt",
			],
			{ url: http.url },
		);
		const diagnostic = packageFailure(removed);
		expect(removed.status, diagnostic).toBe(2);
		expect(removed.stdout, diagnostic).toBe("");
		expect(
			http.requests.slice(before).map((r) => `${r.method} ${r.url.pathname}`),
			diagnostic,
		).toEqual(["DELETE /api/bridges/InvalidReceipt"]);
	});
});

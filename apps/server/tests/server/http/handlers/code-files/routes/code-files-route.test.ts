// The code browser's routes (TASK-648, ADR 0080): `GET /api/code/files` lists the files that Git
// lists in a checkout, and `GET /api/code/file` quotes one whole file with the modules of a reading
// that own it. The production application answers over a vault this owner makes in a Git
// repository of its own.
//
// The model binds `src` (Core), `src/lib` (Lib), `src/orders.ts` as a file (File) and
// through two symbols (Orders binds `place`, Ghost binds a symbol the file lacks), and
// `src/mail.ts` (Mail). A relationship from Orders to Mail is anchored in `orders.ts` at `cancel`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type express from "express";
import type { z } from "zod";
import type * as ServerModule from "#server/http/application/wiring/application.ts";
import { CodeFileSchema, CodeFilesSchema } from "@archboard/code-intel/code-check";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

const REPO = "github.com/test/files";
const ORDERS = [
	"export function place(order: string): string {",
	"\treturn order;",
	"}",
	"",
	"export function cancel(order: string): string {",
	"\treturn order;",
	"}",
	"",
].join("\n");

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-files-route-"));
const checkout = join(scratch, "checkout");
const vault = join(checkout, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
let server: typeof ServerModule;
let http: Server;
let base = "";

/**
 * Write files below the checkout.
 * @param files Each file's path and its content.
 */
function write(files: Readonly<Record<string, string | Uint8Array>>): void {
	for (const [file, content] of Object.entries(files)) {
		mkdirSync(dirname(join(checkout, file)), { recursive: true });
		writeFileSync(join(checkout, file), content);
	}
}

/**
 * Run Git in the owner's repository.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: checkout,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

/**
 * A module of the model, bound to code.
 * @param id Its local id, in the model `Shop`.
 * @param binding What it binds, in the repository.
 * @param outgoing The relationships it draws.
 * @returns The file's name and content.
 */
function module(
	id: string,
	binding: { path: string; symbol?: string },
	outgoing: readonly object[] = [],
): [string, string] {
	return [
		`${id}.module.json`,
		JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order: 0,
			binding: { repo: REPO, ...binding },
			outgoing,
		}),
	];
}

/**
 * Ask a route as a page of the server's own origin does.
 * @param route The route and its query, which the vault is added to.
 * @param headers The browser headers of the request.
 * @returns The status and the parsed body.
 */
async function get(
	route: string,
	headers: Record<string, string> = { Referer: `${base}/`, "Sec-Fetch-Site": "same-origin" },
): Promise<{ status: number; body: unknown }> {
	const response = await fetch(`${base}${route}&vault=${encodeURIComponent(vault)}`, { headers });
	return { status: response.status, body: await response.json() };
}

/**
 * Ask for one file of the checkout, in the model's current reading.
 * @param path The file.
 * @returns The answer, which the contract's schema parses, with its owners.
 */
async function codeFile(path: string) {
	const asked = await get(
		`/api/code/file?${new URLSearchParams({ repo: REPO, path, model: "Shop" })}`,
	);
	expect(JSON.stringify(asked.body).slice(0, 900)).toContain('"success":true');
	const answer: z.infer<typeof CodeFileSchema> = CodeFileSchema.parse(asked.body);
	if (answer.owners === undefined) throw new Error("The answer has no owners.");
	return { ...answer, owners: answer.owners };
}

beforeAll(async () => {
	write({
		"src/orders.ts": ORDERS,
		"src/mail.ts": "export const send = 1;\n",
		"src/other.ts": "export const other = 1;\n",
		"src/lib/util.ts": "export const util = 1;\n",
		"src/.env": "API_KEY=1\n",
		"src/blob.bin": new Uint8Array([0x50, 0x00, 0x51]),
		"src/manifest.yaml": "apiVersion: v1\nkind: >-\n  Secret\nstringData:\n  token: test-only\n",
		"src/secret-list.json": JSON.stringify({
			apiVersion: "v1",
			kind: "SecretList",
			items: [{ metadata: { name: "test-secret" }, data: { token: "dGVzdA==" } }],
		}),
		".gitignore": "ignored.ts\n",
		"ignored.ts": "export const ignored = 1;\n",
	});
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify([
			{ repo: REPO, root: checkout, source: "declared", addedAt: "2026-10-06T00:00:00.000Z" },
		]),
	);
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Current", name: "Built" },
		}),
	);
	const anchored = (id: string, symbol: string) => ({
		id: `Shop/Orders#${id}`,
		order: 1,
		kind: "call",
		emphasis: "normal",
		to: "Shop#Mail",
		anchor: { repo: REPO, path: "src/orders.ts", symbol },
	});
	for (const [name, content] of [
		module("Core", { path: "src" }),
		module("Lib", { path: "src/lib" }),
		module("File", { path: "src/orders.ts" }),
		module("Orders", { path: "src/orders.ts", symbol: "place" }, [
			anchored("Cancel", "cancel"),
			anchored("Absent", "absent"),
		]),
		module("Ghost", { path: "src/orders.ts", symbol: "missing" }),
		module("Mail", { path: "src/mail.ts" }),
		module("Env", { path: "src/.env" }),
		module("Deleted", { path: "src/deleted.ts" }),
	]) {
		writeFileSync(join(vault, name), content);
	}
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${REPO}.git`);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	git("switch", "-q", "-c", "alternate");
	writeFileSync(join(vault, "File.module.json"), module("File", { path: "src/other.ts" })[1]);
	git("commit", "-qam", "move the file binding", "--no-gpg-sign");
	git("switch", "-q", "main");
	write({ "src/new.ts": "export const fresh = 1;\n" });
	server = await import("#server/http/application/wiring/application.ts");
	http = await new Promise<Server>((resolve) => {
		const started = (server.app as express.Express).listen(0, "127.0.0.1", () => resolve(started));
	});
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
	http?.close();
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("the files route answers the vault's repository with the files Git lists and marks the never quoted", async () => {
	for (const route of ["/api/code/files?", `/api/code/files?repo=${REPO}`]) {
		const asked = await get(route);
		expect(asked.status).toBe(200);
		const answer = CodeFilesSchema.parse(asked.body);
		expect(answer.repo).toBe(REPO);
		// Tracked, and new and not ignored; sorted; never an ignored file.
		expect(answer.files).toContain("src/orders.ts");
		expect(answer.files).toContain("src/new.ts");
		expect(answer.files).not.toContain("ignored.ts");
		expect(answer.files).toEqual(answer.files.toSorted());
		expect(answer.neverQuoted).toEqual(["src/.env"]);
	}
});

test("a file with definitions is quoted whole, and its owners go symbol, file, then deepest directory", async () => {
	const orders = await codeFile("src/orders.ts");
	expect(orders.source).toMatchObject({ status: "quoted", text: ORDERS });
	expect(orders.source.status === "quoted" ? orders.source.definitions : []).toMatchObject([
		{ symbol: "place", kind: "function", start: 1, end: 3 },
		{ symbol: "cancel", kind: "function", start: 5, end: 7 },
	]);
	// The file binding beats the directory `src`; the symbol bindings are named with their definitions.
	expect(orders.owners.file).toEqual(["Shop#File"]);
	const symbols = orders.owners.symbols.toSorted((a, b) => a.subject.localeCompare(b.subject));
	expect(symbols).toMatchObject([
		{ subject: "Shop#Ghost", symbol: "missing", definition: null },
		{ subject: "Shop#Orders", symbol: "place", definition: { start: 1, end: 3 } },
	]);
	// An anchor's line is its symbol's definition; a symbol no code holds has none.
	expect(orders.owners.anchors).toHaveLength(2);
	expect(orders.owners.anchors).toContainEqual({
		subject: "Shop/Orders#Cancel",
		symbol: "cancel",
		line: 5,
	});
	expect(orders.owners.anchors).toContainEqual({
		subject: "Shop/Orders#Absent",
		symbol: "absent",
		line: null,
	});
	expect((await codeFile("src/mail.ts")).owners).toMatchObject({
		file: ["Shop#Mail"],
		symbols: [],
	});
	expect((await codeFile("src/lib/util.ts")).owners.file).toEqual(["Shop#Lib"]);
	expect((await codeFile("src/other.ts")).owners.file).toEqual(["Shop#Core"]);
});

test("a source ref names the model that owns the file while the quote remains live", async () => {
	const query = new URLSearchParams({
		repo: REPO,
		path: "src/orders.ts",
		model: "Shop",
		ref: "alternate",
	});
	const asked = await get(`/api/code/file?${query}`);
	expect(asked.status).toBe(200);
	const answer = CodeFileSchema.parse(asked.body);
	expect(answer.source).toMatchObject({ status: "quoted", text: ORDERS });
	expect(answer.owners?.file).toEqual(["Shop#Core"]);
});

test("a request that names no model quotes the file and answers no owners", async () => {
	const asked = await get(
		`/api/code/file?${new URLSearchParams({ repo: REPO, path: "src/orders.ts" })}`,
	);
	expect(asked.status).toBe(200);
	const answer = CodeFileSchema.parse(asked.body);
	expect(answer.source).toMatchObject({ status: "quoted", text: ORDERS });
	expect(answer.owners).toBeUndefined();
});

test("a never quoted, binary or ignored file is a refused source with its owners still answered", async () => {
	for (const path of ["src/.env", "src/blob.bin", "ignored.ts"]) {
		const refused = await codeFile(path);
		expect(refused.source).toMatchObject({ status: "refused", code: "SOURCE_REFUSED" });
		expect(JSON.stringify(refused)).not.toContain("API_KEY");
	}
	expect((await codeFile("src/.env")).owners.file).toEqual(["Shop#Env"]);
	expect((await codeFile("src/blob.bin")).owners.file).toEqual(["Shop#Core"]);
	const missing = await codeFile("src/deleted.ts");
	expect(missing.source).toMatchObject({ status: "refused", code: "SOURCE_UNAVAILABLE" });
	expect(missing.owners.file).toEqual(["Shop#Deleted"]);
});

test("a Secret with a folded YAML kind is refused", async () => {
	const file = await codeFile("src/manifest.yaml");
	expect(file.source).toMatchObject({ status: "refused", code: "SOURCE_REFUSED" });
});

test("a Kubernetes SecretList is refused when its items omit kind", async () => {
	const file = await codeFile("src/secret-list.json");
	expect(file.source).toMatchObject({ status: "refused", code: "SOURCE_REFUSED" });
});

test("a repository no checkout is registered for is a 404 that says what to do", async () => {
	const stranger = "github.com/test/stranger";
	for (const route of [
		`/api/code/files?${new URLSearchParams({ repo: stranger })}`,
		`/api/code/file?${new URLSearchParams({ repo: stranger, path: "a.ts", model: "Shop" })}`,
	]) {
		const asked = await get(route);
		expect(asked.status).toBe(404);
		expect(asked.body).toMatchObject({ success: false, code: "REPOSITORY_UNAVAILABLE" });
	}
});

test("a query that does not parse is a 400 and an unknown model is refused as the model route refuses it", async () => {
	for (const route of [
		`/api/code/file?${new URLSearchParams({ repo: REPO, model: "Shop" })}`,
		`/api/code/file?${new URLSearchParams({ repo: REPO, path: "src/orders.ts", model: "Shop", state: "a", checkpoint: "b" })}`,
	]) {
		const asked = await get(route);
		expect(asked.status).toBe(400);
		expect(asked.body).toMatchObject({ success: false, code: "INVALID_REQUEST" });
	}
	const unknown = new URLSearchParams({ repo: REPO, path: "src/orders.ts", model: "Nope" });
	const refused = await get(`/api/code/file?${unknown}`);
	const modelRoute = await get(`/api/architecture/model?${new URLSearchParams({ model: "Nope" })}`);
	expect(refused.status).toBe(modelRoute.status);
	expect(refused.body).toMatchObject({ success: false });
});

test("only a page of the server's own origin reads a file", async () => {
	const query = new URLSearchParams({ repo: REPO, path: "src/orders.ts", model: "Shop" });
	for (const route of [`/api/code/file?${query}`, `/api/code/files?repo=${REPO}`]) {
		for (const headers of [
			{ Origin: "https://example.com", "Sec-Fetch-Site": "cross-site" },
			// A request with no browser headers does not prove a page of this origin.
			{},
		]) {
			const asked = await get(route, headers);
			expect(asked.status).toBe(403);
			expect(asked.body).toMatchObject({ success: false, code: "CROSS_ORIGIN_REFUSED" });
			expect(JSON.stringify(asked.body)).not.toContain("export function");
		}
	}
});

// The code pass holds each container's interface (ADR 0044) against what the
// module it binds exposes (ADR 0046, TASK-368.10).
//
// The checkout `shop` holds a store module whose `index.ts` exposes Read,
// Write, Audit and Util but not Cache or Hook; a server that calls Read and
// Write through the index and Cache past it; a file of the store drawn outside
// it that calls Hook; a report no part binds that calls Audit and names Util's
// type; a system test that calls an exposed helper nothing else uses; and a
// file of tests beside the index.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-interfaces-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;
let order = 0;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param path Its bound path.
 * @param parent The part that holds it, if any.
 * @returns The node.
 */
function part(id: string, path: string, parent?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: (order += 10),
		binding: { repo: SHOP, path },
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * A call from one part to another.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @returns The relationship.
 */
function call(id: string, from: string, to: string) {
	return { id, order: Number(id.slice(1)) * 10, from, to, kind: "call" };
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/store/index.ts": [
			'export { readShelf } from "./lib/read";',
			'export { writeShelf } from "./lib/write";',
			'export { auditShelf } from "./lib/audit";',
			'export { onShelf } from "./lib/callback";',
			'export { unusedHelper, SHELF_LIMIT, type ShelfType } from "./lib/util";',
			"",
		].join("\n"),
		"src/store/lib/read.ts":
			'import { cached } from "./cache";\nexport function readShelf(): string { return cached(); }\n',
		"src/store/lib/cache.ts": 'export function cached(): string { return "x"; }\n',
		"src/store/lib/write.ts": "export function writeShelf(): void {}\n",
		"src/store/lib/audit.ts": "export function auditShelf(): void {}\n",
		"src/store/lib/callback.ts": "export function onShelf(name: string): void {}\n",
		"src/store/lib/hook.ts": "export function hook(): void {}\n",
		"src/store/lib/inner.ts":
			'import { hook } from "./hook";\nexport function inner(): void { hook(); }\n',
		"src/store/lib/util.ts":
			"export function unusedHelper(): void {}\nexport interface ShelfType { name: string }\nexport const SHELF_LIMIT = 3;\n",
		// A file of tests at the store's root, which is no root file.
		"src/store/index.test.ts": "export function shelfFixture(): void {}\n",
		"src/server/routes.ts": [
			'import { readShelf, writeShelf } from "../store";',
			'import { cached } from "../store/lib/cache";',
			"export function route(): string { writeShelf(); return readShelf() + cached(); }",
			"",
		].join("\n"),
		"src/report/report.ts": [
			'import { auditShelf, SHELF_LIMIT, type ShelfType } from "../store";',
			"export function report(shelf: ShelfType): string { auditShelf(); return shelf.name.slice(SHELF_LIMIT); }",
			"",
		].join("\n"),
		"src/report/listen.ts": [
			'import { onShelf, SHELF_LIMIT } from "../store";',
			"function consume(value: unknown): void {}",
			"export function listen(names: string[]): void { names.forEach(onShelf); consume(SHELF_LIMIT); }",
			"",
		].join("\n"),
		"tests/system/store.test.ts":
			'import { unusedHelper } from "../../src/store";\nunusedHelper();\n',
		"tests/system/private.test.ts": [
			'import { cached } from "../../src/store/lib/cache";',
			'import { readShelf } from "../../src/store/lib/read";',
			'import { cached as again } from "../../src/store/lib/cache";',
			"cached(); readShelf(); again();",
			"",
		].join("\n"),
		"src/store/tests/private.test.ts": 'import { cached } from "../lib/cache";\ncached();\n',
		"docs/guide.md": "# Guide\n",
		"infra/flake/flake.nix": '{ outputs = { self }: { lib.version = "1"; }; }\n',
		"infra/chart/Chart.yaml": "apiVersion: v2\nname: cart\nversion: 1.0.0\n",
		"infra/chart/values.yaml": "replicas: 2\nimage:\n  tag: stable\n",
		"infra/chart/templates/service.yaml":
			"apiVersion: v1\nkind: Service\nmetadata:\n  name: cart\nspec:\n  ports:\n    - port: 80\n",
		"infra/routes.yaml": [
			"apiVersion: networking.k8s.io/v1",
			"kind: Ingress",
			"metadata:",
			"  name: shop",
			"spec:",
			"  defaultBackend:",
			"    service:",
			"      name: cart",
			"      port:",
			"        number: 80",
			"",
		].join("\n"),
		"infra/compose/compose.yaml": "services:\n  cart:\n    image: cart\n",
		"infra/plain/config.yaml":
			"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: settings\ndata:\n  MODE: demo\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Server", "src/server"),
					part("Store", "src/store"),
					part("Read", "src/store/lib/read.ts", "Store"),
					part("Cache", "src/store/lib/cache.ts", "Store"),
					part("Write", "src/store/lib/write.ts", "Store"),
					part("Audit", "src/store/lib/audit.ts", "Store"),
					part("Callback", "src/store/lib/callback.ts", "Store"),
					part("Util", "src/store/lib/util.ts", "Store"),
					part("Hook", "src/store/lib/hook.ts", "Store"),
					// Code of the store, drawn outside it.
					part("Inner", "src/store/lib/inner.ts"),
				],
				edges: [
					call("e1", "Server", "Read"),
					// The server reaches past the index to the cache, which the store does not expose.
					call("e2", "Server", "Cache"),
					call("e3", "Read", "Cache"),
					// Hook's callers: the server, whose code shows no use, and code inside the module.
					call("e4", "Server", "Hook"),
					call("e5", "Inner", "Hook"),
				],
				flows: [],
			},
		},
	]);
	// The store bound through its index, drawn with no caller: the board says nothing about its interface.
	board(vault, "Store alone", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Store", "src/store/index.ts"),
					part("Read", "src/store/lib/read.ts", "Store"),
					part("Audit", "src/store/lib/audit.ts", "Store"),
				],
				edges: [],
				flows: [],
			},
		},
	]);
	// A directory no language the check reads has a root file in.
	board(vault, "Docs", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [part("Manual", "docs"), part("Guide", "docs/guide.md", "Manual")],
				edges: [],
				flows: [],
			},
		},
	]);
	board(vault, "Flake", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pFlake", "infra/flake/flake.nix"),
					{
						...part("Version", "infra/flake/flake.nix", "pFlake"),
						binding: { repo: SHOP, path: "infra/flake/flake.nix", symbol: "lib.version" },
					},
				],
				edges: [],
				flows: [],
			},
		},
	]);
	board(vault, "Chart", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Routes", "infra/routes.yaml"),
					part("pChart", "infra/chart/Chart.yaml"),
					part("Values", "infra/chart/values.yaml", "pChart"),
					part("Service", "infra/chart/templates/service.yaml", "pChart"),
				],
				edges: [call("e1", "Routes", "Service"), call("e2", "Routes", "Values")],
				flows: [],
			},
		},
	]);
	for (const [name, file] of [
		["Compose", "infra/compose/compose.yaml"],
		["Manifest", "infra/plain/config.yaml"],
	] as const) {
		board(vault, name, [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: {
					nodes: [part("Module", file), part("Content", file, "Module")],
					edges: [],
					flows: [],
				},
			},
		]);
	}
	const check: typeof CheckModule = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The findings of one code on one board.
 * @param code The finding's code.
 * @param boardName The board.
 * @returns Each finding.
 */
function findings(code: string, boardName: string) {
	return outcome.findings.filter((each) => each.code === code && each.board === boardName);
}

test("an entry point the module does not expose, which a caller's code reaches from outside the module, is a warning with that use", () => {
	const unexposed = findings("ENTRY_POINT_UNEXPOSED", "Shop");
	// Read holds what the index exposes; Hook's callers show no use from outside the module.
	expect(unexposed.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Cache", "warning"],
	]);
	expect(unexposed[0]?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "Server",
			to: "Cache",
			repo: SHOP,
			path: "src/server/routes.ts",
			line: 3,
			symbol: "cached",
		},
	]);
	expect(findings("ENTRY_POINT_UNEXPOSED", "Store alone")).toEqual([]);
});

test("a hidden part whose exposed code a file no part binds uses at run time is a caller the board does not draw", () => {
	const undrawn = findings("CALLER_UNDRAWN", "Shop");
	expect(undrawn.map((each) => [each.subject?.id, each.severity])).toEqual([
		["Audit", "warning"],
		["Callback", "warning"],
	]);
	expect(undrawn[0]?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			to: "Audit",
			repo: SHOP,
			path: "src/report/report.ts",
			line: 2,
			symbol: "auditShelf",
		},
	]);
});

test("a use by a part on the board is the undrawn relationship's to report, and a use only as a type or as a value is no caller", () => {
	// The server, a part on the board, calls Write: RELATIONSHIP_UNDRAWN says so, once.
	expect(findings("RELATIONSHIP_UNDRAWN", "Shop").map((each) => each.subject?.id)).toEqual([
		"Write",
	]);
	// The report names Util's type, and reads its constant, which runs none of Util's code.
	expect(findings("CALLER_UNDRAWN", "Shop").some((each) => each.subject?.id === "Util")).toBe(
		false,
	);
});

test("an external file passing an exposed function to a callback is an undrawn caller, while a passed value is not", () => {
	const callback = findings("CALLER_UNDRAWN", "Shop").find(
		(each) => each.subject?.id === "Callback",
	);
	expect(callback?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			to: "Callback",
			repo: SHOP,
			path: "src/report/listen.ts",
			line: 3,
			symbol: "onShelf",
		},
	]);
	expect(findings("CALLER_UNDRAWN", "Shop").some((each) => each.subject?.id === "Util")).toBe(
		false,
	);
});

test("a container with no caller on its board has no caller to miss", () => {
	expect(findings("CALLER_UNDRAWN", "Store alone")).toEqual([]);
});

test("exposed names no file outside the module uses are information on the container, and a test is no caller and no root file", () => {
	for (const boardName of ["Shop", "Store alone"]) {
		const unused = findings("EXPOSED_UNUSED", boardName);
		expect(unused.map((each) => [each.subject?.id, each.severity])).toEqual([
			["Store", "information"],
		]);
		// The system test calls the helper, and the report names the type.
		expect(unused[0]?.message).toContain("unusedHelper");
		expect(unused[0]?.message).not.toContain("ShelfType");
		expect(unused[0]?.message).not.toContain("shelfFixture");
	}
});

test("a container whose module exposes nothing the check can read is listed as not judged", () => {
	const skip = outcome.skipped.find((each) => each.board === "Docs");
	expect(skip).toMatchObject({ reason: "exposure-unknown", subject: { id: "Manual" }, repo: SHOP });
	expect(outcome.findings.some((each) => each.board === "Docs")).toBe(false);
});

test("external tests use public entry files, while tests inside the module can exercise private files", () => {
	for (const boardName of ["Shop", "Store alone"]) {
		const privateImports = findings("TEST_IMPORT_UNEXPOSED", boardName);
		expect(privateImports.map((each) => [each.subject?.id, each.severity])).toEqual([
			["Store", "warning"],
			["Store", "warning"],
		]);
		expect(privateImports.map((each) => each.evidence)).toEqual([
			[
				{
					kind: "import",
					resolution: "resolved",
					repo: SHOP,
					path: "tests/system/private.test.ts",
					line: 1,
					symbol: "cached",
				},
			],
			[
				{
					kind: "import",
					resolution: "resolved",
					repo: SHOP,
					path: "tests/system/private.test.ts",
					line: 2,
					symbol: "readShelf",
				},
			],
		]);
	}
});

test("flake outputs and chart values receive interface findings, and chart templates remain private", () => {
	for (const [boardName, id] of [
		["Flake", "pFlake"],
		["Chart", "pChart"],
	] as const) {
		expect(
			findings("EXPOSED_UNUSED", boardName).map((each) => [each.subject?.id, each.severity]),
		).toEqual([[id, "information"]]);
		expect(
			outcome.skipped.some(
				(each) => each.board === boardName && each.reason === "exposure-unknown",
			),
		).toBe(false);
	}
	expect(
		findings("ENTRY_POINT_UNEXPOSED", "Chart").map((each) => [each.subject?.id, each.severity]),
	).toEqual([["Service", "warning"]]);
	expect(findings("ENTRY_POINT_UNEXPOSED", "Chart")[0]?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "Routes",
			to: "Service",
			repo: SHOP,
			path: "infra/routes.yaml",
			line: 6,
			symbol: "Service/cart",
		},
	]);
});

test("containers bound to compose files and plain manifests still have unknown exposure", () => {
	for (const boardName of ["Compose", "Manifest"]) {
		expect(
			outcome.skipped
				.filter((each) => each.board === boardName && each.reason === "exposure-unknown")
				.map((each) => each.subject?.id),
		).toEqual(["Module"]);
		expect(findings("EXPOSED_UNUSED", boardName)).toEqual([]);
	}
});

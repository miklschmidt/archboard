// The code pass reads parts bound to compose services through the compose
// adapter (ADR 0046, TASK-367.20): bindings and anchors are held to the
// services a compose file declares, and the relationships between bound
// services to the configured paths that join them once compose merges the
// override over the base.
//
// The checkout `shop`: `web` depends on `api` and reaches the ledger through
// `LEDGER_URL`; `api` depends on `db`, reaches it through `DATABASE_URL` and
// reads `api.env`, which holds a secret. A second YAML document of
// `compose.yaml` makes `ledger` depend on `db`. The override adds `cache`,
// makes `web` depend on it, and points `LEDGER_URL` at the host instead.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-compose-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const SECRET = "hunter2-tempting-secret";
let outcome: CodeCheckOutcome;

/**
 * A part bound to a compose service.
 * @param id Its id.
 * @param name Its name.
 * @param path Its compose file.
 * @param symbol The service's address.
 * @returns The node.
 */
function part(id: string, name: string, path: string, symbol: string) {
	return {
		id,
		name,
		kind: "service",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param symbol The symbol its anchor cites in `compose.yaml`, if any.
 * @returns The relationship.
 */
function edge(id: string, ends: readonly [string, string], kind: string, symbol?: string) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(symbol === undefined ? {} : { anchor: { repo: SHOP, path: "compose.yaml", symbol } }),
	};
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"compose.yaml": [
			"services:",
			"  web:",
			'    ports: ["8080:80"]',
			"    depends_on: [api]",
			"    environment:",
			"      LEDGER_URL: http://ledger:9000",
			"  api:",
			"    depends_on:",
			"      - db",
			"    environment:",
			"      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app",
			"    env_file: ./api.env",
			"  db:",
			"    image: postgres:16",
			"  ledger:",
			"    image: ledger:1",
			"---",
			"services:",
			"  ledger:",
			"    depends_on: [db]",
			"",
		].join("\n"),
		"compose.override.yml": [
			"services:",
			"  web:",
			"    depends_on:",
			"      - cache",
			"    environment:",
			"      LEDGER_URL: http://localhost:9000",
			"  cache:",
			"    image: redis:7",
			"",
		].join("\n"),
		"api.env": `DB_PASSWORD=${SECRET}\n`,
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the services");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pW", "Web", "compose.yaml", "services.web"),
					part("pA", "API", "compose.yaml", "services.api"),
					part("pD", "Database", "compose.yaml", "services.db"),
					part("pL", "Ledger", "compose.yaml", "services.ledger"),
					part("pC", "Cache", "compose.override.yml", "services.cache"),
					part("pQ", "Queue", "compose.yaml", "services.queue"),
				],
				edges: [
					edge("e1", ["pW", "pA"], "http"),
					// The anchor holds: the API's dependency names the database's declaration.
					edge("e2", ["pA", "pD"], "data", "services.db"),
					// Drawn from the database, while the API's configuration reaches it.
					edge("e3", ["pD", "pA"], "dependency"),
					edge("e4", ["pW", "pD"], "data", "services.nope"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
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

test("anchors, binding symbols and the relationships between parts bound to compose services are judged by the compose adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e4 warning",
			"BINDING_SYMBOL_MISSING pQ warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pC warning",
			"RELATIONSHIP_UNDRAWN pD warning",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
});

/**
 * The evidence of the undrawn finding on a part.
 * @param id The part's id.
 * @returns Its pieces.
 */
function undrawnOn(id: string) {
	return outcome.findings.find(
		(each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id,
	)?.evidence;
}

test("a dependency the override or a later document adds belongs to the service it adds to, and a value the override replaces joins nothing", () => {
	expect(undrawnOn("pC")).toEqual([
		{
			kind: "configured-path",
			resolution: "resolved",
			from: "pW",
			to: "pC",
			repo: SHOP,
			path: "compose.override.yml",
			line: 4,
			symbol: "services.cache",
		},
	]);
	expect(undrawnOn("pD")?.map((piece) => [piece.from, piece.path, piece.line])).toEqual([
		["pL", "compose.yaml", 20],
	]);
	// Without the merge, web's LEDGER_URL in the base would reach the ledger, undrawn.
	expect(outcome.findings.some((each) => each.subject?.id === "pL")).toBe(false);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pA", "pD", "configured-path"],
	]);
});

test("no finding quotes a value of an env file", () => {
	expect(JSON.stringify(outcome)).not.toContain(SECRET);
});

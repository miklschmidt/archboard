// The code pass with Archboard's own TypeScript language server (TASK-367.13):
// a use of a name the same file defines, a candidate by name, is resolved; a
// call through a value that only a type import names joins two parts; an
// anchor reached through a value is judged where the server names its
// definition; and no server is left running when the pass returns.
//
// The checkout `shop` holds an address helper whose two functions are bound
// as two parts, a ledger, an order that calls the ledger through a parameter
// typed by a type-only import, a memory interface the order calls through a
// parameter, and a report the board joins to the order by an anchored
// relationship whose anchor names the call to the ledger.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "@/runtime/code-check/index";
import type { CodeCheckOutcome } from "@/runtime/code-check/index";
import { readLanguageServers } from "@/runtime/language-servers/index";
import { board, git, register, write } from "@/runtime/code-check/tests/fixture";

const caller = {
	ARCHBOARD_VAULT: process.env["ARCHBOARD_VAULT"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-language-servers-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_VAULT"] = vault;
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param path The bound file.
 * @param symbol The bound symbol, if any.
 * @returns The node.
 */
function part(id: string, path: string, symbol?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
	};
}

/**
 * The pids of every process whose working directory is the checkout.
 * @returns The pids; none where the system has no `/proc`.
 */
function processesInShop(): string[] {
	if (!existsSync("/proc")) return [];
	return readdirSync("/proc").filter((pid) => {
		try {
			return /^\d+$/u.test(pid) && readlinkSync(`/proc/${pid}/cwd`) === realpathSync(shop);
		} catch {
			return false;
		}
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"tsconfig.json": JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }),
		"src/address.ts": [
			"export function normalize(name: string): string { return name.trim(); }",
			"export function addressOf(name: string): string { return normalize(name); }",
			"",
		].join("\n"),
		"src/ledger.ts":
			"export class Ledger {\n  post(amount: number): number { return amount; }\n}\n",
		"src/memory.ts": "export interface Memory {\n  remember(): void;\n}\n",
		"src/order.ts": [
			'import type { Ledger } from "./ledger";',
			"export function place(ledger: Ledger): number { return ledger.post(1); }",
			'import type { Memory } from "./memory";',
			"export function keep(memory: Memory): void { memory.remember(); }",
			"",
		].join("\n"),
		"src/report.ts": "export function report(): string { return 'r'; }\n",
	});
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pA", "src/address.ts", "addressOf"),
					part("pN", "src/address.ts", "normalize"),
					part("pL", "src/ledger.ts"),
					part("pM", "src/memory.ts"),
					part("pO", "src/order.ts"),
					part("pR", "src/report.ts"),
				],
				edges: [
					{
						id: "e1",
						order: 10,
						from: "pO",
						to: "pR",
						kind: "call",
						anchor: { repo: SHOP, path: "src/order.ts", symbol: "ledger.post" },
					},
				],
			},
		},
	]);
	const check: typeof CheckModule = await import("@/runtime/code-check/index");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	const servers = readLanguageServers(join(scratch, "language-servers.json"));
	outcome = await check.checkCode(read.boards, new AbortController().signal, servers);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The finding of one code about one subject.
 * @param code The finding's code.
 * @param id The subject's id.
 * @returns The finding, if any.
 */
function finding(code: string, id: string) {
	return outcome.findings.find((each) => each.code === code && each.subject?.id === id);
}

test("a use of a name the same file defines is resolved by the server, so its undrawn finding is a warning", () => {
	const undrawn = finding("RELATIONSHIP_UNDRAWN", "pN");
	expect(undrawn?.severity).toBe("warning");
	expect(undrawn?.evidence?.map((piece) => [piece.from, piece.to, piece.resolution])).toEqual([
		["pA", "pN", "resolved"],
	]);
});

test("a call through a value that only a type import names joins its parts, resolved", () => {
	const undrawn = finding("RELATIONSHIP_UNDRAWN", "pL");
	expect(undrawn?.severity).toBe("warning");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "call",
			resolution: "resolved",
			from: "pO",
			to: "pL",
			repo: SHOP,
			path: "src/order.ts",
			line: 2,
			symbol: "ledger.post",
		},
	]);
});

test("a call through a value that lands on a member of an interface is no evidence, because no code of the interface runs", () => {
	expect(finding("RELATIONSHIP_UNDRAWN", "pM")).toBeUndefined();
});

test("an anchor reached through a value is judged where the server names its definition", () => {
	const mismatch = finding("ANCHOR_MISMATCH", "e1");
	expect(mismatch?.severity).toBe("warning");
	expect(mismatch?.evidence?.[0]).toMatchObject({ kind: "call", resolution: "resolved", line: 2 });
});

test("the pass says nothing is missing and leaves no server running when it returns", () => {
	const reasons = outcome.skipped.map((each) => each.reason);
	expect(reasons).not.toContain("language-server-missing");
	expect(reasons).not.toContain("language-server-failed");
	expect(processesInShop()).toEqual([]);
});

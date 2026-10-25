// The code pass with Archboard's own TypeScript language server (TASK-367.13):
// a candidate that joins two parts is resolved; a call through a value is no
// evidence; an anchor reached through a value is judged where the server names
// its definition, unless that is a member of an interface, which no code runs;
// and no server is left running when the pass returns. Where this platform has
// no native tsc, these skip.
//
// The checkout `shop` holds an address helper whose two functions are bound
// as two parts, a ledger, an order that calls the ledger through a parameter
// typed by a type-only import, a memory interface the order calls through a
// parameter, and a report the board joins to the order by two anchored
// relationships: one names the call to the ledger, one the call to the memory.

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
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";
import { languageServerOf } from "#runtime/operations/language-servers/server-command.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-language-servers-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const native = languageServerOf("typescript", scratch, {}).status === "command";
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
	if (!native) return;
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
					{
						id: "e2",
						order: 20,
						from: "pO",
						to: "pR",
						kind: "call",
						anchor: { repo: SHOP, path: "src/order.ts", symbol: "memory.remember" },
					},
				],
			},
		},
	]);
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
 * The finding of one code about one subject.
 * @param code The finding's code.
 * @param id The subject's id.
 * @returns The finding, if any.
 */
function finding(code: string, id: string) {
	return outcome.findings.find((each) => each.code === code && each.subject?.id === id);
}

test.skipIf(!native)(
	"a candidate that joins two parts is resolved by the server, so its undrawn finding is a warning",
	() => {
		const undrawn = finding("RELATIONSHIP_UNDRAWN", "pN");
		expect(undrawn?.severity).toBe("warning");
		expect(undrawn?.evidence?.map((piece) => [piece.from, piece.to, piece.resolution])).toEqual([
			["pA", "pN", "resolved"],
		]);
	},
);

test.skipIf(!native)("a call through a value is no evidence, so it joins no parts", () => {
	expect(finding("RELATIONSHIP_UNDRAWN", "pL")).toBeUndefined();
	expect(finding("RELATIONSHIP_UNDRAWN", "pM")).toBeUndefined();
});

test.skipIf(!native)(
	"an anchor reached through a value is judged where the server names its definition",
	() => {
		const mismatch = finding("ANCHOR_MISMATCH", "e1");
		expect(mismatch?.severity).toBe("warning");
		expect(mismatch?.evidence?.[0]).toMatchObject({
			kind: "call",
			resolution: "resolved",
			line: 2,
		});
	},
);

test.skipIf(!native)(
	"an anchor whose call the server names on a member of an interface is not judged, because no code of the interface runs",
	() => {
		expect(finding("ANCHOR_MISMATCH", "e2")).toBeUndefined();
	},
);

test.skipIf(!native)(
	"the pass says nothing is missing and leaves no server running when it returns",
	() => {
		const reasons = outcome.skipped.map((each) => each.reason);
		expect(reasons).not.toContain("language-server-missing");
		expect(reasons).not.toContain("language-server-failed");
		expect(processesInShop()).toEqual([]);
	},
);

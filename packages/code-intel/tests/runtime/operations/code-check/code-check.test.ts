// The code pass (ADR 0046) on a vault and Git checkouts this owner builds for
// itself, with its own checkout registry through ARCHBOARD_REPOS so nothing
// reads the machine's real one.
//
// The checkout `shop` is registered and holds the code. `stranger` is a
// repository this machine has not registered, and `outside` is a directory
// beside the checkout that a symbolic link inside it points at. Two tracked
// links below `src` lead to the ignored `.env` and to a variable file, which
// both hold the name `settle`, so a pass that read where they lead would find
// it.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import {
	board as fixtureBoard,
	git as fixtureGit,
	register,
	write,
	type FixtureVariant,
} from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-check-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const STRANGER = "github.com/test/stranger";
let check: typeof CheckModule;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * Write a board into the vault.
 * @param name The board's name.
 * @param variants Its variants.
 */
function board(name: string, variants: readonly FixtureVariant[]): void {
	fixtureBoard(vault, name, variants);
}

/**
 * A part bound to code.
 * @param id Its id.
 * @param name Its name.
 * @param binding Its binding.
 * @param order Its order.
 * @returns The node.
 */
function part(id: string, name: string, binding: Record<string, string>, order: number) {
	return { id, name, kind: "module", order, binding: { repo: SHOP, ...binding } };
}

/**
 * An anchor in the shop checkout.
 * @param path The anchored file.
 * @param symbol The symbol.
 * @returns The anchor.
 */
function anchor(path: string, symbol: string): Record<string, string> {
	return { repo: SHOP, path, symbol };
}

const ledger = part("pL", "Ledger", { path: "src/ledger.ts", symbol: "Ledger.post" }, 1000);
const api = part("pA", "Api", { path: "src/api.ts" }, 2000);

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		".gitignore": ".env\nsrc/build/\n",
		".env": "post=1\nsettle=1\n",
		"src/ledger.ts": "export class Ledger {\n\tpost(): void {}\n\tposter = 1;\n}\n",
		// `reverser` is not the whole word `reverse`.
		"src/api.ts": "import { Ledger } from './ledger';\nnew Ledger().post();\nconst reverser = 1;\n",
		"src/build/out.js": "function settle() {}\n",
		"infra/prod.tfvars": "post = 1\nsettle = 1\n",
		"infra/dns.tf": 'resource "aws_route53_record" "www" {\n\tfor_each = local.domains\n}\n',
	});
	write(join(scratch, "outside"), { "secret.ts": "export const post = 1;\n" });
	symlinkSync(join(scratch, "outside", "secret.ts"), join(shop, "src", "link.ts"));
	symlinkSync(join(shop, ".env"), join(shop, "src", "env.ts"));
	symlinkSync(join(shop, "infra", "prod.tfvars"), join(shop, "src", "vars.ts"));
	git("add", "-A");
	git("add", "-f", "infra/prod.tfvars");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	board("Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					ledger,
					api,
					part("pR", "Refunds", { path: "src/ledger.ts", symbol: "refund" }, 3000),
					part("pS", "Settlement", { path: "src", symbol: "settle" }, 4000),
					part("pG", "Gone", { path: "src/gone.ts", symbol: "gone" }, 5000),
					part(
						"pP",
						"Pinned",
						{ path: "src/api.ts", symbol: "nothing", branch: "elsewhere" },
						6000,
					),
					{ id: "pX", name: "Stranger", kind: "module", order: 7000 },
					// An instance key, which can hold a separator, names an instance of the declaration `aws_route53_record.www`.
					part(
						"pD",
						"Records",
						{ path: "infra/dns.tf", symbol: 'aws_route53_record.www["example.com"]' },
						8000,
					),
				],
				edges: [
					{
						id: "e1",
						order: 1000,
						from: "pA",
						to: "pL",
						kind: "call",
						anchor: anchor("src/api.ts", "Ledger.post"),
					},
					{
						id: "e2",
						order: 2000,
						from: "pA",
						to: "pL",
						kind: "call",
						anchor: anchor("src/gone.ts", "post"),
					},
					{
						id: "e3",
						order: 3000,
						from: "pA",
						to: "pR",
						kind: "call",
						anchor: anchor("src/api.ts", "reverse"),
					},
					{
						id: "e4",
						order: 4000,
						from: "pA",
						to: "pL",
						kind: "call",
						anchor: anchor(".env", "post"),
					},
					{
						id: "e5",
						order: 5000,
						from: "pA",
						to: "pX",
						kind: "call",
						anchor: { repo: STRANGER, path: "x.ts", symbol: "x" },
					},
					{
						id: "e6",
						order: 6000,
						from: "pA",
						to: "pL",
						kind: "call",
						anchor: anchor("src/link.ts", "post"),
					},
					{
						id: "e7",
						order: 7000,
						from: "pA",
						to: "pL",
						kind: "call",
						anchor: anchor("infra/prod.tfvars", "post"),
					},
					{
						id: "e8",
						order: 8000,
						from: "pP",
						to: "pL",
						kind: "call",
						anchor: anchor("src/api.ts", "post"),
					},
				],
				flows: [
					{
						id: "f1",
						name: "Pay",
						participants: ["pA", "pL"],
						steps: [
							{
								id: "s1",
								from: "pA",
								to: "pL",
								label: "post",
								anchor: anchor("src/api.ts", "post"),
							},
							{
								id: "s2",
								from: "pA",
								to: "pL",
								label: "refund",
								anchor: anchor("src/api.ts", "refund"),
							},
						],
					},
				],
			},
		},
		{
			id: "v2",
			name: "TASK-1",
			lifecycle: "draft",
			content: { nodes: [ledger, part("pN", "Planned", { path: "src/planned.ts" }, 2000)] },
		},
		{
			id: "v3",
			name: "Old",
			lifecycle: "historical",
			content: { nodes: [part("pO", "Old", { path: "src/old.ts", symbol: "old" }, 1000)] },
		},
	]);
	board("Ops", [
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes: [api] } },
		{
			id: "v2",
			name: "TASK-1",
			lifecycle: "shelved",
			content: { nodes: [part("pN", "Planned", { path: "src/planned.ts" }, 1000)] },
		},
	]);
	board("Idea", [{ id: "v1", name: "Sketch", lifecycle: "draft", content: {} }]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Read the vault and run the pass.
 * @param variant The draft to read, if any.
 * @returns The boards read and the outcome.
 */
async function pass(variant?: string) {
	const read = check.readBoardsToCheck(vault, variant);
	if (!read.ok) throw new Error(`no draft ${variant}`);
	const outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
	return { read, outcome };
}

/**
 * Each finding as its code and the id of its subject.
 * @param outcome The pass's outcome.
 * @returns The pairs.
 */
function found(outcome: CodeCheckOutcome): string[] {
	return outcome.findings.map((finding) => `${finding.code} ${finding.subject?.id}`);
}

test("the current variant reports a missing anchored file, anchor symbol and bound symbol", async () => {
	const { read, outcome } = await pass();
	expect(read.boards.map((one) => [one.board.name, one.variant.id]).toSorted()).toEqual([
		["Ops", "v1"],
		["Shop", "v1"],
	]);
	expect(found(outcome).toSorted()).toEqual(
		[
			"BINDING_SYMBOL_MISSING pR",
			// Only an ignored file below the directory, and the ignored file and
			// the variable file the links below it lead to, hold the name.
			"BINDING_SYMBOL_MISSING pS",
			"ANCHOR_PATH_MISSING e2",
			"ANCHOR_SYMBOL_MISSING e3",
			// The link leaves the checkout.
			"ANCHOR_PATH_MISSING e6",
			"ANCHOR_SYMBOL_MISSING s2",
		].toSorted(),
	);
	expect(outcome.findings.every((finding) => finding.severity === "warning")).toBe(true);
	const step = outcome.findings.find((finding) => finding.subject?.id === "s2");
	expect(step?.subject).toEqual({ kind: "step", id: "s2", name: "Pay: Api -> Ledger: refund" });
	expect(step?.path).toBe("variants.v1.content.flows.f1.steps.s2.anchor");
});

test("what the pass cannot read is skipped with its reason, and a reason for a whole checkout names no subject", async () => {
	const { read, outcome } = await pass();
	const skips = [...read.skipped, ...outcome.skipped].map(
		(skip) => `${skip.reason} ${skip.subject?.id ?? skip.repo ?? skip.board}`,
	);
	expect(skips.toSorted()).toEqual(
		[
			"no-current-variant Idea",
			"path-ignored e4",
			"path-never-read e7",
			"ref-not-checked-out pP",
			"ref-not-checked-out e8",
			"repository-unregistered e5",
		].toSorted(),
	);
	// A repository this machine has not registered stays silent.
	expect(outcome.findings.some((finding) => finding.subject?.id === "e5")).toBe(false);
});

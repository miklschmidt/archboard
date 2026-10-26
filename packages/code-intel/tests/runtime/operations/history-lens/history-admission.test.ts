// Which variants a reading of the history lens reads, when a caller names the
// board and its variants (ADR 0045): the lens reads a live variant, a current
// one or a draft, and refuses anything else with a code of `HistoryRefusalCode`.
// A footprint sets a proposal against another variant; locality reads one.
//
// The vault is in a checkout of its own, which is registered. `Shop` is built:
// `Built` is current, `Plan` is a draft of it and `Old plan` is shelved.
// Nobody has built `Unbuilt`: `Layer one` has no parent, `Layer two` and
// `Sibling` derive from it, and `Shelved` was put away.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { HistoryRefusalCode } from "#shared/protocol/history-refusal.ts";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-history-admission-"));
const checkout = join(scratch, "checkout");
const vault = join(checkout, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const REPO = "github.com/test/admission";
let lens: typeof LensModule;
let base = "";

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: checkout,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

/**
 * The parts of a variant, each bound to a file of the checkout.
 * @param ids Checkout (`pA`) and Billing (`pB`).
 * @returns The content.
 */
function content(...ids: ("pA" | "pB")[]) {
	return {
		nodes: ids.map((id, index) => ({
			id,
			name: id === "pA" ? "Checkout" : "Billing",
			kind: "module",
			order: (index + 1) * 1000,
			binding: { repo: REPO, path: id === "pA" ? "src/a.ts" : "src/b.ts" },
		})),
	};
}

/**
 * Write a board into the vault.
 * @param name Its name.
 * @param variants Its variants.
 * @param current The id of its current variant, if it has one.
 */
function writeBoard(name: string, variants: object[], current?: string): void {
	writeFileSync(
		join(vault, `${name}.semantic.json`),
		JSON.stringify({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: name === "Shop" ? "bd" : "bu",
			name,
			level: "system",
			version: 1,
			createdAt: "2026-10-06T00:00:00.000Z",
			updatedAt: "2026-10-06T00:00:00.000Z",
			...(current === undefined ? {} : { current }),
			variants,
		}),
	);
}

beforeAll(async () => {
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify([{ repo: REPO, root: checkout, source: "declared", addedAt: "2026-10-06" }]),
	);
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${REPO}.git`);
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(checkout, "src", "a.ts"), "1\n");
	writeBoard(
		"Shop",
		[
			{ id: "v1", name: "Built", lifecycle: "current", content: content("pA") },
			{ id: "v2", name: "Plan", lifecycle: "draft", parent: "v1", content: content("pA", "pB") },
			{ id: "v3", name: "Old plan", lifecycle: "shelved", parent: "v1", content: content("pA") },
		],
		"v1",
	);
	writeBoard("Unbuilt", [
		{ id: "u1", name: "Layer one", lifecycle: "draft", content: content("pA") },
		{ id: "u2", name: "Layer two", lifecycle: "draft", parent: "u1", content: content("pA", "pB") },
		{ id: "u3", name: "Sibling", lifecycle: "draft", parent: "u1", content: content("pA", "pB") },
		{ id: "u4", name: "Shelved", lifecycle: "shelved", parent: "u1", content: content("pA") },
	]);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the boards and their code");
	base = git("rev-parse", "HEAD");
	writeFileSync(join(checkout, "src", "a.ts"), "2\n");
	git("commit", "-q", "--no-gpg-sign", "-am", "change a.ts");
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Read a footprint of a board by name, from the first commit.
 * @param board The board's name.
 * @param named The proposal, the variant it is read against and the head, by name.
 * @returns The reading.
 */
function footprint(
	board: string,
	named: { variant?: string; against?: string; head?: string } = {},
): ReturnType<typeof LensModule.readFootprint> {
	return lens.readFootprint({ vault, board, base, ...named });
}

/**
 * The code a reading refused with.
 * @param reading The reading.
 * @returns The code, or "read" when it answered.
 */
async function codeOf(reading: Promise<{ ok: true } | { ok: false; code: string }>) {
	const read = await reading;
	return read.ok ? "read" : read.code;
}

test("a proposal is read against the current variant, else its parent, else nothing", async () => {
	const against = async (board: string, named: { variant?: string; against?: string }) => {
		const read = await footprint(board, named);
		if (!read.ok) throw new Error(read.problem);
		return [read.answer.against?.id ?? null, read.answer.proposal?.id ?? null];
	};
	expect(await against("Shop", {})).toEqual(["v1", null]);
	expect(await against("Shop", { variant: "Plan" })).toEqual(["v1", "v2"]);
	expect(await against("Unbuilt", { variant: "Layer two" })).toEqual(["u1", "u2"]);
	expect(await against("Unbuilt", { variant: "Layer two", against: "Sibling" })).toEqual([
		"u3",
		"u2",
	]);
	expect(await against("Unbuilt", { variant: "Layer one" })).toEqual([null, "u1"]);
	expect(await against("Unbuilt", { against: "Layer two" })).toEqual(["u2", null]);
});

test("the footprint reads only a live variant, and never sets a variant against itself", async () => {
	expect(await codeOf(footprint("Nobody"))).toBe("BOARD_MISSING");
	expect(await codeOf(footprint("Unbuilt"))).toBe(HistoryRefusalCode.NO_CURRENT_VARIANT);
	expect(await codeOf(footprint("Shop", { variant: "Missing" }))).toBe(
		HistoryRefusalCode.UNKNOWN_VARIANT,
	);
	expect(await codeOf(footprint("Shop", { variant: "Built" }))).toBe(
		HistoryRefusalCode.NOTHING_TO_COMPARE,
	);
	expect(await codeOf(footprint("Shop", { variant: "Old plan" }))).toBe(
		HistoryRefusalCode.NOT_A_DRAFT,
	);
	expect(await codeOf(footprint("Unbuilt", { variant: "Layer two", against: "Shelved" }))).toBe(
		HistoryRefusalCode.AGAINST_NOT_LIVE,
	);
	expect(await codeOf(footprint("Unbuilt", { variant: "Layer two", against: "Layer two" }))).toBe(
		HistoryRefusalCode.NOTHING_TO_COMPARE,
	);
	expect(await codeOf(footprint("Unbuilt", { variant: "Layer two", against: "Nope" }))).toBe(
		HistoryRefusalCode.UNKNOWN_VARIANT,
	);
});

test("a head that no checkout holding a part resolves is refused, and one that resolves is read", async () => {
	expect(await codeOf(footprint("Shop", { head: "no-such-layer" }))).toBe(
		HistoryRefusalCode.HEAD_UNRESOLVED,
	);
	const read = await footprint("Shop", { head: "main" });
	if (!read.ok) throw new Error(read.problem);
	expect(read.answer.head).toBe("main");
});

test("locality reads the current variant or a named draft, and keeps its answer", async () => {
	const reading = lens.createLocalityReading();
	const variantOf = async (board: string, variant?: string) => {
		const read = await reading.read({ vault, board, variant });
		if (!read.ok) throw new Error(read.problem);
		return read.answer;
	};
	const current = await variantOf("Shop");
	expect(current.variant.id).toBe("v1");
	expect(await variantOf("Shop")).toBe(current);
	expect((await variantOf("Shop", "Plan")).variant.id).toBe("v2");
	expect((await variantOf("Unbuilt", "Layer two")).variant.id).toBe("u2");
});

test("locality reads no historical or shelved variant, and needs a variant to read", async () => {
	const reading = lens.createLocalityReading();
	const code = (board: string, variant?: string) => codeOf(reading.read({ vault, board, variant }));
	expect(await code("Nobody")).toBe("BOARD_MISSING");
	expect(await code("Unbuilt")).toBe(HistoryRefusalCode.NO_CURRENT_VARIANT);
	expect(await code("Shop", "Nowhere")).toBe(HistoryRefusalCode.UNKNOWN_VARIANT);
	expect(await code("Shop", "Old plan")).toBe(HistoryRefusalCode.NOT_A_DRAFT);
});

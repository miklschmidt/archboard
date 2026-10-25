// Change coupling (ADR 0045) on a Git repository this owner builds for itself,
// with its own checkout registry through ARCHBOARD_REPOS so nothing reads the
// machine's real one.
//
// Each pair of parts below has its own files and its own commits, so no pair
// shares a commit with another, except where a test says so. The first commit
// adds every file and is large, like every commit of more than 30 files.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { LocalityAnswerSchema, type LocalityAnswer } from "#shared/protocol/locality.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-coupling-"));
const shop = join(scratch, "shop");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
process.env["ARCHBOARD_REPOS"] = registry;
const SHOP = "github.com/test/shop";
/** Every file a large commit changes beside the files it names. */
const BULK = Array.from({ length: 31 }, (_, one) => `bulk/f${one}.txt`);
let lens: typeof LensModule;
let clock = 1_790_000_000;
let edits = 0;
let answer: LocalityAnswer;

/**
 * Run Git in the shop, each call a minute after the one before.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	clock += 60;
	const date = `@${clock} +0000`;
	const run = Bun.spawnSync(["git", ...args], {
		cwd: shop,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: globalConfig,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
			GIT_AUTHOR_DATE: date,
			GIT_COMMITTER_DATE: date,
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

/**
 * Commit an edit of each file, `times` times over, one commit each time.
 * @param files The files every commit changes.
 * @param times How many commits.
 */
function together(files: readonly string[], times = 1): void {
	for (let one = 0; one < times; one += 1) {
		edits += 1;
		for (const file of files) {
			mkdirSync(join(shop, file, ".."), { recursive: true });
			writeFileSync(join(shop, file), `${file} ${edits}\n`);
		}
		git("add", "-A");
		git("commit", "-q", "--no-gpg-sign", "-m", `${files.join(" ")} ${edits}`);
	}
}

/** Every part of the board: its id, name, bound file and what holds it. */
const PARTS = [
	["pOr", "Orders", "src/orders.ts"],
	["pBi", "Billing", "src/billing.ts"],
	["pCa", "Cart", "src/cart.ts"],
	["pPr", "Pricing", "src/pricing.ts"],
	["pSe", "Search", "src/search.ts"],
	["pIx", "Index", "src/index.ts"],
	["pRa", "Ranking", "src/ranking.ts"],
	["pCl", "Claims", "src/claims.ts"],
	["pPa", "Panes", "src/panes.ts"],
	["pFo", "Order folder", "src/o"],
	["pFi", "Order file", "src/o/one.ts"],
	["pSh", "Shipping", "src/shipping.ts"],
	["pTr", "Tracking", "src/tracking.ts"],
	["pGa", "Gateway", "src/gateway.ts", "pPy"],
	["pFr", "Fraud", "src/fraud.ts"],
	["pCt", "Catalog", "src/catalog.ts"],
	["pPd", "Product", "src/product.ts", "pCt"],
	["pMa", "Mailer", "src/mailer.ts"],
	["pTe", "Templates", "src/templates.ts"],
	["pBa", "Basket", "src/basket.ts"],
	["pLi", "Line", "src/line.ts", "pBa"],
	["pTx", "Tax", "src/tax.ts"],
] as const;

/**
 * The board: every part bound into the shop, a container that binds nothing,
 * a relationship from Tracking to Shipping, one from Fraud to the container
 * that holds Gateway, one from Line inside Basket to Tax, and a flow with one
 * step from Mailer to Templates.
 * @returns The board.
 */
function board(): SemanticBoard {
	const nodes = [
		...PARTS.map(([id, name, path, parent], index) => ({
			id,
			order: (index + 1) * 1000,
			name,
			kind: "module",
			binding: { repo: SHOP, path },
			...(parent === undefined ? {} : { parent }),
		})),
		{ id: "pPy", order: (PARTS.length + 1) * 1000, name: "Payments", kind: "service" },
	];
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Shop",
		level: "system",
		version: 1,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Built",
				lifecycle: "current",
				content: {
					nodes,
					edges: [
						{ id: "e1", order: 1000, from: "pTr", to: "pSh", kind: "call" },
						{ id: "e2", order: 2000, from: "pFr", to: "pPy", kind: "call" },
						{ id: "e3", order: 3000, from: "pLi", to: "pTx", kind: "call" },
					],
					flows: [
						{
							id: "f1",
							name: "Send mail",
							participants: ["pMa", "pTe"],
							steps: [{ id: "s1", from: "pMa", to: "pTe", label: "render" }],
						},
					],
				},
			},
		],
	});
}

/**
 * The pair of two parts, as the answer lists it, whichever order it names them in.
 * @param left One part's name.
 * @param right The other's.
 * @returns The pair, or undefined when the answer does not list it.
 */
function pair(left: string, right: string): LocalityAnswer["coupling"][number] | undefined {
	return answer.coupling.find((one) => {
		const names = new Set(one.subjects.map((subject) => subject.name));
		return names.has(left) && names.has(right);
	});
}

beforeAll(async () => {
	writeFileSync(globalConfig, "");
	mkdirSync(shop, { recursive: true });
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	writeFileSync(
		registry,
		JSON.stringify([
			{ repo: SHOP, root: shop, source: "declared", addedAt: "2026-10-06T00:00:00.000Z" },
		]),
	);
	together([...PARTS.map(([, , path]) => (path === "src/o" ? "src/o/two.ts" : path)), ...BULK]);
	// Five shared commits, and a large one that changes both and counts for
	// nothing. Billing changes nine more times alone: 5 shared commits over the
	// mean of 5 and 14 is 52.6%.
	together(["src/orders.ts", "src/billing.ts"], 5);
	together(["src/orders.ts", "src/billing.ts", ...BULK]);
	together(["src/billing.ts"], 9);
	// Four shared commits, every commit of both.
	together(["src/cart.ts", "src/pricing.ts"], 4);
	// Search shares six commits with Index and seven others with Ranking.
	// Search and Index have 20 commits each: 6 / 20 is 30% exactly. Ranking
	// has 27: 7 / 23.5 is 29.8%, which rounds to 30.
	together(["src/search.ts", "src/index.ts"], 6);
	together(["src/search.ts", "src/ranking.ts"], 7);
	together(["src/search.ts"], 7);
	together(["src/index.ts"], 14);
	together(["src/ranking.ts"], 20);
	// Two shared commits of their own, and five large ones.
	together(["src/claims.ts", "src/panes.ts"], 2);
	together(["src/claims.ts", "src/panes.ts", ...BULK], 5);
	// A file below a bound directory, which both parts count.
	together(["src/o/one.ts"], 5);
	together(["src/shipping.ts", "src/tracking.ts"], 5);
	together(["src/gateway.ts", "src/fraud.ts"], 5);
	together(["src/catalog.ts", "src/product.ts"], 5);
	together(["src/mailer.ts", "src/templates.ts"], 5);
	together(["src/basket.ts", "src/tax.ts"], 5);
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
	const value = board();
	const [variant] = value.variants;
	if (variant === undefined) throw new Error("the board has no variant");
	answer = LocalityAnswerSchema.parse(
		await lens.createLocalityReading().read(scratch, value, variant, undefined),
	);
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("a pair that shares 5 commits is listed with its shared commits and its degree, cut to whole percent", () => {
	const found = pair("Orders", "Billing");
	expect(found).toMatchObject({ repo: SHOP, shared: 5, degree: 52 });
	expect(found?.subjects.map((subject) => subject.id)).toEqual(["pOr", "pBi"]);
	expect(found?.commits).toHaveLength(5);
	const known = new Set(answer.commits.map((one) => one.commit));
	for (const one of answer.coupling) {
		expect(one.commits.every((commit) => known.has(commit))).toBe(true);
	}
});

test("a pair needs 5 shared commits whatever its degree", () => {
	expect(pair("Cart", "Pricing")).toBeUndefined();
});

test("a degree of exactly 30% is coupled, and one under it is not, though it rounds to 30", () => {
	expect(pair("Search", "Index")).toMatchObject({ shared: 6, degree: 30 });
	expect(pair("Search", "Ranking")).toBeUndefined();
});

test("large commits count for nothing, so they cannot couple two parts", () => {
	expect(pair("Claims", "Panes")).toBeUndefined();
});

test("a pair whose bound paths overlap is left out", () => {
	expect(answer.hotspots.find((one) => one.subject.id === "pFi")?.count).toBe(5);
	expect(pair("Order folder", "Order file")).toBeUndefined();
});

test("a pair is unjoined only when no relationship, step or containment joins it", () => {
	expect(pair("Orders", "Billing")?.unjoined).toBe(true);
	// A relationship, read in either direction.
	expect(pair("Shipping", "Tracking")?.unjoined).toBe(false);
	// A relationship that ends on the container that holds one of the parts.
	expect(pair("Gateway", "Fraud")?.unjoined).toBe(false);
	// A relationship from a part inside one of them.
	expect(pair("Basket", "Tax")?.unjoined).toBe(false);
	// One part inside the other.
	expect(pair("Catalog", "Product")?.unjoined).toBe(false);
	// A flow step.
	expect(pair("Mailer", "Templates")?.unjoined).toBe(false);
});

test("pairs are listed highest degree first", () => {
	const degrees = answer.coupling.map((one) => one.degree);
	expect(degrees).toEqual(degrees.toSorted((left, right) => right - left));
	expect(answer.coupling).toHaveLength(7);
});

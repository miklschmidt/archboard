import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// An agent chooses a view from text (TASK-496): `semantic views` lists every
// view of a board with what it draws at a variant, and the receipt of
// `semantic render` names every subject the picture draws and the counts of
// the marks its key shows (TASK-497).
//
// What this catches: a listing or a receipt that names or counts a subject the
// picture does not draw, such as a relationship under a sequence view; a
// listing that disagrees with the render of the same view; a view that draws
// nothing and is left out; and a picture drawn plain whose receipt still
// claims marks.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-view-listing-"));
const vault = vaultIn(holder);
let server: OwnedServer;

/**
 * Run one archboard command against the owned server.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runServerCli({ repoRoot, server, args, input });

/**
 * Run a command that has to succeed and answer JSON.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns Its answer.
 */
function ok(args: readonly string[], input?: string) {
	const ran = cli(args, input);
	expect(ran.status, `${args.join(" ")}: ${ran.stderr}`).toBe(0);
	return JSON.parse(ran.stdout);
}

const DRAFT = "Audit trail";

/** One subject a receipt names. */
interface Named {
	readonly id: string;
	readonly name: string;
	readonly standing?: string;
}

/** What a receipt says its picture draws. */
type Drawn = Record<"nodes" | "edges" | "flows" | "steps", Named[]>;

/**
 * The standing every drawn subject wears in a document, by id.
 * @param svg The document.
 * @returns Each subject's standing.
 */
function wornIn(svg: string): Map<string, string> {
	return new Map(
		[...svg.matchAll(/data-semantic-id="([^"]+)" data-semantic-standing="([a-z]+)"/gu)].map(
			(found) => [found[1]!, found[2]!],
		),
	);
}

/**
 * Draw one view to a file and read its receipt and its document.
 * @param args The variant, view and comparison to draw.
 * @returns The receipt and the SVG.
 */
function rendered(args: readonly string[]) {
	const out = path.join(holder, `${args.join("-").replaceAll(/\W+/gu, "-")}.svg`);
	const receipt = ok(["semantic", "render", "ledger", ...args, "--out", out]);
	return { receipt, svg: fs.readFileSync(out, "utf8") };
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	ok(
		["semantic", "new", "ledger", "--doing", "drawing the ledger"],
		JSON.stringify({
			level: "system",
			nodes: [
				{ name: "Gateway", kind: "service", responsibility: "Takes every request" },
				{ name: "Ledger", kind: "service", responsibility: "Records every transfer" },
			],
			edges: [{ from: "Gateway", to: "Ledger", kind: "call", label: "transfer" }],
			flows: [
				{
					name: "One transfer",
					participants: ["Gateway", "Ledger"],
					steps: [
						{ from: "Gateway", to: "Ledger", label: "transfer" },
						{ from: "Ledger", to: "Gateway", label: "receipt", kind: "return" },
					],
				},
			],
			views: [
				{
					name: "Exchange",
					grammar: "sequence",
					scope: { kind: "selection", flows: ["One transfer"] },
				},
			],
		}),
	);
	const doing = "proposing an audit trail";
	ok(["semantic", "branch", "ledger", "--as", DRAFT, "--expect-version", "1", "--doing", doing]);
	const board = ok(["semantic", "show", "ledger"]).board;
	const draft = board.variants.find((one: { name: string }) => one.name === DRAFT).content;
	const call = draft.edges[0];
	const flow = draft.flows[0];
	// The draft rewords the call and the first message, and adds an auditor.
	ok(
		["semantic", "edit", "ledger", "--variant", DRAFT, "--expect-version", "2", "--doing", doing],
		JSON.stringify({
			nodes: [{ name: "Auditor", kind: "service", responsibility: "Reads the ledger nightly" }],
			edges: [
				{ ...call, label: "transfer with an audit id" },
				{ from: "Auditor", to: "Ledger", kind: "call", label: "reconcile" },
			],
			flows: [
				{
					...flow,
					steps: [{ ...flow.steps[0], label: "transfer with an audit id" }, flow.steps[1]],
				},
			],
			views: [
				{
					name: "Audit",
					grammar: "architecture",
					scope: { kind: "selection", nodes: ["Auditor"] },
				},
			],
		}),
	);
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

describe("semantic views", () => {
	test(
		"lists every view at the variant as semantic render draws it",
		() => {
			const listing = ok(["semantic", "views", "ledger", "--variant", DRAFT]);
			expect(listing.variant.name).toBe(DRAFT);
			expect(listing.comparedWith).not.toBeNull();
			const names = listing.views.map((one: { view: { name: string } | null }) => one.view?.name);
			expect(names).toEqual([undefined, "Exchange", "Audit", "Everything"]);
			for (const listed of listing.views) {
				const view = listed.view === null ? [] : ["--view", listed.view.id];
				// The listing gives the picture's size before a title or a key.
				const { receipt } = rendered(["--variant", DRAFT, ...view, "--no-legend"]);
				const drawn = receipt.drawn as Drawn;
				expect(listed.drawn).toEqual({
					nodes: drawn.nodes.length,
					edges: drawn.edges.length,
					flows: drawn.flows.length,
					steps: drawn.steps.length,
				});
				expect(listed.marks).toEqual(receipt.marks);
				expect(listed.size).toEqual({ width: receipt.width, height: receipt.height });
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"lists a view that draws nothing at the variant, with nothing drawn",
		() => {
			const listing = ok(["semantic", "views", "ledger"]);
			const audit = listing.views.find(
				(one: { view: { name: string } | null }) => one.view?.name === "Audit",
			);
			expect(audit).toEqual({
				view: expect.objectContaining({ name: "Audit" }),
				drawn: { nodes: 0, edges: 0, flows: 0, steps: 0 },
				marks: null,
				size: null,
			});
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"marks nothing without the comparison, and refuses --against with --no-comparison",
		() => {
			const listing = ok(["semantic", "views", "ledger", "--variant", DRAFT, "--no-comparison"]);
			expect(listing.comparedWith).toBeNull();
			expect(listing.views.map((one: { marks: unknown }) => one.marks)).toEqual(
				listing.views.map(() => null),
			);
			const refused = cli([
				"semantic",
				"views",
				"ledger",
				"--against",
				"Initial",
				"--no-comparison",
			]);
			expect(refused.status).toBe(2);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});

describe("the render receipt", () => {
	test(
		"names what a sequence draws and how each stands, as the picture marks it",
		() => {
			const { receipt, svg } = rendered(["--variant", DRAFT, "--view", "Exchange"]);
			const drawn = receipt.drawn as Drawn;
			// A sequence draws its participants, its flow and its messages, and no relationship,
			// so the reworded call is neither named nor counted.
			expect(drawn.edges).toEqual([]);
			expect(drawn.nodes.map(({ name }) => name).toSorted()).toEqual(["Gateway", "Ledger"]);
			const named = Object.values(drawn).flat();
			expect(new Map(named.map(({ id, standing }) => [id, standing]))).toEqual(wornIn(svg));
			const marked = (standing: string) => named.filter((one) => one.standing === standing).length;
			expect(receipt.marks).toEqual({
				added: marked("added"),
				changed: marked("changed"),
				removed: marked("removed"),
			});
			expect(receipt.marks.changed).toBeGreaterThan(0);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"names what a plain picture draws without a standing, and no marks",
		() => {
			const { receipt } = rendered(["--variant", DRAFT, "--no-comparison"]);
			expect(receipt.marks).toBeNull();
			const named = Object.values(receipt.drawn as Drawn).flat();
			expect(named.length).toBeGreaterThan(0);
			expect(named.every((one) => one.standing === undefined)).toBe(true);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});

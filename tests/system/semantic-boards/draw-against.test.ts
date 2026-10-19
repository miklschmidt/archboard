import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_WALL_CLOCK_BUDGET_MS } from "../support/timing.ts";

// A stacked pull request is drawn against the one below it (TASK-478.01): `semantic render`,
// `semantic rasterize` and `semantic record` take `--against`, as `semantic compare` does.
//
// What this catches: a picture that marks what the pull requests below it added, because it was
// read against the current variant; a picture of unbuilt work that is still framed "Planned"; a
// receipt that does not say what the picture was drawn against; a name that is not a variant, the
// drawn variant itself, or a request for no comparison that is drawn anyway; and a recording that
// would start a voice session before it refused any of them.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-draw-against-"));
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

const FRAME = 'data-slot="planned-frame"';

const level = "system";
const base = [
	{ name: "Gateway", kind: "service", responsibility: "Takes every request" },
	{ name: "Ledger", kind: "service", responsibility: "Records every transfer" },
];

/**
 * Run a command that has to succeed.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns Its standard output.
 */
function ok(args: readonly string[], input?: string): string {
	const ran = cli(args, input);
	expect(ran.status, `${args.join(" ")}: ${ran.stderr}`).toBe(0);
	return ran.stdout;
}

/**
 * Add one part to a variant of a board.
 * @param board The board.
 * @param variant The variant.
 * @param name The part's name.
 * @param version The version the board is at.
 */
function addPart(board: string, variant: string, name: string, version: number): void {
	ok(
		["semantic", "edit", board, "--expect-version", String(version), "--doing", `adding ${name}`],
		JSON.stringify({
			variant,
			nodes: [{ name, kind: "service", responsibility: `Is the ${name}` }],
		}),
	);
}

/**
 * Make a stack of three variants, each one part larger than the one it came from.
 * @param board The board's name.
 * @param lifecycle Whether the bottom of the stack is the current architecture.
 */
function stack(board: string, lifecycle: "current" | "draft"): void {
	ok(
		["semantic", "new", board, "--doing", `drawing ${board}`],
		JSON.stringify({
			level,
			variant: "base",
			...(lifecycle === "draft" ? { lifecycle } : {}),
			nodes: base,
		}),
	);
	const doing = "stacking proposals";
	ok(["semantic", "branch", board, "--as", "one", "--expect-version", "1", "--doing", doing]);
	addPart(board, "one", "Worker", 2);
	const second = ["semantic", "branch", board, "--as", "two", "--from", "one"];
	ok([...second, "--expect-version", "3", "--doing", doing]);
	addPart(board, "two", "Cache", 4);
}

/**
 * The parts a drawing marks as added.
 * @param svg The drawing.
 * @returns Their ids, sorted.
 */
function addedIn(svg: string): string[] {
	const marked = svg.matchAll(
		/data-semantic-kind="node" data-semantic-id="([^"]+)" data-semantic-standing="added"/gu,
	);
	return [...marked].map((one) => one[1]!).toSorted();
}

/**
 * The parts `semantic compare` reports as added.
 * @param board The board.
 * @param args The variant to compare, and what to read it against.
 * @returns Their ids, sorted.
 */
function comparedAdded(board: string, args: readonly string[]): string[] {
	const answer = JSON.parse(ok(["semantic", "compare", board, ...args]));
	return answer.nodes
		.filter((node: { standing: string }) => node.standing === "added")
		.map((node: { id: string }) => node.id)
		.toSorted();
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	stack("built", "current");
	stack("planned", "draft");
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

describe("semantic render --against", () => {
	test(
		"marks the entries semantic compare --against reports, and not what the variants below added",
		() => {
			const stacked = ok(["semantic", "render", "built", "--variant", "two", "--against", "one"]);
			const expected = comparedAdded("built", ["--variant", "two", "--against", "one"]);
			expect(expected).toHaveLength(1);
			expect(addedIn(stacked)).toEqual(expected);

			// Read against the current variant, as it is without the option, the picture
			// marks the part of the proposal below it as well.
			const ordinary = ok(["semantic", "render", "built", "--variant", "two"]);
			expect(addedIn(ordinary)).toHaveLength(2);
			expect(addedIn(ordinary)).toEqual(expect.arrayContaining(expected));
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"carries no planned frame, also on a board with no current variant, and says what it was drawn against",
		() => {
			const framed = ok(["semantic", "render", "planned", "--variant", "two"]);
			expect(framed).toContain(FRAME);

			const out = path.join(holder, "against.svg");
			const receipt = JSON.parse(
				ok([
					"semantic",
					"render",
					"planned",
					"--variant",
					"two",
					"--against",
					"base",
					"--out",
					out,
				]),
			);
			expect(fs.readFileSync(out, "utf8")).not.toContain(FRAME);
			expect(receipt.comparedWith).toMatchObject({ name: "base", lifecycle: "draft" });
			expect(receipt.variant).toMatchObject({ name: "two" });
			// Both parts the variants below added are marked: the picture is read against `base`.
			expect(addedIn(fs.readFileSync(out, "utf8"))).toEqual(
				comparedAdded("planned", ["--variant", "two", "--against", "base"]),
			);
			expect(addedIn(fs.readFileSync(out, "utf8"))).toHaveLength(2);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);

	test(
		"refuses a variant the board lacks, the drawn variant itself, and no comparison, as usage",
		() => {
			for (const command of ["render", "rasterize"]) {
				const unknown = cli([
					"semantic",
					command,
					"built",
					"--variant",
					"two",
					"--against",
					"nope",
				]);
				expect(unknown.status).toBe(2);
				expect(unknown.stderr).toContain("nope");
				// The refusal `semantic compare --against` gives for the same name.
				const compare = cli([
					"semantic",
					"compare",
					"built",
					"--variant",
					"two",
					"--against",
					"nope",
				]);
				expect(compare.status).toBe(2);
				expect(unknown.stderr.split("\n")[0]).toBe(compare.stderr.split("\n")[0]);

				const itself = cli(["semantic", command, "built", "--variant", "two", "--against", "two"]);
				expect(itself.status).toBe(2);

				const stated = ["semantic", command, "built", "--variant", "two"];
				const none = cli([...stated, "--against", "one", "--no-comparison"]);
				expect(none.status).toBe(2);
			}
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});

describe("semantic rasterize --against", () => {
	test(
		"draws the same picture and names what it was drawn against",
		() => {
			const out = path.join(holder, "against.png");
			const receipt = JSON.parse(
				ok([
					"semantic",
					"rasterize",
					"planned",
					"--variant",
					"two",
					"--against",
					"one",
					"--out",
					out,
				]),
			);
			expect(receipt.comparedWith).toMatchObject({ name: "one" });
			expect(fs.statSync(out).size).toBeGreaterThan(0);
			const svg = ok(["semantic", "render", "planned", "--variant", "two", "--against", "one"]);
			expect(svg).not.toContain(FRAME);
			expect(receipt.diagram.width).toBeGreaterThan(0);
		},
		TEST_WALL_CLOCK_BUDGET_MS,
	);
});

describe("semantic record --against", () => {
	test("refuses a variant the board lacks and the recorded variant itself before it starts anything", () => {
		const out = path.join(holder, "talk.mp4");
		for (const against of ["nope", "two"]) {
			const talk = path.join(holder, `talk-${against}`);
			const stated = ["semantic", "record", "built", "--variant", "two", "--against", against];
			const refused = cli([...stated, "--out", out, "--talk", talk]);
			expect(refused.status, refused.stderr).toBe(2);
		}
		expect(fs.existsSync(out)).toBe(false);
		expect(fs.existsSync(path.join(holder, "talk-nope"))).toBe(false);
	});
});

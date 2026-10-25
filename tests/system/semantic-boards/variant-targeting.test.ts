import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BoardListingSchema } from "@archboard/board/board-listing";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

// Which variant a write lands on can be said on the command line, as it is for
// every other variant command, or inside the stated change. The rule itself is
// owned by the command test beside edit and resolve (variant-change.test.ts); what is owned here is what the
// rule does to a board: the flag decides where the change lands, it says what it
// overrode even when the write it aimed at is refused, and edit and resolve both
// behave that way. A board nobody has built has no current variant, so what its
// bare name opens and what adopting it means are owned here too, as is adopting
// a proposal whose base another adoption superseded (ADR 0037).

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-variant-targeting-"));
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
 * The board as it stands.
 * @returns The aggregate.
 */
function board(): {
	version: number;
	current: string;
	variants: {
		id: string;
		name: string;
		reconciliation?: unknown;
		content: { nodes: { id: string; name: string }[] };
	}[];
} {
	const read = cli(["semantic", "show", "queues"]);
	expect(read.status, read.stderr).toBe(0);
	return JSON.parse(read.stdout).board;
}

/**
 * What one variant's parts are called.
 * @param name The variant's name.
 * @returns The names.
 */
function partsOf(name: string): string[] {
	const variant = board().variants.find((one) => one.name === name);
	expect(variant, name).toBeDefined();
	return (variant?.content.nodes ?? []).map((node) => node.name);
}

/**
 * What one part of one variant is identified by.
 * @param variant The variant's name.
 * @param part The part's name.
 * @returns The part's id.
 */
function idOfPart(variant: string, part: string): string {
	const found = board()
		.variants.find((one) => one.name === variant)
		?.content.nodes.find((node) => node.name === part);
	expect(found, `${variant}/${part}`).toBeDefined();
	return found?.id ?? "";
}

/**
 * Change the board, naming the variant however the case is about.
 * @param args What to put after the board's name.
 * @param batch The stated change.
 * @returns What the command printed and how it exited.
 */
function edit(args: readonly string[], batch: Record<string, unknown>) {
	return cli(
		[
			"semantic",
			"edit",
			"queues",
			...args,
			"--expect-version",
			String(board().version),
			"--doing",
			"changing one variant of the queue board",
		],
		JSON.stringify(batch),
	);
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
	const made = cli(
		["semantic", "new", "queues", "--doing", "starting the queue board"],
		JSON.stringify({ level: "system", nodes: [{ name: "Intake", kind: "service" }] }),
	);
	expect(made.status, made.stderr).toBe(0);
	const branched = cli([
		"semantic",
		"branch",
		"queues",
		"--as",
		"Queued ingest",
		"--expect-version",
		String(board().version),
		"--doing",
		"proposing a queue",
	]);
	expect(branched.status, branched.stderr).toBe(0);
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

describe("saying which variant an edit lands on", () => {
	test("--variant targets the variant and leaves the current one alone", () => {
		const current = board();
		const currentName = current.variants.find((one) => one.id === current.current)?.name ?? "";
		const landed = edit(["--variant", "Queued ingest"], {
			nodes: [{ name: "Ingest queue", kind: "queue" }],
		});
		expect(landed.status, landed.stderr).toBe(0);
		expect(partsOf("Queued ingest")).toContain("Ingest queue");
		expect(partsOf(currentName)).not.toContain("Ingest queue");
	}, 20_000);

	test("the command line wins over a batch naming another variant, and says so", () => {
		const before = board();
		const currentName = before.variants.find((one) => one.id === before.current)?.name ?? "";
		const landed = edit(["--variant", "Queued ingest"], {
			variant: currentName,
			nodes: [{ name: "Retries", kind: "queue" }],
		});
		expect(landed.status, landed.stderr).toBe(0);
		// The flag's variant took the change; the one the batch named did not.
		expect(partsOf("Queued ingest")).toContain("Retries");
		expect(partsOf(currentName)).not.toContain("Retries");
		// Said once, on the channel every other warning uses, naming both so the
		// author can see which of the two was passed over.
		const warned = landed.stderr
			.split("\n")
			.filter((line) => line.includes("Queued ingest") && line.includes(currentName));
		expect(warned).toHaveLength(1);
		// And the answer an agent parses is still the board, with nothing said
		// about the overridden variant mixed into it.
		expect(JSON.parse(landed.stdout).board.version).toBe(before.version + 1);
	}, 20_000);

	test("a flag naming no variant is refused, and still says what it overrode", () => {
		const before = board();
		const currentName = before.variants.find((one) => one.id === before.current)?.name ?? "";
		const refused = edit(["--variant", "Quued ingest"], {
			variant: currentName,
			nodes: [{ name: "Mistyped", kind: "queue" }],
		});
		// The mistyped flag is the case the override makes reachable, so it is the
		// case the warning has to survive: the write never comes back, and the
		// author still has to learn that what they stated was passed over.
		expect(refused.status).not.toBe(0);
		const warned = refused.stderr
			.split("\n")
			.filter((line) => line.includes("Quued ingest") && line.includes(currentName));
		expect(warned).toHaveLength(1);
		const after = board();
		expect(after.version).toBe(before.version);
		for (const variant of after.variants) {
			expect(variant.content.nodes.map((node) => node.name)).not.toContain("Mistyped");
		}
	}, 20_000);

	test("settling says the same thing the same way when the two disagree", () => {
		// A disagreement to settle: the draft and the current variant rename one
		// part differently, so the draft holds a competing field.
		const start = board();
		const startName = start.variants.find((one) => one.id === start.current)?.name ?? "";
		const intakeId = idOfPart(startName, "Intake");
		expect(
			edit(["--variant", "Queued ingest"], {
				nodes: [{ id: intakeId, name: "Ingest", kind: "service" }],
			}).status,
		).toBe(0);
		const parentEdit = edit([], {
			nodes: [{ id: intakeId, name: "Front door", kind: "service" }],
		});
		expect(parentEdit.status, parentEdit.stderr).toBe(0);
		const held = board();
		const currentName = held.variants.find((one) => one.id === held.current)?.name ?? "";

		const settled = cli(
			[
				"semantic",
				"resolve",
				"queues",
				"--variant",
				"Queued ingest",
				"--expect-version",
				String(held.version),
				"--doing",
				"keeping the draft's name for the intake",
			],
			JSON.stringify({
				variant: currentName,
				choices: [{ subject: intakeId, field: "name", side: "mine" }],
			}),
		);
		expect(settled.status, settled.stderr).toBe(0);
		const warned = settled.stderr
			.split("\n")
			.filter((line) => line.includes("Queued ingest") && line.includes(currentName));
		expect(warned).toHaveLength(1);
		// The proposal the command line named is the one that was settled.
		const after = board();
		const draft = after.variants.find((one) => one.name === "Queued ingest");
		expect(draft?.reconciliation).toBeUndefined();
		expect(partsOf("Queued ingest")).toContain("Ingest");
	}, 30_000);
});

describe("a board nobody has built", () => {
	test("is drawn by its name and adopted into existence", async () => {
		const planned = "unbuilt";
		const made = cli(
			["semantic", "new", planned, "--doing", "planning an architecture nobody has built"],
			JSON.stringify({
				level: "system",
				lifecycle: "draft",
				nodes: [
					{
						name: "API",
						kind: "system",
						drillDown: { board: "queues", variant: { kind: "current" } },
					},
				],
			}),
		);
		expect(made.status, made.stderr).toBe(0);
		const held = JSON.parse(cli(["semantic", "show", planned]).stdout).board;
		expect(held.current).toBeUndefined();
		const [draft] = held.variants;
		// What the route answers is what the browser's parse of it keeps.
		const listing = BoardListingSchema.parse(
			await (
				await fetch(`${server.base}/api/semantic-boards?vault=${encodeURIComponent(server.vault)}`)
			).json(),
		);
		const listed = listing.boards.find((entry) => entry.name === planned);
		expect(listed?.opens).toBe(draft.id);
		expect(listed?.links).toEqual([
			{ board: "queues", variant: null, node: "API", container: false },
		]);

		// Its bare name draws the draft, with no current variant pretending to be it.
		const drawn = cli(["semantic", "render", planned, "--out", path.join(vault, "unbuilt.svg")]);
		expect(drawn.status, drawn.stderr).toBe(0);
		expect(JSON.parse(drawn.stdout).variant).toMatchObject({ id: draft.id, lifecycle: "draft" });

		/**
		 * Adopt one variant of the board as it now stands.
		 * @param variant The variant to adopt.
		 * @returns What the command printed and how it exited.
		 */
		const adopt = (variant: string) =>
			cli([
				"semantic",
				"adopt",
				planned,
				"--variant",
				variant,
				"--expect-version",
				String(JSON.parse(cli(["semantic", "show", planned]).stdout).board.version),
				"--doing",
				"adopting what was built",
			]);
		expect(adopt("current").status).not.toBe(0);
		const adopted = adopt(draft.name);
		expect(adopted.status, adopted.stderr).toBe(0);
		const after = JSON.parse(cli(["semantic", "show", planned]).stdout).board;
		expect(after.current).toBe(draft.id);
		expect(after.adoptions).toEqual([{ variant: draft.id, at: expect.any(String) }]);
	}, 60_000);

	test("a proposal built on an architecture a later adoption superseded is adopted only when forced", () => {
		expect(
			cli(
				["semantic", "new", "superseding", "--doing", "starting a board to adopt twice on"],
				JSON.stringify({ level: "system", nodes: [{ name: "API", kind: "service" }] }),
			).status,
		).toBe(0);
		const show = () => JSON.parse(cli(["semantic", "show", "superseding"]).stdout).board;
		const baseline = show().variants[0].name;
		/**
		 * Run one lifecycle command at the version the board is at.
		 * @param args The command after `semantic`, without the version and doing line.
		 * @returns What the command printed and how it exited.
		 */
		const write = (...args: string[]) =>
			cli([
				"semantic",
				...args,
				"--expect-version",
				String(show().version),
				"--doing",
				`${args[0]} on the superseding board`,
			]);
		// Two tasks branch from the same current variant, and the first is adopted.
		expect(write("branch", "superseding", "--as", "Queue").status).toBe(0);
		expect(write("branch", "superseding", "--as", "Cache").status).toBe(0);
		expect(write("adopt", "superseding", "--variant", "Queue").status).toBe(0);

		const before = show();
		const refused = write("adopt", "superseding", "--variant", "Cache");
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain(baseline);
		expect(refused.stderr).toContain("Queue");
		expect(show()).toEqual(before);

		const forced = write("adopt", "superseding", "--variant", "Cache", "--force");
		expect(forced.status, forced.stderr).toBe(0);
		const after = show();
		const cache = after.variants.find((one: { name: string }) => one.name === "Cache");
		expect(after.current).toBe(cache.id);
		expect(after.adoptions.at(-1)).toMatchObject({ variant: cache.id, forced: true });
		// A proposal branched from the current variant adopts as before, unforced.
		expect(write("branch", "superseding", "--as", "Worker").status).toBe(0);
		expect(write("adopt", "superseding", "--variant", "Worker").status).toBe(0);
		expect(show().adoptions.at(-1).forced).toBeUndefined();
	}, 60_000);
});

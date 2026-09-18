import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// Which variant a write lands on can be said on the command line, as it is for
// every other variant command, or inside the stated change. The rule itself is
// owned by the unit test beside targetedVariant; what is owned here is what the
// rule does to a board: the flag decides where the change lands, it says what it
// overrode even when the write it aimed at is refused, and edit and resolve both
// behave that way.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-variant-targeting-"));
let canvas: OwnedCanvas;

/**
 * Run one archboard command against the owned canvas.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runCanvasCli({ repoRoot, vault, base: canvas.base, args, input });

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
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
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
	await canvas?.dispose();
	fs.rmSync(vault, { recursive: true, force: true });
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

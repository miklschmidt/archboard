import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { runCanvasCli } from "../support/run-cli.ts";

// Which variant a write lands on can be said on the command line, as it is for
// every other variant command, or inside the stated change. This owner holds the
// two to one meaning: the flag targets the variant, the two agreeing is one
// statement, and two different ones land on the flag's variant with a warning
// naming both — the same rule, said the same way, on edit and on resolve.

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

	test("the flag and the batch saying the same variant is one statement, not two", () => {
		const landed = edit(["--variant", "Queued ingest"], {
			variant: "Queued ingest",
			nodes: [{ name: "Dead letters", kind: "queue" }],
		});
		expect(landed.status, landed.stderr).toBe(0);
		expect(partsOf("Queued ingest")).toContain("Dead letters");
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
		expect(warned.length).toBeGreaterThan(0);
		// And the answer an agent parses is still the board, with nothing said
		// about the overridden variant mixed into it.
		expect(JSON.parse(landed.stdout).board.version).toBe(before.version + 1);
	}, 20_000);

	test("settling says the same thing the same way when the two disagree", () => {
		// A disagreement to settle: the draft and the current variant rename one
		// part differently, so the draft holds a competing field.
		const intake = board().variants[0]?.content.nodes[0];
		expect(intake?.id).toBeDefined();
		const intakeId = intake?.id ?? "";
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
		expect(warned.length).toBeGreaterThan(0);
		// The proposal the command line named is the one that was settled.
		const after = board();
		const draft = after.variants.find((one) => one.name === "Queued ingest");
		expect(draft?.reconciliation).toBeUndefined();
		expect(partsOf("Queued ingest")).toContain("Ingest");
	}, 30_000);
});

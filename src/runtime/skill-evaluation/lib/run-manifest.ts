// What one run writes down about itself, and the only reading of it. A run
// records the class of every command its author ran and every kind of material
// it reached for; the manifest is where that survives the run, so the schema
// that reads run.json is the schema that writes it. A class the classifier
// produces and the schema does not name is a type error here, not a zero in
// the report.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CommandClass, ExposureKind } from "@/runtime/skill-evaluation/lib/classify";

const UsageSchema = z.object({
	input: z.number(),
	cached: z.number(),
	cacheWrite: z.number().nullable(),
	output: z.number(),
	reasoning: z.number().nullable(),
	total: z.number(),
});

/**
 * A count per class, every class named. A manifest written before a class
 * existed carries none of it, which is nought rather than unknown: its author
 * was classified without that class.
 */
const CommandCountsSchema = z.object({
	discovery: z.number().default(0),
	operation: z.number().default(0),
	"code-investigation": z.number().default(0),
	"product-source": z.number().default(0),
	setup: z.number().default(0),
	ambiguous: z.number().default(0),
} satisfies Record<CommandClass, z.ZodDefault<z.ZodNumber>>);

/** A count per kind of evaluation material, every kind named, absent kinds nought. */
const ExposureCountsSchema = z.object({
	"evaluation-inputs": z.number().default(0),
	"harness-source": z.number().default(0),
	"skill-package": z.number().default(0),
	"other-run": z.number().default(0),
} satisfies Record<ExposureKind, z.ZodDefault<z.ZodNumber>>);

/** A run manifest as run.json holds it, as far as the report reads it. */
const RunManifestSchema = z
	.object({
		run: z.string(),
		arm: z.enum(["baseline", "candidate"]),
		scenario: z.string(),
		workflow: z.string(),
		report: z.enum(["primary", "broad"]),
		repetition: z.number(),
		status: z.enum(["completed", "failed", "timed-out", "cancelled"]),
		author: z.object({ durationMs: z.number() }).passthrough().optional(),
		usage: UsageSchema.nullable(),
		commandCounts: CommandCountsSchema,
		// Absent from manifests written before the evidence repair (TASK-212);
		// such a run recorded neither, and the report says so rather than guessing.
		directWrites: z.number().optional(),
		exposure: ExposureCountsSchema.optional(),
		// Absent from manifests written before the guidance a scenario names was
		// recorded (TASK-235); such a run cannot say what its author read.
		guidance: z
			.object({
				expected: z.array(z.string()),
				read: z.array(z.string()),
				missing: z.array(z.string()),
			})
			.optional(),
		// Absent from manifests written before captures were taken (TASK-214);
		// such a run has no picture the grader could have looked at.
		captures: z
			.object({
				declared: z.array(z.string()),
				captured: z.array(z.string()),
				failed: z.array(z.string()),
			})
			.optional(),
		outcomesPassed: z.boolean(),
		guardrailsPassed: z.boolean(),
	})
	.passthrough();
type RunManifest = z.infer<typeof RunManifestSchema>;

/**
 * What a run must write down, beside whatever else it records of itself. The
 * counts are named here rather than left to the schema's input type so that a
 * class the classifier gained and the manifest cannot carry is a type error at
 * the writer; everything else the schema checks as it is written.
 */
interface RunManifestFields {
	readonly commandCounts: Readonly<Record<CommandClass, number>>;
	readonly exposure?: Readonly<Record<ExposureKind, number>> | undefined;
	readonly [fact: string]: unknown;
}

/**
 * Writes one run's manifest, having read it back as the report will. A run
 * that cannot say what it did is a failure of the run, not a silent nought
 * on the comparison.
 * @param directory The run's directory.
 * @param manifest What the run has to say.
 * @returns Where it was written.
 */
function writeRunManifest(directory: string, manifest: RunManifestFields): string {
	RunManifestSchema.parse(manifest);
	const file = path.join(directory, "run.json");
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(manifest, null, "\t")}\n`);
	return file;
}

/**
 * Every run directory of a batch. A run keeps its whole world, its author's
 * transcript and its codex home beside its manifest, so a batch's runs tree
 * runs to tens of gigabytes; the layout is `runs/<arm>/<scenario>/<repetition>`,
 * so the three levels are read by name and nothing below them is ever walked.
 * @param batchRoot The batch.
 * @returns The directories, empty when the batch has no runs yet.
 */
function runDirectories(batchRoot: string): string[] {
	const runs = path.join(batchRoot, "runs");
	return subdirectories(runs)
		.flatMap((arm) =>
			subdirectories(path.join(runs, arm)).map((name) => path.join(runs, arm, name)),
		)
		.flatMap((scenario) =>
			subdirectories(scenario).map((repetition) => path.join(scenario, repetition)),
		);
}

/**
 * The subdirectory names of one directory, without descending into them.
 * @param directory The directory, which need not exist.
 * @returns The names, empty when it does not.
 */
function subdirectories(directory: string): string[] {
	if (!fs.existsSync(directory)) return [];
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

export {
	CommandCountsSchema,
	ExposureCountsSchema,
	RunManifestSchema,
	runDirectories,
	writeRunManifest,
	type RunManifest,
	type RunManifestFields,
};

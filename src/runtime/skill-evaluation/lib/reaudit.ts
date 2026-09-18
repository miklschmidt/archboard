// A run's exposure as the current classifier reads its stored commands, not as
// the classifier of the day it ran did. Exposure is decided once at run time
// and kept in run.json; a classifier that later stops mistaking a read of
// nothing for a read of another run would otherwise never reach a saved batch,
// whose runs are graded and cannot be run again.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	classifyCommands,
	exposureCounts,
	type ClassificationContext,
	type ExposureKind,
} from "@/runtime/skill-evaluation/lib/classify";
import type { CommandRecord } from "@/runtime/skill-evaluation/lib/events";
import type { RunManifest } from "@/runtime/skill-evaluation/lib/run-manifest";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

/** What a batch manifest says of where its runs happened, as far as the audit needs it. */
const BatchPlacesSchema = z
	.object({
		archboard: z.string().optional(),
		pins: z
			.object({ baselineSkill: z.object({ location: z.string() }).passthrough() })
			.passthrough(),
	})
	.passthrough();

/** Where the skill a run was given was installed, as its manifest recorded it. */
const InstallSchema = z.object({ install: z.object({ skillRoot: z.string() }).passthrough() });

/** One stored command, as far as the classifier reads it. */
const StoredCommandsSchema = z.array(
	z
		.object({
			command: z.string(),
			exitCode: z.number().nullable(),
			status: z.string(),
			output: z.string().default(""),
		})
		.passthrough(),
);

/**
 * The directory a run was recorded in, by the batch layout.
 * @param batchRoot The batch as it sits now.
 * @param manifest The run.
 * @returns The run's directory.
 */
function runDirectory(batchRoot: string, manifest: RunManifest): string {
	return path.join(batchRoot, "runs", manifest.arm, manifest.scenario, String(manifest.repetition));
}

/**
 * Where the batch sat when the run happened, which is what its commands name:
 * the prefix of the installed skill's recorded path before this run's place in
 * the layout. A batch moved since keeps its runs' commands and changes this.
 * @param batchRoot The batch as it sits now.
 * @param manifest The run.
 * @returns The batch root as recorded, or as it sits now when the run recorded no install.
 */
function recordedBatchRoot(batchRoot: string, manifest: RunManifest): string {
	const current = path.resolve(batchRoot);
	const install = InstallSchema.safeParse(manifest);
	if (!install.success) return current;
	const place = `${path.sep}${path.relative(current, runDirectory(current, manifest))}${path.sep}world${path.sep}`;
	const at = install.data.install.skillRoot.lastIndexOf(place);
	return at < 0 ? current : install.data.install.skillRoot.slice(0, at);
}

/**
 * The commands a run stored, as far as the classifier reads them.
 * @param file The run's commands.json.
 * @returns The commands.
 */
function storedCommands(file: string): CommandRecord[] {
	return StoredCommandsSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))).map(
		({ command, exitCode, status, output }) => ({ command, exitCode, status, output }),
	);
}

/**
 * The archboard checkout the batch ran from and the baseline package's place
 * in it, as the batch recorded them, or as the suite has them for a batch that
 * recorded neither.
 * @param batchRoot The batch.
 * @param loaded The suite.
 * @returns The checkout and the baseline package.
 */
function batchPlaces(
	batchRoot: string,
	loaded: LoadedSuite,
): { readonly checkout: string; readonly baseline: string } {
	const file = path.join(batchRoot, "batch.json");
	const places = fs.existsSync(file)
		? BatchPlacesSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
	const checkout = places?.archboard ?? path.resolve(loaded.directory, "..");
	const location = places?.pins.baselineSkill.location ?? loaded.pins.baselineSkill.location;
	return { checkout, baseline: path.join(checkout, location) };
}

/**
 * What the classifier knew of the run: the places its commands name, with
 * existence asked of the batch where it sits now.
 * @param batchRoot The batch as it sits now.
 * @param loaded The suite.
 * @param manifest The run.
 * @returns The classification context.
 */
function recordedContext(
	batchRoot: string,
	loaded: LoadedSuite,
	manifest: RunManifest,
): ClassificationContext {
	const { checkout, baseline } = batchPlaces(batchRoot, loaded);
	const now = path.resolve(batchRoot);
	const then = recordedBatchRoot(batchRoot, manifest);
	const world = path.join(then, path.relative(now, runDirectory(now, manifest)), "world");
	/**
	 * Whether a path the commands name exists in the batch as it sits now.
	 * @param file The path as the commands name it.
	 * @returns True when it exists.
	 */
	const exists = (file: string): boolean =>
		fs.existsSync(path.join(now, path.relative(then, file)));
	return {
		skillRoot: path.join(world, "home", ".agents", "skills", "archboard"),
		checkoutRoot: path.join(world, "flask"),
		archboardRoot: checkout,
		vault: path.join(world, "vault"),
		exposure: {
			evaluationInputs: path.join(checkout, "evals"),
			harnessSource: path.join(checkout, "src", "runtime", "skill-evaluation"),
			skillPackages: [path.join(checkout, "skills", "archboard"), baseline],
			batchRoot: then,
			world,
			exists,
		},
	};
}

/**
 * The run's exposure as the current classifier reads the commands it stored.
 * A manifest recorded before exposure was kept stays unaudited, and a run that
 * stored no commands keeps the count it recorded.
 * @param batchRoot The batch as it sits now.
 * @param loaded The suite, for the checkout of a batch that did not record one.
 * @param manifest The run.
 * @returns Counts by kind, or null when the run never recorded exposure.
 */
function reauditedExposure(
	batchRoot: string,
	loaded: LoadedSuite,
	manifest: RunManifest,
): Readonly<Record<ExposureKind, number>> | null {
	const recorded = manifest.exposure ?? null;
	const file = path.join(runDirectory(batchRoot, manifest), "commands.json");
	if (recorded === null || !fs.existsSync(file)) return recorded;
	return exposureCounts(
		classifyCommands(storedCommands(file), recordedContext(batchRoot, loaded, manifest)),
	);
}

export { reauditedExposure };

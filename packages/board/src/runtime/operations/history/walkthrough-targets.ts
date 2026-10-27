import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { ArchiveError, type ArchiveContext } from "#runtime/store/model-archive.ts";
import { exactReading } from "#runtime/operations/history/read.ts";

/**
 * Resolve exact targets before retaining their dependency closure.
 * @param context The archive owner.
 * @param model The complete candidate.
 * @returns Required retained targets.
 */
async function walkthroughDependencies(
	context: ArchiveContext,
	model: ArchitectureModel,
): Promise<string[]> {
	const dependencies = [
		...new Set([
			...(model.migration === undefined ? [] : [model.migration.checkpoint]),
			...model.walkthroughs.flatMap((walk) =>
				"checkpoint" in walk.target ? [walk.target.checkpoint] : [],
			),
		]),
	];
	await Promise.all(
		dependencies.map(async (checkpoint) => {
			const target = await exactReading(context, checkpoint, undefined, undefined, false);
			if (!target.success)
				throw new ArchiveError(target.code, target.diagnostics[0]!.message, checkpoint);
			if (target.manifest.id !== model.manifest.id)
				throw new ArchiveError(
					"CHECKPOINT_INVALID",
					"The walkthrough target belongs to another model.",
					checkpoint,
				);
		}),
	);
	return dependencies;
}
export { walkthroughDependencies };

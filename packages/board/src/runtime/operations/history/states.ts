import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { SelectedStateSchema } from "#shared/schemas/model-proposals.ts";
import {
	archiveRecords,
	type ArchiveContext,
	type CheckpointRecordSchema,
} from "#runtime/store/model-archive.ts";

type Record = ReturnType<typeof CheckpointRecordSchema.parse>;
type States = NonNullable<ArchitectureModel["states"]>;

/**
 * Read the explicit completed state from one lifecycle event.
 * @param record The retained checkpoint metadata.
 * @param id Its exact checkpoint identity.
 * @returns The completed state, when this is a lifecycle event.
 */
function completedStates(record: Record, id: string): States {
	if (record.lifecycle === undefined || record.selection == null) return [];
	return [
		{
			...record.selection,
			lifecycle: record.lifecycle.type === "shelve" ? "shelved" : "historical",
			checkpoint: id,
		},
	];
}

/**
 * Read a displaced current state from an explicit adoption.
 * @param record The retained checkpoint metadata.
 * @returns The prior current state, when this adoption displaced one.
 */
function displacedStates(record: Record): States {
	if (record.lifecycle?.type !== "adopt") return [];
	const previous = record.lifecycle.previous;
	if (previous === null) return [];
	return [{ ...previous.state, lifecycle: "historical", checkpoint: previous.checkpoint }];
}

/**
 * Derive completed states from explicit lifecycle records rather than archive order.
 * @param context The addressed archive.
 * @param model The optional model identity guard.
 * @returns Retained logical states and their exact checkpoints.
 */
async function retainedStates(context: ArchiveContext, model?: string) {
	const records = (await archiveRecords(context)).flatMap(({ id, record }) => {
		if (record.kind !== "checkpoint") return [];
		if (record.vault !== context.vault) return [];
		if (model !== undefined && record.model !== model) return [];
		return [{ id, record }];
	});
	const completed = records.flatMap(({ id, record }) => completedStates(record, id));
	const previous = records.flatMap(({ record }) => displacedStates(record));
	const displaced = new Set(previous.map((state) => state.id));
	return [
		...new Map(
			[...completed.filter((state) => !displaced.has(state.id)), ...previous].map((state) => [
				JSON.stringify([state.id, state.checkpoint]),
				state,
			]),
		).values(),
	].toSorted((a, b) => a.id.localeCompare(b.id) || a.checkpoint!.localeCompare(b.checkpoint!));
}

/**
 * Combine authored designations with derived retained states without copying history into inputs.
 * @param model The complete addressed current reading.
 * @param retained The derived completed states.
 * @returns The complete state catalogue.
 */
function stateCatalogue(
	model: ArchitectureModel,
	retained: NonNullable<ArchitectureModel["states"]>,
) {
	const authored = [
		...(model.manifest.current === null
			? []
			: [{ ...model.manifest.current, lifecycle: "current" as const }]),
		...model.proposals.map((proposal) => SelectedStateSchema.strip().parse(proposal)),
	];
	const live = new Set(authored.map((state) => state.id));
	return [...authored, ...retained.filter((state) => !live.has(state.id))];
}

export { retainedStates, stateCatalogue };

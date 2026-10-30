import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { assignFields } from "#runtime/operations/model-edit/fields.ts";

type Change = Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"][number];
type Walk = ArchitectureModel["walkthroughs"][number];
type State = {
	walks: Walk[];
	fresh: () => string;
	subjects: Set<string>;
	retired: Set<string>;
	edited: Set<string>;
};
/**
 * Add a narrative through the shared identity authority.
 * @param state The structural candidate.
 * @param change The addition.
 */
function addWalkthrough(state: State, change: Extract<Change, { type: "add-walkthrough" }>): void {
	const id = state.fresh();
	const beats = change.walkthrough.beats.map((beat) => ({ ...beat, id: state.fresh() }));
	state.walks.push({
		...change.walkthrough,
		schemaVersion: 1,
		id,
		beats,
		file: `${id.split("#")[1]}.walkthrough.json`,
	});
	for (const subject of [id, ...beats.map((beat) => beat.id)]) state.subjects.add(subject);
}
/**
 * Require one continuing narrative once per batch.
 * @param state The structural candidate.
 * @param subject The requested identity.
 * @returns The continuing narrative.
 */
function continuingWalkthrough(state: State, subject: string): Walk {
	const walk = state.walks.find((entry) => entry.id === subject);
	if (walk === undefined || state.edited.has(subject))
		throw new ArchiveError(
			"MODEL_INVALID",
			"Name one existing walkthrough once per batch.",
			"model.json",
			[subject],
		);
	state.edited.add(subject);
	for (const id of [subject, ...walk.beats.map((beat) => beat.id)]) state.subjects.add(id);
	return walk;
}
/**
 * Preserve continuing beat identities while allocating only new beats.
 * @param state The structural candidate.
 * @param walk The continuing narrative.
 * @param beats The complete intended beat order.
 */
function replaceBeats(
	state: State,
	walk: Walk,
	beats: NonNullable<Extract<Change, { type: "edit-walkthrough" }>["beats"]>,
): void {
	const known = new Set(walk.beats.map((beat) => beat.id));
	const used = new Set<string>();
	walk.beats = beats.map((beat) => {
		if (beat.id !== undefined && (!known.has(beat.id) || used.has(beat.id)))
			throw new ArchiveError(
				"MODEL_INVALID",
				"Keep each continuing beat identity once. Omit the ID for a new beat.",
				walk.file,
				[beat.id],
			);
		const id = beat.id ?? state.fresh();
		used.add(id);
		state.subjects.add(id);
		return { ...beat, id };
	});
	for (const id of known) if (!used.has(id)) state.retired.add(id);
}
/**
 * Edit only requested fields and beat order.
 * @param state The structural candidate.
 * @param change The explicit edit.
 */
function editWalkthrough(
	state: State,
	change: Extract<Change, { type: "edit-walkthrough" }>,
): void {
	const walk = continuingWalkthrough(state, change.subject);
	const name = walk.name;
	assignFields(walk, change.set, change.clear);
	if (walk.name !== name) walk.formerNames = [...new Set([...(walk.formerNames ?? []), name])];
	if (change.beats !== undefined) replaceBeats(state, walk, change.beats);
}
/**
 * Retire a narrative and its beat identities together.
 * @param state The structural candidate.
 * @param subject The removed narrative.
 */
function removeWalkthrough(state: State, subject: string): void {
	const walk = continuingWalkthrough(state, subject);
	state.walks.splice(state.walks.indexOf(walk), 1);
	for (const id of [walk.id, ...walk.beats.map((beat) => beat.id)]) state.retired.add(id);
}
/**
 * Apply narrative changes inside the complete structural candidate.
 * @param model The coherent starting model.
 * @param changes The complete edit batch.
 * @param fresh The shared identity authority.
 * @param subjects The affected identity set.
 * @param retired The shared retirement reservations.
 * @returns The complete intended narratives.
 */
function applyWalkthroughChanges(
	model: ArchitectureModel,
	changes: Change[],
	fresh: () => string,
	subjects: Set<string>,
	retired: Set<string>,
) {
	const state: State = {
		walks: structuredClone(model.walkthroughs),
		fresh,
		subjects,
		retired,
		edited: new Set(),
	};
	for (const change of changes) {
		switch (change.type) {
			case "add-walkthrough":
				addWalkthrough(state, change);
				break;
			case "edit-walkthrough":
				editWalkthrough(state, change);
				break;
			case "remove-walkthrough":
				removeWalkthrough(state, change.subject);
				break;
			default:
				break;
		}
	}
	return state.walks;
}
export { applyWalkthroughChanges };

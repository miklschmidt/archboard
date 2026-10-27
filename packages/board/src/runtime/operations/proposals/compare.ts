import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import { compareVariants } from "#shared/rules/compare/variants.ts";
import { subjectsOf, type Subject } from "#runtime/operations/proposals/subjects.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
type Comparison = NonNullable<ArchitectureModel["comparison"]>["subjects"][number];
/**
 * Adapt canonical meaning to existing whole-state semantic comparison.
 * @param model One complete architecture.
 * @returns The existing semantic comparison input.
 */
function contentOf(model: ArchitectureModel): VariantContent {
	return {
		nodes: model.modules.map(
			({ schemaVersion: _version, outgoing: _outgoing, file: _file, ...module }) => module,
		),
		edges: model.relationships,
		flows: model.collections.flatMap((collection) =>
			collection.flows.map((flow) => ({
				...flow,
				collection: `${model.manifest.id}#${collection.id}`,
			})),
		),
		walkthroughs: [],
	};
}
/**
 * Compare only named atomic fields of continuing subjects.
 * @param before The baseline subject.
 * @param after The selected subject.
 * @param fields The fields that this comparison owns.
 * @returns Changed fields.
 */
function fieldChanges(
	before: Subject | undefined,
	after: Subject | undefined,
	fields: string[],
): Comparison["fields"] {
	if (before === undefined || after === undefined) return [];
	return fields
		.filter((field) => !sameSemanticValue(before.value[field], after.value[field]))
		.map((field) => ({ field, before: before.value[field], after: after.value[field] }));
}
/**
 * Describe collection changes without comparing copied flow arrays.
 * @param id The stable collection identity.
 * @param before The baseline definition.
 * @param after The selected definition.
 * @returns Its own comparison standing.
 */
function collectionStanding(
	id: string,
	before: Subject | undefined,
	after: Subject | undefined,
): Comparison {
	const fields = fieldChanges(before, after, ["name"]);
	const kind =
		before === undefined
			? "added"
			: after === undefined
				? "removed"
				: fields.length > 0
					? "changed"
					: "unchanged";
	return { id, subjectKind: "collection", kind, fields };
}
/**
 * Compare a continuing flow's collection ownership.
 * @param before The baseline subject.
 * @param after The selected subject.
 * @returns Its collection field change, when present.
 */
function collectionChange(
	before: Subject | undefined,
	after: Subject | undefined,
): Comparison["fields"] {
	if (before === undefined || after === undefined) return [];
	const original = before.placement?.holder,
		next = after.placement?.holder;
	return original === next ? [] : [{ field: "collection", before: original, after: next }];
}
/**
 * Add canonical metadata to the existing semantic subject standing.
 * @param standing The semantic comparison result.
 * @param before The canonical baseline fields.
 * @param after The canonical selected fields.
 * @returns The complete canonical comparison result.
 */
function withMetadata(
	standing: Comparison,
	before: Subject | undefined,
	after: Subject | undefined,
): Comparison {
	const fields = [
		...standing.fields,
		...fieldChanges(before, after, ["formerNames", "documents", "references"]),
	];
	if (standing.subjectKind === "flow") fields.push(...collectionChange(before, after));
	const kind = standing.kind === "unchanged" && fields.length > 0 ? "changed" : standing.kind;
	return { ...standing, kind, fields };
}
/**
 * Compare a narrative subject without copying its owned beats.
 * @param id The stable subject identity.
 * @param before The baseline subject.
 * @param after The selected subject.
 * @returns Its semantic standing, or no narrative entry.
 */
function narrativeStanding(
	id: string,
	before: Subject | undefined,
	after: Subject | undefined,
): Comparison[] {
	const subject = after ?? before!;
	if (subject.kind !== "walkthrough" && subject.kind !== "beat") return [];
	const fields = [
		...fieldChanges(before, after, [
			"name",
			"formerNames",
			"summary",
			"target",
			"title",
			"narrative",
			"reading",
		]),
		...placementChanges(before, after),
	];
	return [
		{
			id,
			subjectKind: subject.kind,
			kind: subjectStanding(before, after, fields),
			fields,
		},
	];
}
/**
 * Classify a stable definition from its existence and changed fields.
 * @param before The original definition.
 * @param after The continuing definition.
 * @param fields Its changed fields.
 * @returns The semantic standing.
 */
function subjectStanding(
	before: Subject | undefined,
	after: Subject | undefined,
	fields: Comparison["fields"],
): Comparison["kind"] {
	if (before === undefined) return "added";
	if (after === undefined) return "removed";
	return fields.length > 0 ? "changed" : "unchanged";
}

/**
 * Compare beat order through stable holders and siblings.
 * @param before The baseline subject.
 * @param after The selected subject.
 * @returns Placement differences.
 */
function placementChanges(
	before: Subject | undefined,
	after: Subject | undefined,
): Comparison["fields"] {
	if (!before || !after || sameSemanticValue(before.placement, after.placement)) return [];
	return [{ field: "placement", before: before.placement, after: after.placement }];
}

/**
 * Compare stable subjects through the existing semantic rules.
 * @param before The complete comparison base.
 * @param after The complete selected architecture.
 * @returns Serializable standing and changed fields.
 */
function comparisonOf(before: ArchitectureModel, after: ArchitectureModel): Comparison[] {
	const comparison = compareVariants(contentOf(before), contentOf(after));
	const owners = [
		{ kind: "module", subjects: comparison.nodes },
		{ kind: "relationship", subjects: comparison.edges },
		{ kind: "flow", subjects: comparison.flows },
		{ kind: "step", subjects: comparison.steps },
	] as const;
	const left = subjectsOf(before),
		right = subjectsOf(after);
	const semantic = owners.flatMap(({ kind, subjects }) =>
		[...subjects].map(([id, change]): Comparison => ({
			id,
			subjectKind: kind,
			kind: change.kind,
			fields: [...change.fields],
		})),
	);
	const collections = [...new Set([...left.keys(), ...right.keys()])]
		.filter((id) => (right.get(id) ?? left.get(id))!.kind === "collection")
		.map((id) => collectionStanding(id, left.get(id), right.get(id)));
	const narratives = [...new Set([...left.keys(), ...right.keys()])].flatMap((id) =>
		narrativeStanding(id, left.get(id), right.get(id)),
	);

	return [
		...semantic.map((standing) =>
			withMetadata(standing, left.get(standing.id), right.get(standing.id)),
		),
		...collections,
		...narratives,
	];
}
export { comparisonOf, contentOf };

import { reconcileNarratives } from "#runtime/operations/proposals/reconcile-narratives.ts";
import { everyStep } from "#shared/rules/flow-steps.ts";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import type { ReconciliationIssue } from "#shared/schemas/reconciliation.ts";
import { reconcileVariant, mergeByIdentity } from "#shared/rules/reconcile/variant.ts";
import { contentOf } from "#runtime/operations/proposals/compare.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { materializedInputs } from "#runtime/operations/proposals/read.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";

type Collection = ArchitectureModel["collections"][number];
/**
 * Keep a continuing module path or use the existing canonical identity path.
 * @param mine The coherent proposal side.
 * @param theirs The coherent predecessor.
 * @param id The continuing module identity.
 * @returns Its canonical materialization path.
 */
function moduleFile(mine: ArchitectureModel, theirs: ArchitectureModel, id: string) {
	return (
		mine.modules.find((module) => module.id === id)?.file ??
		theirs.modules.find((module) => module.id === id)?.file ??
		`${id.split("#")[1]}.module.json`
	);
}
/**
 * Serialize source-owned relationships with each complete module.
 * @param inputs The candidate input map.
 * @param mine The coherent proposal side.
 * @param theirs The coherent predecessor.
 * @param content The existing semantic engine result.
 */
function writeModules(
	inputs: Map<string, Buffer>,
	mine: ArchitectureModel,
	theirs: ArchitectureModel,
	content: VariantContent,
): void {
	for (const node of content.nodes) {
		const outgoing = content.edges
			.filter((edge) => edge.from === node.id)
			.map(({ from: _from, ...edge }) => edge);
		inputs.set(
			moduleFile(mine, theirs, node.id),
			Buffer.from(JSON.stringify({ ...node, schemaVersion: 1, outgoing })),
		);
	}
}
/**
 * Refuse subjects that serialization cannot place under their exact owners.
 * @param mine The coherent proposal side.
 * @param content The complete semantic candidate.
 * @param collections The merged collection definitions.
 * @returns Owner diagnostics before any definition can disappear.
 */
function ownerDiagnostics(
	mine: ArchitectureModel,
	content: VariantContent,
	collections: Collection[],
) {
	const modules = new Set(content.nodes.map((node) => node.id));
	const owners = new Set(collections.map((collection) => `${mine.manifest.id}#${collection.id}`));
	const missingEdges = content.edges.filter((edge) => !modules.has(edge.from));
	const missingFlows = content.flows.filter((flow) => !owners.has(Reflect.get(flow, "collection")));
	return [...missingEdges, ...missingFlows].map((subject) => ({
		code: "REFERENCE_LOST",
		file: "model.json",
		subjects: [subject.id],
		message: "A subject lost its exact owner.",
		recovery: "Restore its owner, explicitly move the subject, or remove it.",
	}));
}
/**
 * Serialize independent flows under their reconciled collections.
 * @param inputs The candidate input map.
 * @param model The model namespace.
 * @param content The semantic engine result.
 * @param collections The reconciled collection definitions.
 */
function writeCollections(
	inputs: Map<string, Buffer>,
	model: string,
	content: VariantContent,
	collections: Collection[],
): void {
	for (const { file, ...collection } of collections) {
		const flows = content.flows
			.filter((flow) => Reflect.get(flow, "collection") === `${model}#${collection.id}`)
			.map((flow) =>
				Object.fromEntries(Object.entries(flow).filter(([key]) => key !== "collection")),
			);
		inputs.set(file, Buffer.from(JSON.stringify({ ...collection, flows })));
	}
}
/**
 * Decode semantic results through canonical ownership and coherence rules.
 * @param mine The proposal reading.
 * @param theirs The new predecessor.
 * @param content The existing semantic engine result.
 * @param collections The merged collection definitions.
 * @param walkthroughs The reconciled narratives and their complete readings.
 * @returns The complete canonical result or its actionable diagnostics.
 */
function canonicalContent(
	mine: ArchitectureModel,
	theirs: ArchitectureModel,
	content: VariantContent,
	collections: Collection[],
	walkthroughs: ArchitectureModel["walkthroughs"],
): ArchitectureModelRead {
	const diagnostics = ownerDiagnostics(mine, content, collections);
	if (diagnostics.length > 0)
		return {
			success: false,
			code: "MODEL_INVALID",
			error: "The merged subjects need their original owners.",
			diagnostics,
		};
	const inputs = materializedInputs(
		{ ...mine, modules: [], collections: [], walkthroughs },
		Buffer.from(Bun.YAML.stringify(theirs.policy)),
	);
	writeModules(inputs, mine, theirs, content);
	writeCollections(inputs, mine.manifest.id, content, collections);
	const live = new Set([
		...[
			...content.nodes,
			...content.edges,
			...content.flows,
			...content.flows.flatMap((flow) => everyStep(flow.steps)),
			...walkthroughs.flatMap((walk) => [walk, ...walk.beats]),
		].map((subject) => subject.id),
		...collections.map((collection) => `${mine.manifest.id}#${collection.id}`),
	]);
	const retiredIds = [
		...new Set([...(mine.manifest.retiredIds ?? []), ...(theirs.manifest.retiredIds ?? [])]),
	].filter((id) => !live.has(id));
	inputs.set("model.json", Buffer.from(JSON.stringify({ ...theirs.manifest, retiredIds })));
	return decodeModel(
		{ inputs, revision: modelRevision(inputs), diagnostics: [] },
		mine.selectedState,
	);
}
/**
 * Express canonical coherence failures as durable semantic issues.
 * @param reading The decoded candidate or its refusal.
 * @param mine The coherent proposal side.
 * @returns Existing reconciliation issue shapes.
 */
function coherenceIssues(
	reading: ArchitectureModelRead,
	mine: ArchitectureModel,
): ReconciliationIssue[] {
	if (reading.success) return [];
	const known = subjectsOf(mine);
	return reading.diagnostics.flatMap((diagnostic) =>
		(diagnostic.subjects?.length ? diagnostic.subjects : [mine.manifest.id]).map((subject) => ({
			subject,
			what: known.get(subject)?.kind ?? "model",
			kind:
				diagnostic.code === "LEFT_EMPTY" ? ("left-empty" as const) : ("reference-lost" as const),
			mine: "kept its coherent proposal side",
			theirs: diagnostic.message,
			repair: diagnostic.recovery,
		})),
	);
}
/**
 * Reuse the semantic three-way engine with canonical decoding as its coherence authority.
 * @param base The immutable common predecessor.
 * @param mine The coherent proposal side.
 * @param theirs The new predecessor.
 * @returns A coherent result and every unresolved semantic issue.
 */
function reconcileModels(
	base: ArchitectureModel,
	mine: ArchitectureModel,
	theirs: ArchitectureModel,
) {
	const collections = mergeByIdentity(
		{
			base: new Map(base.collections.map((c) => [c.id, c])),
			mine: new Map(mine.collections.map((c) => [c.id, c])),
			theirs: new Map(theirs.collections.map((c) => [c.id, c])),
		},
		["name"],
		"collection",
	);
	const narratives = reconcileNarratives(base, mine, theirs);
	const states = { base: contentOf(base), mine: contentOf(mine), theirs: contentOf(theirs) };
	/**
	 * Decode through the already reconciled collection ownership.
	 * @param content The semantic candidate.
	 * @returns The canonical reader result.
	 */
	const decode = (content: VariantContent) =>
		canonicalContent(mine, theirs, content, collections.entities, narratives.walkthroughs);
	const merged = reconcileVariant(states, (content) => coherenceIssues(decode(content), mine));
	const result = decode(merged.content);
	return {
		result,
		issues: [
			...merged.issues,
			...narratives.issues,
			...collections.issues.map((issue) => ({
				...issue,
				subject: `${mine.manifest.id}#${issue.subject}`,
			})),
		],
	};
}
export { reconcileModels };

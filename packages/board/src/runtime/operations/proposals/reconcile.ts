import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import type { ReconciliationIssue } from "#shared/schemas/reconciliation.ts";
import { ArchitectureModuleSchema } from "#shared/schemas/model-definitions.ts";
import { FlowCollectionSchema, ModelFlowSchema } from "#shared/schemas/model-flows.ts";
import { reconcileVariant, mergeByIdentity } from "#shared/rules/reconcile/variant.ts";
import { contentOf } from "#runtime/operations/proposals/compare.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { materializedInputs } from "#runtime/operations/proposals/read.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";

type Collection = ArchitectureModel["collections"][number];
/**
 * Decode a semantic candidate through canonical ownership and coherence rules.
 * @param mine The proposal reading.
 * @param theirs The predecessor reading.
 * @param content The existing semantic engine result.
 * @param collections The merged collection definitions.
 * @returns The coherent canonical result or its diagnostics.
 */
function canonicalContent(
	mine: ArchitectureModel,
	theirs: ArchitectureModel,
	content: VariantContent,
	collections: Collection[],
): ArchitectureModelRead {
	const modules = content.nodes.map((node) => ({
		...ArchitectureModuleSchema.strip().parse({
			...node,
			schemaVersion: 1,
			outgoing: content.edges
				.filter((edge) => edge.from === node.id)
				.map(({ from: _from, ...edge }) => edge),
		}),
		file:
			mine.modules.find((module) => module.id === node.id)?.file ??
			theirs.modules.find((module) => module.id === node.id)?.file ??
			`${node.id.split("#")[1]}.module.json`,
	}));
	const flows = content.flows.map((flow) => ({
		flow: ModelFlowSchema.strip().parse(flow),
		holder: Reflect.get(flow, "collection"),
	}));
	const groups = collections.map((collection) => ({
		...FlowCollectionSchema.strip().parse({
			...collection,
			flows: flows
				.filter((entry) => entry.holder === `${mine.manifest.id}#${collection.id}`)
				.map((entry) => entry.flow),
		}),
		file: collection.file,
	}));
	if (groups.flatMap((collection) => collection.flows).length !== flows.length)
		return {
			success: false,
			code: "MODEL_INVALID",
			error: "A flow lost its collection.",
			diagnostics: [
				{
					code: "REFERENCE_LOST",
					file: "model.json",
					subjects: flows
						.filter(
							(entry) =>
								!collections.some(
									(collection) => entry.holder === `${mine.manifest.id}#${collection.id}`,
								),
						)
						.map((entry) => entry.flow.id),
					message: "A flow lost its collection.",
					recovery: "Restore its collection or explicitly move the flow.",
				},
			],
		};
	const live = new Set(
		[...content.nodes, ...content.edges, ...content.flows].map((subject) => subject.id),
	);
	const reserved = [
		...new Set([...(mine.manifest.retiredIds ?? []), ...(theirs.manifest.retiredIds ?? [])]),
	].filter((id) => !live.has(id));
	const model = {
		...mine,
		manifest: { ...theirs.manifest, retiredIds: reserved },
		policy: theirs.policy,
		modules,
		collections: groups,
	};
	const inputs = materializedInputs(model, Buffer.from(Bun.YAML.stringify(model.policy)));
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
			kind: "reference-lost" as const,
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
	const states = { base: contentOf(base), mine: contentOf(mine), theirs: contentOf(theirs) };
	const decode = (content: VariantContent) =>
		canonicalContent(mine, theirs, content, collections.entities);
	const merged = reconcileVariant(states, (content) => coherenceIssues(decode(content), mine));
	const result = decode(merged.content);
	return {
		result,
		issues: [
			...merged.issues,
			...collections.issues.map((issue) => ({
				...issue,
				subject: `${mine.manifest.id}#${issue.subject}`,
			})),
		],
	};
}
export { reconcileModels };

import { legacyAddresses } from "#runtime/operations/legacy-inventory/addresses.ts";
import { convertedReadings } from "#runtime/operations/legacy-inventory/readings.ts";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { composeModel } from "#runtime/operations/legacy-inventory/compose.ts";
import { selectModule, selectFlow, failure } from "#runtime/operations/read/model-read.ts";
type Preview = NonNullable<ArchitectureModel["migrationPreview"]>;
/**
 * Preserve original state metadata without importing its independent history.
 * @param state One original state.
 * @returns The supported descriptive metadata.
 */
function stateMetadata(state: SemanticVariant) {
	return {
		id: state.id,
		name: state.name,
		formerNames: state.formerNames,
		summary: state.summary,
		documents: state.documents,
	};
}

/**
 * Retain original current metadata and explicit future proposal addresses.
 * @param inventory Exact original coverage and owner choices.
 * @returns Preview provenance without importing planned subjects.
 */
function previewCoverage(inventory: LegacyInventory): Preview {
	const preview: Preview = {
		origin: inventory.plan.origin,
		source: inventory.source,
		planRevision: inventory.planRevision!,
		...readingMetadata(inventory),
		addresses: legacyAddresses(inventory),
		coverage: [],
		plannedBoards: [],
		history: inventory.boards.flatMap(({ document, file }) =>
			document === undefined
				? []
				: document.variants.map(({ content: _content, ...state }) => ({
						legacy: `${inventory.plan.origin}/${document.id}#${state.id}`,
						canonical: mappedIdentity(
							inventory.plan,
							`${inventory.plan.origin}/${document.id}#${state.id}`,
						),
						board: document.id,
						file,
						completeModel: false as const,
						state,
						adoptions: document.adoptions?.filter(
							(entry) => entry.variant === state.id || entry.from === state.id,
						),
						shelvings: document.shelvings?.filter((entry) => entry.variant === state.id),
					})),
		),
	};
	for (const { document, file } of inventory.boards) {
		if (document === undefined) continue;
		const state = document.variants.find((variant) => variant.id === document.current);
		preview.coverage.push({
			board: document.id,
			file,
			name: document.name,
			formerNames: document.formerNames,
			current:
				state === undefined
					? undefined
					: {
							...stateMetadata(state),
							legacy: `${inventory.plan.origin}/${document.id}#${state.id}`,
						},
		});
		if (state !== undefined) continue;
		preview.plannedBoards.push({
			board: document.id,
			states: document.variants.map((variant) => {
				const legacy = `${inventory.plan.origin}/${document.id}#${variant.id}`;
				return {
					...stateMetadata(variant),
					legacy,
					canonical: mappedIdentity(inventory.plan, legacy),
					lifecycle: variant.lifecycle,
				};
			}),
		});
	}
	return preview;
}

/**
 * Materialize only the coverage that one original legacy state actually contains.
 * @param inventory The original sources and saved choices.
 * @param selector The qualified original state identity.
 * @param module The optional subject selector.
 * @param flow The optional flow selector.
 * @param canonical Whether explicit subject mappings apply to proposal conversion.
 * @returns One original board reading without present-day surroundings.
 */
function scopedPreview(
	inventory: LegacyInventory,
	selector: string,
	module?: string,
	flow?: string,
	canonical = false,
): ArchitectureModelRead {
	const selected = inventory.boards
		.flatMap(({ document, file }) =>
			document === undefined
				? []
				: document.variants.map((state) => ({
						document,
						file,
						state,
						legacy: `${inventory.plan.origin}/${document.id}#${state.id}`,
					})),
		)
		.find((entry) => entry.legacy === selector);
	if (selected === undefined)
		return failure("STATE_NOT_FOUND", [
			{
				code: "STATE_NOT_FOUND",
				file: ".",
				message: "The qualified original state is unavailable.",
				recovery: "Select an exact legacy identity from migrationPreview.history.",
			},
		]);
	const { document, file, state, legacy } = selected;
	const scoped: LegacyInventory = {
		...inventory,
		boards: [{ file, source: "", document: { ...document, current: state.id, variants: [state] } }],
		conflicts: [],
		unresolved: [],
		plan: { ...inventory.plan, mappings: canonical ? inventory.plan.mappings : [], choices: [] },
	};
	const model = composeModel(scoped);
	if (!model.success) return model;
	return selectFlow(
		selectModule(
			{
				...model,
				manifest: { ...model.manifest, current: null },
				walkthroughs: model.walkthroughs.map((walk) => ({ ...walk, target: { state: legacy } })),
				selectedState: {
					id: state.id,
					name: state.name,
					formerNames: state.formerNames,
					summary: state.summary,
					documents: state.documents,
					lifecycle: state.lifecycle,
					predecessor: state.parent ?? null,
				},
				migrationPreview: {
					...previewCoverage(inventory),
					...readingMetadata(scoped),
					selected: { legacy, board: document.id, file, completeModel: false },
				},
			},
			module,
		),
		flow,
	);
}

export { previewCoverage, scopedPreview };

/**
 * Keep converted narrative inputs separate from optional reading catalogues.
 * @param inventory Captured original coverage.
 * @returns Content-free reading metadata.
 */
function readingMetadata(inventory: LegacyInventory) {
	const { bookmarks, readingDiagnostics } = convertedReadings(inventory);
	return { bookmarks, readingDiagnostics };
}

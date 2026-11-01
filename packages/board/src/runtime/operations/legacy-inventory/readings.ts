import { predecessorNames } from "#shared/rules/legacy-inventory/names.ts";
import type { ArchitectureModel, ModelDiagnostic } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
import type { SemanticView } from "#shared/schemas/views.ts";
import { scopedContent } from "#shared/rules/scope.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";

type Reading = ArchitectureModel["walkthroughs"][number]["beats"][number]["reading"];
type Bookmark = NonNullable<
	NonNullable<ArchitectureModel["migrationPreview"]>["bookmarks"]
>[number];

/**
 * Expand an original view into complete identity-only reading instructions.
 * @param state The original architectural content.
 * @param view The explicitly referenced original view, when present.
 * @param qualify The captured identity mapping.
 * @returns A complete reading and explicit conversion diagnostics.
 */
function viewReading(
	state: SemanticVariant,
	view: SemanticView | undefined,
	qualify: (id: string) => string,
) {
	if (view === undefined) return missingViewReading();
	const content = scopedContent(state.content, view.scope);
	const visibility = {
		modules: content.nodes.map((node) => qualify(node.id)),
		relationships: content.edges.map((edge) => qualify(edge.id)),
		flows: content.flows.map((flow) => qualify(flow.id)),
	};
	const reading: Reading = {
		visibility,
		selection: [],
		focus: visibility.modules,
		filters: { relationships: [], groups: [] },
		grammar: view.grammar,
	};
	return { reading, diagnostics: behavioralReading(reading, content.flows, qualify) };
}

/**
 * Preserve an unavailable beat without inventing reading intent.
 * @returns An inert reading and its explicit authoring refusal.
 */
function missingViewReading(): { reading: Reading; diagnostics: ModelDiagnostic[] } {
	return {
		reading: {
			grammar: "architecture",
			selection: [],
			focus: [],
			filters: { relationships: [], groups: [] },
			visibility: { modules: [], relationships: [], flows: [] },
		},
		diagnostics: [
			{
				code: "WALKTHROUGH_VIEW_REQUIRED",
				file: ".",
				message: "This original walkthrough beat names no explicit view.",
				recovery:
					"Set an explicit original view for this beat, then save a fresh mapping plan. Use an all-scope architecture view for the whole original board.",
			},
		],
	};
}
/**
 * Select one authored behavioral flow without inferring execution order.
 * @param reading The complete converted reading.
 * @param flows Original flows selected through the original scope owner.
 * @param qualify The saved identity mapping.
 * @returns Any reason that this behavioral reading is unavailable.
 */
function behavioralReading(
	reading: Reading,
	flows: SemanticVariant["content"]["flows"],
	qualify: (id: string) => string,
): ModelDiagnostic[] {
	if (reading.grammar === "architecture") return [];
	if (flows.length === 1) {
		reading.flow = qualify(flows[0]!.id);
		return [];
	}
	return [
		{
			code: flows.length === 0 ? "FLOW_REQUIRED" : "FLOW_AMBIGUOUS",
			file: ".",
			subjects: flows.map((flow) => qualify(flow.id)),
			message: "This original behavioral view does not select one available flow.",
			recovery: "Select one exact original flow in the view and save a fresh mapping plan.",
		},
	];
}
/**
 * Locate only explicitly designated original current coverage.
 * @param inventory Captured original families.
 * @returns Complete original states that contribute to this reading.
 */
function selectedBoards(inventory: LegacyInventory) {
	return inventory.boards.flatMap(({ document, file }) => {
		if (document === undefined) return [];
		const state = document.variants.find((entry) => entry.id === document.current);
		return state === undefined ? [] : [{ document, file, state }];
	});
}
/**
 * Convert only the selected original states, preserving namespaces and complete reading intent.
 * @param inventory Captured original families and explicit mappings.
 * @returns Canonical narratives and content-free optional bookmarks.
 */
function convertedReadings(inventory: LegacyInventory) {
	const walkthroughs: Omit<ArchitectureModel["walkthroughs"][number], "file">[] = [];
	const bookmarks: Bookmark[] = [];
	const readingDiagnostics: NonNullable<
		NonNullable<ArchitectureModel["migrationPreview"]>["readingDiagnostics"]
	> = [];
	for (const { document, file, state } of selectedBoards(inventory)) {
		/**
		 * Preserve one original local identity under its family namespace.
		 * @param id The original local identity.
		 * @returns Its qualified original identity.
		 */
		const legacy = (id: string) => `${inventory.plan.origin}/${document.id}#${id}`;
		/**
		 * Apply only the owner selected canonical identity.
		 * @param id The original local identity.
		 * @returns Its mapped or original identity.
		 */
		const qualify = (id: string) => mappedIdentity(inventory.plan, legacy(id));
		const referenced = new Set(
			state.content.walkthroughs.flatMap((walk) =>
				walk.beats.flatMap((beat) => (beat.view === undefined ? [] : [beat.view])),
			),
		);
		for (const walk of state.content.walkthroughs) {
			const formerNames = [
				...new Set(
					predecessorNames(inventory, document.id, state.id, (predecessor) =>
						predecessor.content.walkthroughs
							.filter((entry) => entry.id === walk.id)
							.map((entry) => entry.name),
					).filter((name) => name !== walk.name),
				),
			];
			walkthroughs.push({
				schemaVersion: 1,
				id: qualify(walk.id),
				name: walk.name,
				summary: walk.summary,
				...(formerNames.length === 0 ? {} : { formerNames }),
				target: { state: "current" },
				beats: walk.beats.map((beat) => {
					const { reading, diagnostics } = viewReading(
						state,
						document.views.find((view) => view.id === beat.view),
						qualify,
					);
					if (diagnostics.length > 0)
						readingDiagnostics.push({
							id: qualify(beat.id),
							diagnostics: diagnostics.map((entry) => ({
								...entry,
								file,
								subjects: [qualify(beat.id), ...(entry.subjects ?? [])],
							})),
						});
					return {
						id: qualify(beat.id),
						title: beat.heading,
						narrative: beat.body,
						reading: { ...reading, selection: beat.subjects.map(qualify) },
					};
				}),
			});
		}
		for (const view of document.views.filter((entry) => !referenced.has(entry.id))) {
			const { reading, diagnostics } = viewReading(state, view, qualify);
			bookmarks.push({
				id: qualify(view.id),
				legacy: legacy(view.id),
				board: document.id,
				file,
				name: view.name,
				summary: view.summary,
				reading,
				diagnostics: diagnostics.map((entry) => ({ ...entry, file })),
			});
		}
	}
	return { walkthroughs, bookmarks, readingDiagnostics };
}
export { convertedReadings };

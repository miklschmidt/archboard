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
 * @param overview Whether the original beat names no view.
 * @returns A complete reading and explicit conversion diagnostics.
 */
function viewReading(
	state: SemanticVariant,
	view: SemanticView | undefined,
	qualify: (id: string) => string,
	overview = false,
) {
	const diagnostics: ModelDiagnostic[] = [];
	const content =
		view === undefined && !overview
			? { nodes: [], edges: [], flows: [] }
			: scopedContent(state.content, view?.scope ?? { kind: "all" });
	const visibility = {
		modules: content.nodes.map((node) => qualify(node.id)),
		relationships: content.edges.map((edge) => qualify(edge.id)),
		flows: content.flows.map((flow) => qualify(flow.id)),
	};
	const reading: Reading = {
		visibility,
		selection: [],
		focus: overview ? [] : visibility.modules,
		filters: { relationships: [], groups: [] },
		grammar: view?.grammar ?? "architecture",
	};
	if (view === undefined && !overview)
		diagnostics.push({
			code: "WALKTHROUGH_VIEW_MISSING",
			file: ".",
			message: "The referenced original view is unavailable.",
			recovery: "Restore that exact view in the originals and save a fresh mapping plan.",
		});
	if (reading.grammar !== "architecture") {
		if (content.flows.length === 1) reading.flow = qualify(content.flows[0]!.id);
		else
			diagnostics.push({
				code: content.flows.length === 0 ? "FLOW_REQUIRED" : "FLOW_AMBIGUOUS",
				file: ".",
				subjects: visibility.flows,
				message: "This original behavioral view does not select one available flow.",
				recovery: "Select one exact original flow in the view and save a fresh mapping plan.",
			});
	}
	return { reading, diagnostics };
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
	for (const { document, file } of inventory.boards) {
		const state = document?.variants.find((entry) => entry.id === document.current);
		if (document === undefined || state === undefined) continue;
		const legacy = (id: string) => `${inventory.plan.origin}/${document.id}#${id}`;
		const qualify = (id: string) => mappedIdentity(inventory.plan, legacy(id));
		const referenced = new Set(
			state.content.walkthroughs.flatMap((walk) =>
				walk.beats.flatMap((beat) => (beat.view === undefined ? [] : [beat.view])),
			),
		);
		for (const walk of state.content.walkthroughs) {
			const formerNames = [
				...new Set(
					predecessorNames(inventory, document.id, state.id, (state) =>
						state.content.walkthroughs
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
						beat.view === undefined,
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

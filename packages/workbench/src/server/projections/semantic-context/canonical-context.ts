import { modelContent, subjectsOf } from "@archboard/board/content";
import { canonicalNarratedSubjects } from "#server/rules/semantic-context/narrated-subjects.ts";
import { readArchitectureModel } from "@archboard/board/store-read";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { SemanticContextInput } from "#runtime/schemas/semantic-context-types.ts";
import { semanticPaneContextFor } from "#server/services/panes/context.ts";
import { NOTHING_READ } from "#server/projections/semantic-context/board-context.ts";
type ArchitectureModel = Extract<ArchitectureModelRead, { success: true }>;
type Reading = Pick<
	SemanticContextInput,
	"board" | "architecture" | "description" | "stale" | "staleReasons"
>;
type Report = ReturnType<typeof semanticPaneContextFor>;
/**
 * Require a fresh exact capture before treating another selected state as current.
 * @param model The coherent current reading.
 * @param report The pane's reported selector.
 * @returns Whether the pane needs the existing exact capture action.
 */
function requiresCapture(model: ArchitectureModel, report: Report): boolean {
	const architecture = report?.architecture;
	if (architecture == null) return false;
	if (architecture.expectedRevision !== model.revision.digest) return true;
	return selectionRequiresCapture(model, architecture.selection ?? {});
}
/**
 * Read canonical authority before consulting a former board or its claim.
 * @param vault The addressed vault.
 * @param clientId The pane that reports its reading.
 * @returns Canonical context, or absence for an unmigrated vault.
 */
function canonicalContext(vault: string, clientId: string | null): Reading {
	const model = readArchitectureModel(vault);
	if (!model.success) return unavailableCanonical(vault, model);
	const report = clientId === null ? null : semanticPaneContextFor(clientId);
	return availableCanonical(vault, model, report);
}
/**
 * Preserve exact state selection instead of silently using current content.
 * @param model The coherent current model.
 * @param selection The reported selectors.
 * @returns Whether exact capture is required.
 */
function selectionRequiresCapture(
	model: ArchitectureModel,
	selection: NonNullable<NonNullable<NonNullable<Report>["architecture"]>["selection"]>,
): boolean {
	if (selection.checkpoint !== undefined) return true;
	if (selection.state === undefined) return false;
	const current = model.selectedState === null ? undefined : model.selectedState.id;
	return !["current", current].includes(selection.state);
}
/**
 * Preserve recovery refusals in the existing local context.
 * @param vault The addressed vault.
 * @param model The unavailable runtime result.
 * @returns Its unavailable context, or absence for legacy authority.
 */
function unavailableCanonical(
	vault: string,
	model: Extract<ArchitectureModelRead, { success: false }>,
): Reading {
	return {
		board: {
			key: "architecture",
			name: "Architecture",
			vault,
			file: "model.json",
			version: null,
		},
		architecture: NOTHING_READ,
		description: model.diagnostics.map((d) => `${d.code}: ${d.message} ${d.recovery}`).join(" "),
		stale: true,
		staleReasons: [model.code],
	};
}
/**
 * Resolve the pane's stable selection against the actual canonical semantic content.
 * @param model The coherent canonical reading.
 * @param report The pane's exact captured report.
 * @returns The complete selected count and available named subjects.
 */
function canonicalSelection(model: ArchitectureModel, report: Report) {
	const selected =
		report?.architecture?.subjects ?? report?.selection.map((subject) => subject.id) ?? [];
	const subjects = new Map(
		[...subjectsOf(modelContent(model))].map((subject) => [subject.id, subject]),
	);
	return {
		count: selected.length,
		subjects: selected.flatMap((id) => {
			const subject = subjects.get(id);
			if (subject === undefined) return [];
			return [{ ...subject, name: canonicalNarratedSubjects(model, [id])[0]?.name ?? null }];
		}),
	};
}
/**
 * Project canonical facts into the existing bounded agent brief.
 * @param vault The addressed vault.
 * @param model The coherent runtime reading.
 * @param report The pane's reported reading.
 * @returns Current architecture facts and explicit capture requirements.
 */
function availableCanonical(vault: string, model: ArchitectureModel, report: Report): Reading {
	const state = model.selectedState;
	const reportedReading = report?.architecture ?? null;
	const board = {
		key: `model:${model.manifest.id}`,
		name: model.manifest.name,
		vault,
		file: "model.json",
		version: null,
	};
	if (requiresCapture(model, report))
		return {
			board,
			architecture: NOTHING_READ,
			description: JSON.stringify({
				authority: "canonical",
				status: "capture-required",
				model: model.manifest.id,
				reportedReading,
				next: "Read the reported state and checkpoint through model read or the exact explanation action. No current subjects substitute for that reading.",
			}),
			stale: true,
			staleReasons: ["canonical_reading_requires_capture"],
		};
	return {
		board,
		architecture: {
			...NOTHING_READ,
			selection: canonicalSelection(model, report),
			variant:
				state === null
					? null
					: { id: state.id, name: state.name, lifecycle: state.lifecycle, against: null },
		},
		description: JSON.stringify({
			authority: "canonical",
			model: model.manifest.id,
			revision: model.revision,
			state,
			modules: model.modules,
			collections: model.collections,
			proposals: model.proposals,
			reportedReading,
			next: "Use model commands with this vault. Resolve the reported state through model read before answering about selected subjects. Ownership transfer is unavailable.",
		}),
		stale: false,
		staleReasons: [],
	};
}
export { canonicalContext };

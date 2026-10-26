import type { z } from "zod";
import { StateSelectionSchema } from "#shared/schemas/model-proposals.ts";
import type { ExplanationRequestSchema } from "#shared/schemas/model-explanation.ts";
import type { ArchitectureModelRead, ArchitectureModel } from "#shared/schemas/model.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";

type Request = z.infer<typeof ExplanationRequestSchema>;

/**
 * Return a capture refusal without a partial architecture.
 * @param code The public refusal code.
 * @param subjects The affected identities.
 * @param message The failed precondition.
 * @returns An actionable refusal.
 */
function refuse(
	code: "MODEL_CHANGED" | "MODEL_INVALID",
	subjects: string[],
	message: string,
): ArchitectureModelRead {
	return {
		success: false,
		code,
		error: message,
		diagnostics: [
			{
				code,
				file: "model.json",
				subjects,
				message,
				recovery: "Read the requested architecture again and start a new action.",
			},
		],
	};
}
/**
 * Require every addressed subject in the selected reading or its exact comparison.
 * @param model The coherent model.
 * @param request The captured intent.
 * @returns Absent subject identities.
 */
function missingSubjects(model: ArchitectureModel, request: Request) {
	const subjects = subjectsOf(model);
	for (const subject of model.comparison?.subjects ?? [])
		subjects.set(subject.id, { kind: subject.subjectKind, value: {} });
	const optional = [request.reading.scope, request.reading.referenceSubject].filter(
		(id): id is string => id !== undefined,
	);
	return [...request.subjects, ...request.reading.focus, ...optional].filter(
		(id) => !subjects.has(id),
	);
}
/**
 * Enforce the action's subject and comparison requirements.
 * @param model The coherent model.
 * @param request The captured action.
 * @returns A refusal, or no failure.
 */
function actionFailure(
	model: ArchitectureModel,
	request: Request,
): ArchitectureModelRead | undefined {
	switch (request.action) {
		case "explain-selection":
			return request.subjects.length === 0
				? refuse("MODEL_INVALID", [], "Select at least one subject to explain.")
				: undefined;
		case "explain-relationship":
			return relationshipFailure(model, request);
		case "explain-proposal":
			return proposalFailure(model);
		default:
			return undefined;
	}
}
/**
 * Require selected relationships in the addressed model.
 * @param model The coherent model.
 * @param request The selected identities.
 * @returns A refusal for an empty or invalid selection.
 */
function relationshipFailure(model: ArchitectureModel, request: Request) {
	const ids = new Set(model.relationships.map((edge) => edge.id));
	if (request.subjects.length === 0 || request.subjects.some((id) => !ids.has(id)))
		return refuse(
			"MODEL_INVALID",
			request.subjects,
			"Select relationships from this reading to explain.",
		);
	return undefined;
}
/**
 * Require an actual proposal and its comparison.
 * @param model The selected model.
 * @returns A refusal when the action lacks its base.
 */
function proposalFailure(model: ArchitectureModel) {
	if (model.selectedState?.lifecycle !== "draft" || model.comparison === undefined)
		return refuse("MODEL_INVALID", [], "Select a proposal with its comparison to explain.");
	return undefined;
}
/**
 * Validate capture inputs without independently reading architecture files.
 * @param model The complete public reading.
 * @param request The invocation intent.
 * @returns The first precondition failure.
 */
function captureFailure(model: ArchitectureModel, request: Request) {
	if (request.model !== model.manifest.id || request.expectedRevision !== model.revision.digest)
		return refuse(
			"MODEL_CHANGED",
			[request.model],
			"The requested architecture no longer matches the observed reading.",
		);
	const missing = missingSubjects(model, request);
	if (missing.length > 0)
		return refuse(
			"MODEL_INVALID",
			missing,
			"Some requested subjects are unavailable in this reading.",
		);
	if (request.reading.relationshipKinds.some((kind) => !(kind in model.policy.relationshipKinds)))
		return refuse(
			"MODEL_INVALID",
			[],
			"A requested relationship kind is unavailable in this reading.",
		);
	return actionFailure(model, request);
}
/**
 * Read one exact requested state through the existing public runtime owners.
 * @param vault The explicitly addressed vault.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param selection The validated state, comparison, and explanation intent.
 * @returns A coherent selected reading.
 */
async function requestedReading(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	selection: z.infer<typeof StateSelectionSchema>,
) {
	const { checkpoint, explain, ...state } = selection;
	const scope = module ?? explain?.reading.scope;
	const selectedFlow = flow ?? explain?.reading.flow;
	if (checkpoint !== undefined)
		return (await import("#runtime/operations/history/read.ts")).readArchitectureCheckpoint(
			vault,
			checkpoint,
			scope,
			selectedFlow,
			state,
		);
	return (await import("#runtime/operations/proposals/read.ts")).readSelectedState(
		vault,
		scope,
		selectedFlow,
		state,
	);
}
/**
 * Parse one reading request and capture its exact model for local explanations.
 * @param vault The actual vault.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param input The selected reading and invocation intent.
 * @returns The original refusal or complete captured architecture.
 */
async function readRequestedArchitecture(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	input: z.input<typeof StateSelectionSchema>,
): Promise<ArchitectureModelRead> {
	const parsed = StateSelectionSchema.safeParse(input);
	if (!parsed.success) return refuse("MODEL_INVALID", [], "The reading request is invalid.");
	const { explain, ...selection } = parsed.data;
	if (selection.state !== undefined && selection.checkpoint !== undefined)
		return refuse("MODEL_INVALID", [], "Select one state or checkpoint.");
	const model = await requestedReading(vault, module, flow, parsed.data);
	if (!model.success || explain === undefined) return model;
	return attachCapture(model, explain, selection);
}
/**
 * Attach the validated immutable invocation metadata to its coherent reading.
 * @param model The complete coherent reading.
 * @param explain The invocation intent.
 * @param selection The requested state selector.
 * @returns Its capture or the actionable refusal.
 */
function attachCapture(
	model: ArchitectureModel,
	explain: Request,
	selection: z.infer<typeof StateSelectionSchema>,
): ArchitectureModelRead {
	return (
		captureFailure(model, explain) ?? {
			...model,
			explanation: {
				request: explain,
				selection,
				comparison: model.comparison,
				state: model.selectedState,
				revision: model.revision,
				checkpoint: model.checkpoint?.id,
				investigate: explain.action === "trace-flow" && explain.reading.flow === undefined,
			},
		}
	);
}

export { readRequestedArchitecture };

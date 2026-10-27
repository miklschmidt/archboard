import type { z } from "zod";
import { StateSelectionSchema } from "#shared/schemas/model-proposals.ts";
import type { ExplanationRequestSchema } from "#shared/schemas/model-explanation.ts";
import type { ArchitectureModelRead, ArchitectureModel } from "#shared/schemas/model.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import type { NavigationOptions } from "#runtime/operations/read/model-navigation.ts";

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
	const ids = new Set([
		...model.relationships.map((edge) => edge.id),
		...(model.comparison?.subjects
			.filter((subject) => subject.subjectKind === "relationship")
			.map((subject) => subject.id) ?? []),
	]);
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
	if (unavailableReadingPolicy(model, request))
		return refuse(
			"MODEL_INVALID",
			[],
			"A requested relationship kind or group is unavailable in this reading.",
		);
	return readingFailure(model, request) ?? actionFailure(model, request);
}

/**
 * Exact visible group selections and relationship kinds use the selected model's vocabulary.
 * @param model The coherent model and its policy.
 * @param request The captured reading intent.
 * @returns Whether a requested kind or group is unavailable.
 */
function unavailableReadingPolicy(model: ArchitectureModel, request: Request): boolean {
	const groups = Array.isArray(request.reading.groups) ? request.reading.groups : [];
	return (
		request.reading.relationshipKinds.some((kind) => !(kind in model.policy.relationshipKinds)) ||
		groups.some((group) => !(group in model.policy.groups))
	);
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
	selection: NavigationOptions,
) {
	const { explain } = selection;
	if (explain !== undefined && selection.reference !== undefined)
		return refuse(
			"MODEL_INVALID",
			[],
			"Open the referenced architecture before requesting an explanation.",
		);
	const selectors = requestedSelectors(module, flow, explain);
	return (await import("#runtime/operations/read/model-navigation.ts")).readModelNavigation(
		vault,
		selectors.module,
		selectors.flow,
		selection,
	);
}

/**
 * Explicit positional selectors remain available for the capture consistency check.
 * @param module The optional positional module.
 * @param flow The optional positional flow.
 * @param explain The captured reading intent, when present.
 * @returns Positional selectors or the corresponding captured defaults.
 */
function requestedSelectors(
	module: string | undefined,
	flow: string | undefined,
	explain: Request | undefined,
) {
	return { module: module ?? explain?.reading.scope, flow: flow ?? explain?.reading.flow };
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
	input: NavigationOptions,
): Promise<ArchitectureModelRead> {
	const { model: expectedModel, code, references, reference, ...intent } = input;
	const parsed = StateSelectionSchema.safeParse(intent);
	if (!parsed.success) return refuse("MODEL_INVALID", [], "The reading request is invalid.");
	const { explain, ...selection } = parsed.data;
	const invalidSelection = selectionFailure(parsed.data);
	if (invalidSelection !== undefined) return invalidSelection;
	const model = await requestedReading(vault, module, flow, {
		...parsed.data,
		model: expectedModel,
		code,
		references,
		reference,
	});
	if (!model.success || explain === undefined) return model;
	return attachCapture(model, explain, selection);
}
/**
 * Refuse conflicting architecture selectors before reading any state.
 * @param selection The parsed explicit selectors.
 * @returns A structured refusal or no conflict.
 */
function selectionFailure(selection: z.infer<typeof StateSelectionSchema>) {
	const incompatible = [
		selection.state,
		selection.checkpoint,
		selection.against,
		selection.explain,
	].some((value) => value !== undefined);
	if (selection.preview !== undefined && (incompatible || selection.compare === true))
		return refuse(
			"MODEL_INVALID",
			[],
			"Select preview without state, checkpoint, comparison, or explanation.",
		);
	if (selection.state !== undefined && selection.checkpoint !== undefined)
		return refuse("MODEL_INVALID", [], "Select one state or checkpoint.");
	return undefined;
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
				modelName: model.manifest.name,
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

/**
 * Refuse positional selectors that contradict the explicit captured reading.
 * @param model The public selected reading.
 * @param request The invocation intent.
 * @returns A refusal instead of a retargeted capture.
 */
function readingFailure(model: ArchitectureModel, request: Request) {
	if (model.selectedModule !== request.reading.scope || model.selectedFlow !== request.reading.flow)
		return refuse(
			"MODEL_INVALID",
			request.subjects,
			"The selected scope or flow does not match the explanation reading.",
		);
	return undefined;
}

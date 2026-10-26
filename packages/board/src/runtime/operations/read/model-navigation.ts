import { modelCodeTarget } from "#runtime/operations/read/model-code.ts";
import { readArchitectureModel, failure } from "#runtime/operations/read/model-read.ts";
import { readCheckpointModel } from "#runtime/operations/history/read.ts";
import { resolveModelReferences } from "#runtime/operations/read/model-references.ts";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import { selectReferenceSubject } from "#runtime/operations/read/reference-subject.ts";

interface NavigationOptions {
	code?: boolean | undefined;
	references?: boolean | undefined;
	reference?: number | undefined;
	checkpoint?: string | undefined;
	model?: string | undefined;
}

/**
 * Build an actionable navigation refusal.
 * @param code The public failure code.
 * @param message The unavailable action.
 * @param recovery The explicit recovery action.
 * @returns The complete structured refusal.
 */
function navigationFailure(
	code: "REFERENCE_UNAVAILABLE" | "TARGET_CHANGED",
	message: string,
	recovery: string,
) {
	return failure(code, [{ code, file: "model.json", message, recovery }]);
}

/**
 * Select exact local inputs and guard their model identity.
 * @param vault The explicitly addressed vault.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param options The explicit reading selectors.
 * @returns The coherent selected architecture or its refusal.
 */
async function navigationReading(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	options: NavigationOptions,
) {
	const model =
		options.checkpoint === undefined
			? readArchitectureModel(vault, module, flow)
			: await readCheckpointModel(vault, options.checkpoint, module, flow);
	if (!model.success) return model;
	if (options.model === undefined) return model;
	return options.model === model.manifest.id
		? model
		: navigationFailure(
				"TARGET_CHANGED",
				"The addressed model identity changed.",
				"Open the vault that owns the requested model identity.",
			);
}

/**
 * Follow one resolved reference through the same reader.
 * @param model The coherent source with navigation details.
 * @param index The authored reference index on its selected module.
 * @param code Whether to resolve code in the target reading.
 * @returns The addressed foreign model or an explicit unavailable result.
 */
async function followReference(
	model: ArchitectureModel,
	index: number,
	code: boolean | undefined,
): Promise<ArchitectureModelRead> {
	const reference = model.resolvedReferences?.find(
		(entry) => entry.module === model.selectedModule && entry.index === index,
	);
	if (reference === undefined)
		return navigationFailure(
			"REFERENCE_UNAVAILABLE",
			"The selected module reference is unavailable.",
			"Select an existing module and its authored reference index.",
		);
	const { address } = reference;
	if (address === undefined) return failure("REFERENCE_UNAVAILABLE", reference.diagnostics);
	return openReference(address, code);
}

/**
 * Open the explicit foreign subject through one selected reading.
 * @param address The resolved foreign reading and subject address.
 * @param code Whether to resolve code on the selected subject.
 * @returns The exact addressed subject, without substituting another subject kind.
 */
async function openReference(
	address: NonNullable<ArchitectureModel["location"]>,
	code: boolean | undefined,
): Promise<ArchitectureModelRead> {
	const target = await readModelNavigation(address.vault, undefined, undefined, {
		model: address.model,
		references: true,
		...(address.checkpoint === undefined ? {} : { checkpoint: address.checkpoint }),
	});
	const selected = selectReferenceSubject(target, address.subject);
	if (!selected.success) return selected;
	const located = { ...selected, location: address };
	return code ? { ...located, ...(await modelCodeTarget(address.vault, located)) } : located;
}

/**
 * Resolve presentation actions through existing architecture and checkout authorities.
 * @param vault The explicitly addressed vault.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param options The requested navigation details.
 * @returns The coherent architecture with its requested navigation and local target.
 */
async function readModelNavigation(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	options: NavigationOptions,
): Promise<ArchitectureModelRead> {
	let model = await navigationReading(vault, module, flow, options);
	if (!model.success) return model;
	if (options.references || options.reference !== undefined)
		model = await resolveModelReferences(vault, model);
	if (options.reference !== undefined)
		return followReference(model, options.reference, options.code);
	return options.code ? { ...model, ...(await modelCodeTarget(vault, model)) } : model;
}

export { readModelNavigation, type NavigationOptions };

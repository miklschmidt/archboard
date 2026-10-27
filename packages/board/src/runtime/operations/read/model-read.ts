import { InstalledMigrationSchema } from "#shared/schemas/migration-installation.ts";
import { WalkthroughSchema } from "#shared/schemas/model-walkthroughs.ts";
import { readRequestedArchitecture } from "#runtime/operations/read/model-explanation.ts";
import { ProposalSchema } from "#shared/schemas/model-proposals.ts";

import { FlowCollectionSchema } from "#shared/schemas/model-flows.ts";
import { z } from "zod";
import { errorMessage } from "@archboard/diagnostics/errno";
import {
	ArchitectureManifestSchema,
	ArchitectureModuleSchema,
	type ArchitectureModelRead,
	type ArchitectureModel,
	type ModelDiagnostic,
} from "#shared/schemas/model.ts";
import { SemanticBoardConfigurationSchema } from "#runtime/store/configuration.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import { modelDiagnostics, compareModelSubjects } from "#shared/rules/coherence/model.ts";

import { modelBoundaryFailure } from "#runtime/store/model-state.ts";
import type { NavigationOptions } from "#runtime/operations/read/model-navigation.ts";

type CapturedModel = ReturnType<typeof readModelFiles>;

/**
 * Decode captured JSON through the shared schema authority.
 * @param file The relative input path.
 * @param bytes The captured input bytes.
 * @param schema The supported document schema.
 * @param diagnostics The diagnostics collected for this read.
 * @returns The definition, or undefined when invalid.
 */
function decode<T>(
	file: string,
	bytes: Buffer | undefined,
	schema: z.ZodType<T>,
	diagnostics: ModelDiagnostic[],
): T | undefined {
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch (error) {
		diagnostics.push({
			code: "MALFORMED_JSON",
			file,
			message: errorMessage(error),
			recovery: "Repair the UTF-8 JSON input and read the model again.",
		});
		return undefined;
	}
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;
	for (const issue of parsed.error.issues)
		diagnostics.push({
			code: issue.path[0] === "schemaVersion" ? "UNSUPPORTED_FORMAT" : "INVALID_DOCUMENT",
			file,
			path: issue.path.map(String).join("."),
			message: issue.message,
			recovery: "Use the supported document schema and read the model again.",
		});
	return undefined;
}

/**
 * Require valid authored policy instead of activating legacy fallback defaults.
 * @param captured Exact inputs and diagnostics.
 * @returns The interpreted policy, or undefined when invalid.
 */
function decodePolicy(captured: CapturedModel): ArchitectureModel["policy"] | undefined {
	try {
		const source = new TextDecoder("utf-8", { fatal: true }).decode(
			captured.inputs.get(".archboard/config.yaml"),
		);
		return SemanticBoardConfigurationSchema.parse(Bun.YAML.parse(source));
	} catch (error) {
		captured.diagnostics.push({
			code: "INVALID_POLICY",
			file: ".archboard/config.yaml",
			message: errorMessage(error),
			recovery: "Repair the authored policy. Canonical model reads require a valid policy.",
		});
		return undefined;
	}
}

/**
 * Refuse unsupported authority or file sets before interpreting their content.
 * @param captured The discovered inputs and failures.
 * @returns A public refusal, or undefined for supported inputs.
 */
function discoveryFailure(captured: CapturedModel): ArchitectureModelRead | undefined {
	const legacy = [...captured.inputs.keys()].filter((file) => file.endsWith(".semantic.json"));
	if (legacy.length > 0)
		return failure(
			"LEGACY_AUTHORITY",
			legacy.map((file) => ({
				code: "LEGACY_AUTHORITY",
				file,
				message: "Legacy board files still own this vault.",
				recovery: "Run model inventory, save model plan choices, read model read --preview, then request explicit owner-authorized model migrate.",
			})),
		);
	if (captured.diagnostics.length > 0) return failure("MODEL_UNREADABLE", captured.diagnostics);
	if (!captured.inputs.has("model.json"))
		return failure("MODEL_NOT_FOUND", [
			{
				code: "MODEL_NOT_FOUND",
				file: "model.json",
				message: "The vault has no canonical model manifest.",
				recovery:
					"Run model init for an empty vault. For legacy inputs, run model inventory and follow the explicit migration workflow.",
			},
		]);

	return undefined;
}

/**
 * Find conflicting state definitions without borrowing archive state.
 * @param manifest The current designation.
 * @param proposals The active proposal documents.
 * @returns Identity and name diagnostics.
 */
function proposalDiagnostics(
	manifest: ArchitectureModel["manifest"],
	proposals: ArchitectureModel["proposals"],
): ModelDiagnostic[] {
	const stateIds = new Set(manifest.current === null ? [] : [manifest.current.id]);
	const diagnostics: ModelDiagnostic[] = [];
	for (const proposal of proposals) {
		if (stateIds.has(proposal.id))
			diagnostics.push({
				code: "DUPLICATE_STATE_ID",
				file: proposal.file,
				subjects: [proposal.id],
				message: "A state identity has more than one definition.",
				recovery: "Keep each stable state identity in one proposal or current designation.",
			});
		stateIds.add(proposal.id);
	}
	return diagnostics;
}
/**
 * Return the current designation as explicit reader metadata.
 * @param manifest The addressed manifest.
 * @returns The designation or absence for a planning model.
 */
function currentSelection(
	manifest: ArchitectureModel["manifest"],
): ArchitectureModel["selectedState"] {
	return manifest.current === null ? null : { ...manifest.current, lifecycle: "current" };
}
/**
 * Validate a materialized draft without changing the current designation.
 * @param manifest The retained manifest.
 * @param state The explicit selected state, when present.
 * @returns The validation context.
 */
function validationManifest(
	manifest: ArchitectureModel["manifest"],
	state: ArchitectureModel["selectedState"] | undefined,
) {
	return state == null ? manifest : { ...manifest, current: state };
}
/**
 * Interpret the captured file set as one complete model.
 * @param captured The exact bytes and their revision.
 * @param selectedState The explicit materialized state, when present.
 * @returns A coherent model or diagnostics for the complete input set.
 */
function decodeModel(
	captured: CapturedModel,
	selectedState?: ArchitectureModel["selectedState"],
): ArchitectureModelRead {
	const { inputs, diagnostics, revision } = captured;
	const manifest = decode(
		"model.json",
		inputs.get("model.json"),
		ArchitectureManifestSchema,
		diagnostics,
	);
	const policy = decodePolicy(captured);
	const discovered = [...inputs]
		.filter(([file]) => file.endsWith(".module.json"))
		.flatMap(([file, bytes]) => {
			const definition = decode(file, bytes, ArchitectureModuleSchema, diagnostics);
			return definition === undefined ? [] : [{ ...definition, file }];
		});
	if (manifest === undefined || policy === undefined) return failure("MODEL_INVALID", diagnostics);
	const collections = [...inputs]
		.filter(([file]) => file.endsWith(".flows.json"))
		.flatMap(([file, bytes]) => {
			const collection = decode(file, bytes, FlowCollectionSchema, diagnostics);
			return collection === undefined ? [] : [{ ...collection, file }];
		});
	const walkthroughs = [...inputs]
		.filter(([file]) => file.endsWith(".walkthrough.json"))
		.flatMap(([file, bytes]) => {
			const definition = decode(file, bytes, WalkthroughSchema, diagnostics);
			return definition === undefined ? [] : [{ ...definition, file }];
		});

	const migration = decodeInstalledMigration(captured);
	const proposals = [...inputs]
		.filter(([file]) => file.endsWith(".proposal.json"))
		.flatMap(([file, bytes]) => {
			const proposal = decode(file, bytes, ProposalSchema, diagnostics);
			return proposal === undefined ? [] : [{ ...proposal, file }];
		});
	diagnostics.push(...proposalDiagnostics(manifest, proposals));
	if (diagnostics.length > 0) return failure("MODEL_INVALID", diagnostics);
	diagnostics.push(
		...modelDiagnostics(
			discovered,
			policy,
			validationManifest(manifest, selectedState),
			collections,
			walkthroughs,
		),
	);
	if (diagnostics.length > 0) return failure("MODEL_INVALID", diagnostics);

	const modules = discovered
		.toSorted(compareModelSubjects)
		.map((module) => ({ ...module, outgoing: module.outgoing.toSorted(compareModelSubjects) }));
	return {
		success: true,
		migration,
		manifest,
		policy,
		revision,
		modules,
		collections,
		walkthroughs,
		proposals,
		selectedState: selectedState ?? currentSelection(manifest),
		roots: modules.filter((module) => module.parent === undefined).map((module) => module.id),
		relationships: modules.flatMap((source) =>
			source.outgoing.map((edge) => ({ ...edge, from: source.id })),
		),
	};
}

/**
 * Resolve a stable identity before unique current or former names.
 * @param model The validated complete model.
 * @param selector The requested module, when any.
 * @returns The model with its selected module, or an actionable refusal.
 */
function selectModule(
	model: ArchitectureModel,
	selector: string | undefined,
): ArchitectureModelRead {
	if (selector === undefined) return model;
	const exact = model.modules.find((module) => module.id === selector);
	if (exact !== undefined) return { ...model, selectedModule: exact.id };
	const matches = model.modules.filter(
		(module) => module.name === selector || module.formerNames?.includes(selector),
	);
	if (matches.length === 1) return { ...model, selectedModule: matches[0]!.id };
	const code = matches.length === 0 ? "MODULE_NOT_FOUND" : "MODULE_AMBIGUOUS";
	return failure(code, [
		{
			code,
			file: "model.json",
			subjects: matches.map((module) => module.id),
			message: `Module selector "${selector}" resolves to ${matches.length} modules.`,
			recovery: "Read the model roots and use one qualified module id.",
		},
	]);
}

/**
 * Resolve an explicit flow without inferring execution order.
 * @param model The coherent model or an earlier refusal.
 * @param selector The optional explicit flow selector.
 * @returns The selected reading or actionable diagnostics.
 */
function selectFlow(model: ArchitectureModelRead, selector?: string): ArchitectureModelRead {
	if (!model.success || selector === undefined) return model;
	const flows = model.collections.flatMap((collection) => collection.flows);
	const exact = flows.find((flow) => flow.id === selector);
	if (exact) return { ...model, selectedFlow: exact.id };
	const matches = flows.filter(
		(flow) => flow.name === selector || flow.formerNames?.includes(selector),
	);
	if (matches.length === 1) return { ...model, selectedFlow: matches[0]!.id };
	const code = matches.length === 0 ? "FLOW_NOT_FOUND" : "FLOW_AMBIGUOUS";
	return failure(code, [
		{
			code,
			file: "model.json",
			subjects: matches.map((flow) => flow.id),
			message: `Flow selector resolves to ${matches.length} flows.`,
			recovery: "Read collections and select one qualified flow identity.",
		},
	]);
}

/**
 * Read authored canonical modules without changing any architecture input.
 * @param vault The explicitly addressed vault.
 * @param module A qualified module id or a unique current or former name.
 * @param flow The optional explicit flow selector.
 * @returns One model and its exact input revision, or structured diagnostics.
 */
function readCurrentModel(vault: string, module?: string, flow?: string): ArchitectureModelRead {
	const captured = readModelFiles(vault);
	const refusal = discoveryFailure(captured);
	if (refusal !== undefined) return refusal;
	const model = decodeModel(captured);
	if (!model.success) return model;
	const latest = readModelFiles(vault);
	if (latest.diagnostics.length > 0 || latest.revision.digest !== model.revision.digest)
		return failure("MODEL_CHANGED", [
			{
				code: "MODEL_CHANGED",
				file: ".",
				message: "The authored input set changed during this read.",
				recovery: "Finish external file edits and read the model again.",
			},
		]);
	return selectFlow(selectModule(model, module), flow);
}

/**
 * Return one complete refusal instead of a partial graph.
 * @param code The public result code.
 * @param diagnostics The actionable input failures.
 * @returns The structured read failure.
 */
function failure(
	code: Extract<ArchitectureModelRead, { success: false }>["code"],
	diagnostics: ModelDiagnostic[],
): Extract<ArchitectureModelRead, { success: false }> {
	return {
		success: false,
		code,
		error: "The canonical model cannot be read coherently.",
		diagnostics,
	};
}

/**
 * Read current inputs only outside a pending installation.
 * @param vault The explicitly addressed vault.
 * @param module The module selector.
 * @param flow The optional explicit flow selector.
 * @returns The operation result.
 */
function readArchitectureModel(
	vault: string,
	module?: string,
	flow?: string,
): ArchitectureModelRead;
function readArchitectureModel(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	options: NavigationOptions,
): Promise<ArchitectureModelRead>;
function readArchitectureModel(
	vault: string,
	module?: string,
	flow?: string,
	options?: NavigationOptions,
): ArchitectureModelRead | Promise<ArchitectureModelRead> {
	const blocked = modelBoundaryFailure(vault);
	if (options !== undefined)
		return (async () => {
			if (blocked !== undefined) return blocked;
			const captured = await readRequestedArchitecture(vault, module, flow, options);
			return modelBoundaryFailure(vault) ?? captured;
		})();
	if (blocked !== undefined) return blocked;
	const reading = readCurrentModel(vault, module, flow);
	return modelBoundaryFailure(vault) ?? reading;
}

export {
	readCurrentModel,
	readArchitectureModel,
	decodeModel,
	discoveryFailure,
	selectModule,
	selectFlow,
	failure,
};

/**
 * Decode installed reading metadata only when it exists.
 * @param captured Exact input bytes and diagnostics.
 * @returns Installed migration metadata, or absence.
 */
function decodeInstalledMigration(captured: CapturedModel) {
	if (!captured.inputs.has("migration.json")) return undefined;
	return decode(
		"migration.json",
		captured.inputs.get("migration.json"),
		InstalledMigrationSchema,
		captured.diagnostics,
	);
}

import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import {
	ArchitectureInitializationRequestSchema,
	ArchitecturePortableBundleSchema,
} from "#shared/schemas/model-portable.ts";
import { mintId } from "#shared/rules/ids.ts";
import { DEFAULT_SEMANTIC_POLICY } from "#shared/schemas/semantic-policy.ts";
import { modelRevision, readModelFiles } from "#runtime/store/model-files.ts";
import {
	archiveContext,
	archiveTip,
	readRecord,
	readCheckpointInputs,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import { activeJournal } from "#runtime/store/model-install.ts";
import { modelBoundaryFailure, operationRef } from "#runtime/store/model-state.ts";
import { historyResult } from "#runtime/operations/history/result.ts";
import { installArchitectureModel } from "#runtime/operations/history/portable.ts";
type Request = z.infer<typeof ArchitectureInitializationRequestSchema>;
type Bundle = z.infer<typeof ArchitecturePortableBundleSchema>;
type Inputs = ReturnType<typeof readModelFiles>;
/**
 * Require explicit recovery unless this request resumes its own durable intent.
 * @param vault The addressed vault.
 * @param request The initialization intent.
 * @returns A recovery refusal, when another operation owns the boundary.
 */
function initializationBoundary(vault: string, request: Request) {
	const blocked = modelBoundaryFailure(vault);
	if (blocked?.recovery?.operationId === request.operationId) return undefined;
	return blocked;
}
/**
 * Refuse legacy authority before consulting any source or private archive.
 * @param before The exact destination inputs.
 */
function assertNoLegacy(before: Inputs): void {
	if ([...before.inputs.keys()].some((path) => path.endsWith(".semantic.json")))
		throw new ArchiveError(
			"LEGACY_AUTHORITY",
			"Inventory this vault and save an explicit migration plan before cutover.",
		);
}
/**
 * Construct one empty canonical planning model without fixed levels.
 * @param before The exact empty destination.
 * @param request The model name and original intent.
 * @returns The installer bundle with its generated stable identity.
 */
function initialBundle(before: Inputs, request: Request): Bundle {
	if (
		before.diagnostics.length !== 0 ||
		[...before.inputs.keys()].some((path) => path !== ".archboard/config.yaml")
	)
		throw new ArchiveError(
			"TARGET_CHANGED",
			"Initialization requires an empty vault. Read the existing model or migrate legacy inputs explicitly.",
		);
	const id = mintId(new Set());
	const inputs = new Map(before.inputs);
	inputs.set(
		"model.json",
		Buffer.from(
			JSON.stringify({ schemaVersion: 1, id, name: request.name, current: null }, null, 2) + "\n",
		),
	);
	if (!inputs.has(".archboard/config.yaml")) {
		const { levels: _levels, ...policy } = DEFAULT_SEMANTIC_POLICY;
		inputs.set(".archboard/config.yaml", Buffer.from(Bun.YAML.stringify(policy)));
	}
	return {
		format: "archboard-model",
		schemaVersion: 1,
		model: id,
		revision: modelRevision(inputs),
		inputs: [...inputs].map(([path, bytes]) => ({ path, bytes: bytes.toString("base64") })),
		history: { tips: [], bundle: null },
	};
}
/**
 * Resume an exact initialization through its existing durable installer record.
 * @param vault The destination vault.
 * @param context The existing archive.
 * @param request The unchanged retry intent.
 * @param checkpoint The retained initialization checkpoint.
 * @returns The original durable result or recovery refusal.
 */
async function retryInitialization(
	vault: string,
	context: Awaited<ReturnType<typeof archiveContext>>,
	request: Request,
	checkpoint: string,
) {
	const record = await readRecord(context, checkpoint);
	const original = record.kind === "checkpoint" ? record.installation : undefined;
	if (
		original?.type !== "initialize" ||
		!isDeepStrictEqual(ArchitectureInitializationRequestSchema.strip().parse(original), request)
	)
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity names another initialization intent.",
		);
	const captured = await readCheckpointInputs(context, checkpoint);
	const bundle: Bundle = {
		format: "archboard-model",
		schemaVersion: 1,
		model: original.target.model,
		revision: captured.revision,
		inputs: [...captured.inputs].map(([path, bytes]) => ({
			path,
			bytes: bytes.toString("base64"),
		})),
		history: { tips: [], bundle: null },
	};
	return installArchitectureModel(
		vault,
		{
			operationId: request.operationId,
			writer: request.writer,
			doing: request.doing,
			expectedRevision: original.expectedRevision,
			bundle,
		},
		request,
	);
}
/**
 * Find a pending or completed record for this operation identity.
 * @param vault The destination vault.
 * @param context The existing archive.
 * @param request The retry identity.
 * @returns Its exact checkpoint, when retained.
 */
function previousInitialization(
	vault: string,
	context: Awaited<ReturnType<typeof archiveContext>>,
	request: Request,
) {
	const pending = activeJournal(vault);
	return pending?.request.operationId === request.operationId
		? pending.checkpoint
		: archiveTip(context, operationRef(vault, request.operationId));
}
/**
 * Initialize one empty canonical planning model through the existing signed installer.
 * @param vault The destination vault.
 * @param input The stable initialization intent.
 * @returns The durable installation receipt or explicit refusal.
 */
async function initializeArchitectureModel(
	vault: string,
	input: z.input<typeof ArchitectureInitializationRequestSchema>,
) {
	const request = ArchitectureInitializationRequestSchema.parse(input);
	return historyResult("MODEL_WRITE_FAILED", async () => {
		const blocked = initializationBoundary(vault, request);
		if (blocked !== undefined) return blocked;
		const before = readModelFiles(vault);
		assertNoLegacy(before);
		const context = await archiveContext(vault);
		const previous = await previousInitialization(vault, context, request);
		if (previous !== undefined) return retryInitialization(vault, context, request, previous);
		return installArchitectureModel(
			vault,
			{
				operationId: request.operationId,
				writer: request.writer,
				doing: request.doing,
				expectedRevision: before.revision,
				bundle: initialBundle(before, request),
			},
			request,
		);
	});
}
export { initializeArchitectureModel };

import { privateArchivePath } from "#runtime/store/model-archive-location.ts";
import { operationSubjects } from "#shared/rules/model-operation.ts";
import { stateDir } from "@archboard/workspace/state-dir";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { z } from "zod";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { mintId } from "#shared/rules/ids.ts";
import {
	type ArchitectureModelRead,
	ModelRevisionSchema,
	QualifiedSubjectIdSchema,
	ModelRecoverySchema,
	GitObjectIdSchema,
} from "#shared/schemas/model.ts";
import {
	ArchitectureModuleEditSchema,
	ArchitectureClaimSchema,
} from "#shared/schemas/model-operations.ts";
import { holdBoard, BoardHeldError } from "#runtime/store/lock/lock.ts";
import { boardLockState, releaseHold, renewRecord } from "#runtime/store/lock/lease-state.ts";
import {
	ArchiveError,
	optionalValue,
	settledValues,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";

import { PortableInstallationSchema } from "#shared/schemas/model-portable.ts";

const MODEL_LOCK = "@canonical-install";
const MODEL_STATE = "archboard-transactions";
const CheckoutContextSchema = z
	.object({
		root: z.string(),
		vault: z.string(),
		...ModelRecoverySchema.shape.checkout.shape,
	})
	.strict();
const ClaimsStateSchema = z
	.object({ claims: z.array(ArchitectureClaimSchema), revoked: z.array(z.string()) })
	.strict();
const JournalSchema = z
	.object({
		schemaVersion: z.literal(1),
		context: CheckoutContextSchema,
		request: z.union([ArchitectureModuleEditSchema, PortableInstallationSchema]),
		subjects: z.array(QualifiedSubjectIdSchema).optional(),
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkpoint: GitObjectIdSchema,
		ref: z.string(),
		phase: ModelRecoverySchema.shape.phase,
		files: z.array(
			z
				.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() })
				.strict(),
		),
	})
	.strict();
type ModelJournal = z.infer<typeof JournalSchema>;
type ModelFailure = Extract<ArchitectureModelRead, { success: false }>;

/**
 * Expose the original context and retained candidate without publishing private paths or input images.
 * @param journal The durable installation record.
 * @returns Public recovery details.
 */
function recoveryDetails(journal: ModelJournal): z.infer<typeof ModelRecoverySchema> {
	return {
		operationId: journal.request.operationId,
		checkpoint: journal.checkpoint,
		phase: journal.phase,
		subjects: operationSubjects(journal.request, journal.subjects),
		before: journal.before,
		after: journal.after,
		checkout: { branch: journal.context.branch, head: journal.context.head },
	};
}
/**
 * Make an incomplete write inspectable without treating an uncertain installation as a refusal before application.
 * @param vault The explicitly addressed vault.
 * @param failure The operation refusal.
 * @param operationId The requested identity, or absence for explicit recovery.
 * @returns The refusal with safe recovery and application information.
 */
function modelWriteFailure(
	vault: string,
	failure: ModelFailure,
	operationId?: string,
): ModelFailure {
	const result: ModelFailure = { ...failure, applied: false, reconciliation: false };
	try {
		const journal = readState(vault, "transaction.json", JournalSchema);
		if (journal === undefined) return result;
		const requested = operationId ?? journal.request.operationId;
		return {
			...result,
			applied:
				requested === journal.request.operationId && journal.phase !== "prepared"
					? "unknown"
					: false,
			recovery: recoveryDetails(journal),
		};
	} catch {
		return { ...result, applied: "unknown" };
	}
}

/**
 * Resolve the checkout's own Git administrative directory.
 * @param root The root value.
 * @param marker The marker value.
 * @returns The operation result.
 */
function gitStateDirectory(root: string, marker: string): string {
	if (lstatSync(marker).isDirectory()) return marker;
	const pointer = /^gitdir: (.+)$/u.exec(readFileSync(marker, "utf8").trim());
	if (pointer === null)
		throw new ArchiveError(
			"RECOVERY_CONTEXT_CHANGED",
			"The checkout Git directory marker is invalid.",
		);
	return resolve(root, pointer[1]!);
}

/**
 * Locate private checkout state.
 * @param vault The explicitly addressed vault.
 * @param file The normalized file path or logged image.
 * @returns The checkout-private state path.
 */
function modelStatePath(vault: string, file: string): string {
	const fallback = join(stateDir(), MODEL_STATE, operationKey(resolve(vault)), file);
	if (existsSync(privateArchivePath(vault))) return fallback;
	let root = resolve(vault);
	for (;;) {
		const marker = join(root, ".git");
		if (existsSync(marker)) {
			const directory = gitStateDirectory(root, marker);
			return join(directory, MODEL_STATE, operationKey(resolve(vault)), file);
		}
		const parent = dirname(root);
		if (parent === root) return fallback;
		root = parent;
	}
}
/**
 * Name one operation without treating user input as a path.
 * @param vault The explicitly addressed vault.
 * @param operationId The stable identity of this intent.
 * @param kind The private retention namespace.
 * @returns The private operation ref.
 */
function operationRef(vault: string, operationId: string, kind = "completed"): string {
	return `refs/archboard/${kind}/${operationKey(`${resolve(vault)}\0${operationId}`)}`;
}
/**
 * Fingerprint an operation identity without using it as a path.
 * @param operationId The stable identity of this intent.
 * @returns The complete operation digest.
 */
function operationKey(operationId: string): string {
	return createHash("sha256").update(operationId).digest("hex");
}
/**
 * Read a private record without hiding malformed records.
 * @param vault The explicitly addressed vault.
 * @param file The normalized file path or logged image.
 * @param schema The authoritative schema.
 * @returns The parsed durable record, or absence.
 */
function readState<T>(vault: string, file: string, schema: z.ZodType<T>): T | undefined {
	const directory = modelStatePath(vault, "");
	if (existsSync(directory) && !lstatSync(directory).isDirectory())
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Private runtime state is not a regular directory.",
		);
	const at = modelStatePath(vault, file);
	if (!existsSync(at)) return undefined;
	if (!lstatSync(at).isFile())
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Private recovery state is not a regular file.",
			file,
		);
	return schema.parse(JSON.parse(readFileSync(at, "utf8")));
}
/**
 * Persist a complete private record through the durable writer.
 * @param vault The explicitly addressed vault.
 * @param file The normalized file path or logged image.
 * @param value The complete value to persist.
 */
function writeState(vault: string, file: string, value: unknown): void {
	const directory = modelStatePath(vault, "");
	if (existsSync(directory) && !lstatSync(directory).isDirectory())
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Private runtime state is not a regular directory. Preserve it before recovery.",
		);
	writeFileAtomic(modelStatePath(vault, file), `${JSON.stringify(value)}\n`, {
		createParents: true,
	});
}
/**
 * Identify the source branch without publishing local paths.
 * @param context The caller checkout or invocation context.
 * @returns The private branch and checkout identity.
 */
async function checkoutContext(context: ArchiveContext) {
	const [branch, head] = await settledValues([
		optionalValue(context, ["symbolic-ref", "--quiet", "HEAD"]),
		optionalValue(context, ["rev-parse", "--verify", "--quiet", "HEAD"]),
	]);
	return {
		root: resolve(context.root),
		vault: context.vault,
		branch: branch ?? "detached",
		head: head ?? null,
	};
}
/**
 * Refuse replay when a branch switch changes the private checkout context.
 * @param context The caller checkout or invocation context.
 * @param expected The recorded checkout context.
 */
async function requireCheckout(
	context: ArchiveContext,
	expected: ModelJournal["context"],
): Promise<void> {
	if (!isDeepStrictEqual(await checkoutContext(context), expected))
		throw new ArchiveError(
			"RECOVERY_CONTEXT_CHANGED",
			"The source checkout or branch changed. Restore the recorded branch and HEAD before recovery.",
		);
}
/**
 * Keep the ephemeral lease separate from the durable journal directory.
 * @param vault The explicitly addressed vault.
 * @returns The checkout-private lease address for this vault.
 */
function modelLease(vault: string) {
	return {
		vault: dirname(dirname(modelStatePath(vault, ""))),
		board: `${MODEL_LOCK}-${operationKey(resolve(vault))}`,
	};
}

/**
 * Share the existing cross-process lease without holding a standing subject claim.
 * @param vault The explicitly addressed vault.
 * @param work The operation while the installation lease stands.
 * @returns The operation result after the lease releases.
 */
async function withModelLock<T>(
	vault: string,
	work: (guard: () => void) => Promise<T> | T,
): Promise<T> {
	const id = mintId();
	const lease = modelLease(vault);
	try {
		await holdBoard({
			...lease,
			holder: { id, kind: "agent" },
			waitMs: 0,
		});
	} catch (error) {
		if (error instanceof BoardHeldError)
			throw new ArchiveError(
				"MODEL_BUSY",
				"Another architecture operation holds the installation lock. Retry after it completes.",
			);
		throw error;
	}
	const timer = setInterval(
		() => renewRecord(lease.vault, lease.board, id, BOARD_LOCK_MS.lease),
		BOARD_LOCK_MS.renew,
	);
	timer.unref();
	try {
		return await work(() => {
			if (boardLockState(lease.vault, lease.board)?.id !== id)
				throw new ArchiveError(
					"MODEL_BUSY",
					"The installation lease was lost. Retry through recovery.",
				);
		});
	} finally {
		clearInterval(timer);
		releaseHold(lease.vault, lease.board, id);
	}
}
/**
 * Block current reads before and after capture when installation is pending.
 * @param vault The explicitly addressed vault.
 * @returns A recovery refusal, or absence when current reads are safe.
 */
function modelBoundaryFailure(
	vault: string,
): Extract<ArchitectureModelRead, { success: false }> | undefined {
	try {
		const journal = readState(vault, "transaction.json", JournalSchema);
		if (journal !== undefined && journal.phase !== "completed")
			return {
				...blockedRead(
					"RECOVERY_REQUIRED",
					"A durable architecture transaction is pending.",
					"Run model recover in this checkout. Preserve foreign inputs and restore its original branch if recovery refuses.",
				),
				recovery: recoveryDetails(journal),
			};
		const lease = modelLease(vault);
		if (boardLockState(lease.vault, lease.board) !== null)
			return blockedRead(
				"MODEL_BUSY",
				"An architecture operation is in progress.",
				"Retry the coherent read after the operation completes.",
			);
		return undefined;
	} catch {
		return blockedRead(
			"RECOVERY_REQUIRED",
			"Private recovery state cannot be read.",
			"Preserve the private records and restore their original valid content before model recover.",
		);
	}
}
/**
 * Return an unavailable reading without exposing any partial architecture.
 * @param code The code value.
 * @param message The message value.
 * @param recovery The recovery value.
 * @returns The operation result.
 */
function blockedRead(
	code: "RECOVERY_REQUIRED" | "MODEL_BUSY",
	message: string,
	recovery: string,
): Extract<ArchitectureModelRead, { success: false }> {
	return {
		success: false,
		code,
		error: "The current architecture is unavailable during installation.",
		diagnostics: [{ code, file: ".", message, recovery }],
	};
}
export {
	JournalSchema,
	ClaimsStateSchema,
	type ModelJournal,
	modelStatePath,
	operationRef,
	readState,
	writeState,
	checkoutContext,
	requireCheckout,
	withModelLock,
	modelBoundaryFailure,
	modelWriteFailure,
};

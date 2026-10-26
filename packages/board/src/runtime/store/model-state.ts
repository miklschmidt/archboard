import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { LOCK_LEASE_MS, LOCK_RENEW_MS } from "@archboard/timing";
import { mkdirDurably, writeFileAtomic } from "@archboard/workspace/atomic-write";
import { git } from "@archboard/workspace/checkouts";
import { mintId } from "#shared/rules/ids.ts";
import {
	type ArchitectureModelRead,
	ModelRevisionSchema,
	GitObjectIdSchema,
} from "#shared/schemas/model.ts";
import {
	ArchitectureModuleEditSchema,
	ArchitectureEditSuccessSchema,
	ArchitectureClaimSchema,
} from "#shared/schemas/model-operations.ts";
import { holdBoard, BoardHeldError } from "#runtime/store/lock/lock.ts";
import { boardLockState, releaseHold, renewRecord } from "#runtime/store/lock/lease-state.ts";
import { ArchiveError, type ArchiveContext } from "#runtime/store/model-archive.ts";

const MODEL_LOCK = "@canonical-install";
const MODEL_STATE = ".archboard/runtime";
const CheckoutContextSchema = z
	.object({ root: z.string(), vault: z.string(), branch: z.string(), head: z.string().nullable() })
	.strict();
const ClaimsStateSchema = z
	.object({ claims: z.array(ArchitectureClaimSchema), revoked: z.array(z.string()) })
	.strict();
const JournalSchema = z
	.object({
		schemaVersion: z.literal(1),
		context: CheckoutContextSchema,
		request: ArchitectureModuleEditSchema,
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkpoint: GitObjectIdSchema,
		ref: z.string(),
		phase: z.enum(["prepared", "installing", "installed", "completed"]),
		files: z.array(
			z
				.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() })
				.strict(),
		),
		result: ArchitectureEditSuccessSchema,
	})
	.strict();
type ModelJournal = z.infer<typeof JournalSchema>;

/** Locate private checkout state. */
function modelStatePath(vault: string, file: string): string {
	return join(vault, MODEL_STATE, file);
}
/** Name one operation without treating user input as a path. */
function operationRef(vault: string, operationId: string, kind = "completed"): string {
	return `refs/archboard/${kind}/${operationKey(`${resolve(vault)}\0${operationId}`)}`;
}
function operationKey(operationId: string): string {
	return createHash("sha256").update(operationId).digest("hex");
}
/** Read a private record without hiding malformed records. */
function readState<T>(vault: string, file: string, schema: z.ZodType<T>): T | undefined {
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
/** Persist a complete private record through the durable writer. */
function writeState(vault: string, file: string, value: unknown): void {
	const directory = modelStatePath(vault, "");
	if (existsSync(directory) && !lstatSync(directory).isDirectory())
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Private runtime state is not a regular directory. Preserve it before recovery.",
		);
	mkdirDurably(directory);
	writeFileAtomic(modelStatePath(vault, file), `${JSON.stringify(value)}\n`);
}
/** Identify the source branch without publishing local paths. */
async function checkoutContext(context: ArchiveContext) {
	const branch =
		(await git(context.root, ["symbolic-ref", "--quiet", "HEAD"]).catch(() => undefined)) ??
		"detached";
	const head =
		(await git(context.root, ["rev-parse", "--verify", "--quiet", "HEAD"]).catch(
			() => undefined,
		)) ?? null;
	return { root: resolve(context.root), vault: context.vault, branch, head };
}
/** Refuse replay when a branch switch changes the private checkout context. */
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
/** Share the existing cross-process lease without holding a standing subject claim. */
async function withModelLock<T>(
	vault: string,
	work: (guard: () => void) => Promise<T> | T,
): Promise<T> {
	const id = mintId();
	try {
		await holdBoard({ vault, board: MODEL_LOCK, holder: { id, kind: "agent" }, waitMs: 0 });
	} catch (error) {
		if (error instanceof BoardHeldError)
			throw new ArchiveError(
				"MODEL_BUSY",
				"Another architecture operation holds the installation lock. Retry after it completes.",
			);
		throw error;
	}
	const timer = setInterval(() => renewRecord(vault, MODEL_LOCK, id, LOCK_LEASE_MS), LOCK_RENEW_MS);
	timer.unref();
	try {
		return await work(() => {
			if (boardLockState(vault, MODEL_LOCK)?.id !== id)
				throw new ArchiveError(
					"MODEL_BUSY",
					"The installation lease was lost. Retry through recovery.",
				);
		});
	} finally {
		clearInterval(timer);
		releaseHold(vault, MODEL_LOCK, id);
	}
}
/** Block current reads before and after capture when installation is pending. */
function modelBoundaryFailure(
	vault: string,
): Extract<ArchitectureModelRead, { success: false }> | undefined {
	let journal = false;
	try {
		journal =
			readState(vault, "transaction.json", JournalSchema)?.phase !== "completed" &&
			existsSync(modelStatePath(vault, "transaction.json"));
	} catch {
		journal = true;
	}
	const held = boardLockState(vault, MODEL_LOCK) !== null;
	if (!journal && !held) return undefined;
	const code = journal ? "RECOVERY_REQUIRED" : "MODEL_BUSY";
	return {
		success: false,
		code,
		error: "The current architecture is unavailable during installation.",
		diagnostics: [
			{
				code,
				file: ".",
				message: journal
					? "A durable architecture transaction is pending."
					: "An architecture operation is in progress.",
				recovery: journal
					? "Run model recover in this checkout. Preserve foreign inputs and restore its original branch if recovery refuses."
					: "Retry the coherent read after the operation completes.",
			},
		],
	};
}
export {
	MODEL_STATE,
	MODEL_LOCK,
	JournalSchema,
	ClaimsStateSchema,
	type ModelJournal,
	modelStatePath,
	operationRef,
	operationKey,
	readState,
	writeState,
	checkoutContext,
	requireCheckout,
	withModelLock,
	modelBoundaryFailure,
};

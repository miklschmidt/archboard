import { notifyArchitecture } from "#runtime/store/model-news.ts";
import { isDeepStrictEqual } from "node:util";
import { CLAIM_DEFAULT_MS } from "@archboard/timing";
import { mintId } from "#shared/rules/ids.ts";
import {
	ArchitectureClaimRequestSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureClaimTakeBackSchema,
	type ArchitectureClaimRequest,
	type ArchitectureClaimList,
	type ArchitectureClaimResult,
	type ArchitectureClaim,
	type ArchitectureModuleEdit,
} from "#shared/schemas/model-operations.ts";
import { readCurrentModel } from "#runtime/operations/read/model-read.ts";
import { archiveFailure, historyResult } from "#runtime/operations/history/result.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import {
	JournalSchema,
	ClaimsStateSchema,
	readState,
	writeState,
	withModelLock,
} from "#runtime/store/model-state.ts";
import type { z } from "zod";

/**
 * Read the exact durable claims and revocations for this checkout.
 * @param vault The explicitly addressed vault.
 * @returns The durable claims and revocations.
 */
function claimState(vault: string) {
	return readState(vault, "claims.json", ClaimsStateSchema) ?? { claims: [], revoked: [] };
}
/**
 * Read visible claims without acquiring the installation lease.
 * @param vault The explicitly addressed vault.
 * @returns The visible claims or structured diagnostics.
 */
function readArchitectureClaims(vault: string): ArchitectureClaimList {
	try {
		return {
			success: true,
			claims: claimState(vault).claims.filter((claim) => Date.parse(claim.until) > Date.now()),
		};
	} catch (error) {
		return archiveFailure("MODEL_UNREADABLE", error, "claims");
	}
}
/**
 * Require the exact architectural state that the agent selected.
 * @param vault The explicitly addressed vault.
 * @param target The explicitly selected model and current state.
 * @returns The coherent selected state or a structured refusal.
 */
function requireTarget(vault: string, target: ArchitectureClaim["target"]) {
	const current = readCurrentModel(vault);
	if (!current.success) return current;
	if (current.manifest.id !== target.model || current.manifest.current?.id !== target.state)
		throw new ArchiveError(
			"TARGET_CHANGED",
			"The selected model or current state changed. Read it again before writing.",
		);
	return current;
}
/**
 * Extend only the same writer's exact explicit subject scope.
 * @param vault The explicitly addressed vault.
 * @param state The state value.
 * @param overlap The overlap value.
 * @param request The original operation intent.
 * @returns The operation result.
 */
function renewClaim(
	vault: string,
	state: ReturnType<typeof claimState>,
	overlap: ArchitectureClaim,
	request: ArchitectureClaimRequest,
) {
	if (
		overlap.writer !== request.writer ||
		!isDeepStrictEqual(overlap.subjects, request.subjects) ||
		!isDeepStrictEqual(overlap.target, request.target)
	)
		throw new ArchiveError(
			"CLAIM_HELD",
			`Subjects are claimed by ${overlap.writer}. Wait for release or ask the reader to take the claim back.`,
			"claims",
			request.subjects,
		);
	const claim = {
		...overlap,
		reason: request.reason,
		until: new Date(Date.now() + CLAIM_DEFAULT_MS).toISOString(),
	};
	writeState(vault, "claims.json", {
		...state,
		claims: state.claims.map((value) => (value.id === claim.id ? claim : value)),
	});
	return { success: true as const, claim };
}

/**
 * Keep new subject ownership outside an unfinished installation.
 * @param vault The explicitly addressed vault.
 */
function requireNoPending(vault: string): void {
	const pending = readState(vault, "transaction.json", JournalSchema);
	if (pending !== undefined && pending.phase !== "completed")
		throw new ArchiveError(
			"RECOVERY_REQUIRED",
			"Recover the pending installation before claiming another scope.",
		);
}

/**
 * Claim explicit module identities while leaving long agent work outside the installation lease.
 * @param vault The explicitly addressed vault.
 * @param input The complete caller input.
 * @returns The claimed scope or structured refusal.
 */
async function claimArchitectureSubjects(
	vault: string,
	input: ArchitectureClaimRequest,
): Promise<ArchitectureClaimResult> {
	const request = ArchitectureClaimRequestSchema.parse(input);
	const result = await historyResult("MODEL_WRITE_FAILED", () =>
		withModelLock(vault, () => {
			requireNoPending(vault);
			const current = requireTarget(vault, request.target);
			if (!current.success) return current;
			if (
				request.subjects.some((subject) => !current.modules.some((module) => module.id === subject))
			)
				throw new ArchiveError(
					"MODULE_NOT_FOUND",
					"A claimed subject does not exist in this model.",
				);
			const state = claimState(vault);
			const live = state.claims.filter((claim) => Date.parse(claim.until) > Date.now());
			const overlap = live.find((claim) =>
				claim.subjects.some((subject) => request.subjects.includes(subject)),
			);
			if (overlap !== undefined) return renewClaim(vault, state, overlap, request);
			const claim = {
				...request,
				id: mintId(),
				since: new Date().toISOString(),
				until: new Date(Date.now() + CLAIM_DEFAULT_MS).toISOString(),
			};
			writeState(vault, "claims.json", { ...state, claims: [...live, claim] });
			return { success: true as const, claim };
		}),
	);
	if (result.success) notifyArchitecture(vault);
	return result;
}
/**
 * Release the caller's claim, or record a reader's explicit take-back.
 * @param vault The explicitly addressed vault.
 * @param id The retained checkpoint or claim identity.
 * @param writer The claim writer when releasing a scope.
 * @returns The remaining claims or a structured refusal.
 */
async function endClaim(
	vault: string,
	id: string,
	writer?: string,
): Promise<ArchitectureClaimList> {
	const result = await historyResult("MODEL_WRITE_FAILED", () =>
		withModelLock(vault, () => {
			const state = claimState(vault);
			const claim = state.claims.find((value) => value.id === id);
			if (claim !== undefined && writer !== undefined && claim.writer !== writer)
				throw new ArchiveError(
					"CLAIM_HELD",
					"Only the claim writer can release it. A reader can explicitly take it back.",
					id,
				);
			writeState(vault, "claims.json", {
				claims: state.claims.filter((value) => value.id !== id),
				revoked: [...new Set([...state.revoked, id])],
			});
			return readArchitectureClaims(vault);
		}),
	);
	if (result.success) notifyArchitecture(vault);
	return result;
}
/**
 * Release one agent's standing scope.
 * @param vault The explicitly addressed vault.
 * @param input The complete caller input.
 * @returns The remaining claims or structured refusal.
 */
function releaseArchitectureClaim(
	vault: string,
	input: z.infer<typeof ArchitectureClaimReleaseSchema>,
) {
	const request = ArchitectureClaimReleaseSchema.parse(input);
	return endClaim(vault, request.claim, request.writer);
}
/**
 * End a claim through the reader's explicit control.
 * @param vault The explicitly addressed vault.
 * @param input The complete caller input.
 * @returns The remaining claims after explicit take-back.
 */
function takeBackArchitectureClaim(
	vault: string,
	input: z.infer<typeof ArchitectureClaimTakeBackSchema>,
) {
	const request = ArchitectureClaimTakeBackSchema.parse(input);
	return endClaim(vault, request.claim);
}
/**
 * Require ownership of every affected subject immediately before installation.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 */
function requireSubjectClaim(
	vault: string,
	request: Pick<ArchitectureModuleEdit, "claim" | "writer" | "target" | "subject">,
): void {
	const state = claimState(vault);
	if (state.revoked.includes(request.claim))
		throw new ArchiveError(
			"CLAIM_REVOKED",
			"The claim ended. Stop this intent and obtain a new claim before another write.",
			"model.json",
			[request.subject],
		);
	const claim = state.claims.find(
		(value) =>
			value.id === request.claim &&
			value.writer === request.writer &&
			Date.parse(value.until) > Date.now() &&
			isDeepStrictEqual(value.target, request.target),
	);
	if (claim === undefined || !claim.subjects.includes(request.subject))
		throw new ArchiveError(
			"CLAIM_REQUIRED",
			"Claim the affected module before writing its description.",
			"model.json",
			[request.subject],
		);
}
export {
	readArchitectureClaims,
	claimArchitectureSubjects,
	releaseArchitectureClaim,
	takeBackArchitectureClaim,
	requireSubjectClaim,
	requireTarget,
};

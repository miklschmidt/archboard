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
} from "#shared/schemas/model-operations.ts";
import { readCurrentModel } from "#runtime/operations/read/model-read.ts";
import { archiveFailure, historyResult } from "#runtime/operations/history/result.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import {
	ClaimsStateSchema,
	readState,
	writeState,
	withModelLock,
} from "#runtime/store/model-state.ts";
import type { z } from "zod";

/** Read the exact durable claims and revocations for this checkout. */
function claimState(vault: string) {
	return readState(vault, "claims.json", ClaimsStateSchema) ?? { claims: [], revoked: [] };
}
/** Read visible claims without acquiring the installation lease. */
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
/** Require the exact architectural state that the agent selected. */
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
/** Claim explicit module identities while leaving long agent work outside the installation lease. */
async function claimArchitectureSubjects(
	vault: string,
	input: ArchitectureClaimRequest,
): Promise<ArchitectureClaimResult> {
	const request = ArchitectureClaimRequestSchema.parse(input);
	const result = await historyResult("MODEL_WRITE_FAILED", () =>
		withModelLock(vault, () => {
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
			if (overlap !== undefined) {
				if (
					overlap.writer === request.writer &&
					isDeepStrictEqual(overlap.subjects, request.subjects) &&
					isDeepStrictEqual(overlap.target, request.target)
				)
					return { success: true as const, claim: overlap };
				throw new ArchiveError(
					"CLAIM_HELD",
					`Subjects are claimed by ${overlap.writer}. Wait for release or ask the reader to take the claim back.`,
					overlap.id,
				);
			}
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
/** Release the caller's claim, or record a reader's explicit take-back. */
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
/** Release one agent's standing scope. */
function releaseArchitectureClaim(
	vault: string,
	input: z.infer<typeof ArchitectureClaimReleaseSchema>,
) {
	const request = ArchitectureClaimReleaseSchema.parse(input);
	return endClaim(vault, request.claim, request.writer);
}
/** End a claim through the reader's explicit control. */
function takeBackArchitectureClaim(
	vault: string,
	input: z.infer<typeof ArchitectureClaimTakeBackSchema>,
) {
	const request = ArchitectureClaimTakeBackSchema.parse(input);
	return endClaim(vault, request.claim);
}
/** Require ownership of every affected subject immediately before installation. */
function requireSubjectClaim(
	vault: string,
	request: { claim: string; writer: string; target: ArchitectureClaim["target"]; subject: string },
): void {
	const state = claimState(vault);
	if (state.revoked.includes(request.claim))
		throw new ArchiveError(
			"CLAIM_REVOKED",
			"The claim ended. Stop this intent and obtain a new claim before another write.",
			request.subject,
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
			request.subject,
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

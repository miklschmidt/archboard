// The vocabulary every browser DTO schema shares: the bounds a snapshot may
// not exceed, the scalar schemas they are built from, and the refinement that
// refuses a value addressed to another child or an earlier epoch.

import { z } from "zod";

import { assertCurrentTarget } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext } from "@/shared/codex-browser-model/lib/scalars";
import type { ChildEpoch, ChildId } from "@/shared/codex-workbench-identity/index";

const TimestampSchema = z.number().int().nonnegative();
const DeliveryOutcomeSchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
/**
 * The most joined thread candidates one snapshot publishes. The list is bounded
 * here rather than trimmed by the snapshot fitter, which owns timeline and
 * voice-context history. The bound is chosen so a complete inventory still
 * fits beside a rich snapshot at the smallest budget a gateway may run with,
 * leaving those histories to trim; a longer list is published
 * truncated rather than crowding history out.
 */
const BROWSER_THREAD_CANDIDATE_LIMIT = 40;
/** Exact callback JSON is retained up to the callback encoder's wire contract. */
const BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES = 32_768;
const BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES = 8192;
const BROWSER_VOICE_CONTEXT_ENTRY_LIMIT = 64;
const BROWSER_PERMISSION_FILE_ACCESS = {
	deny: "deny",
	read: "read",
	write: "write",
} as const;

/**
 * Records a refusal from the identity validator as a validation issue.
 * @param context - The refinement context of the schema being checked.
 * @param error - What the validator threw.
 * @param path - Where in the value the issue sits.
 */
function addContextIssue(context: z.RefinementCtx, error: unknown, path: string[]): void {
	context.addIssue({
		code: "custom",
		path,
		message: error instanceof Error ? error.message : "identity is not current",
	});
}

/**
 * A `superRefine` callback that refuses a value whose child and epoch are not
 * the session's current ones, reporting at `epoch`.
 * @param context - The validator that knows the current child and epoch.
 * @returns The refinement to attach to a schema carrying `childId` and `epoch`.
 */
function refineCurrentTarget(
	context: IdentityContext,
): (value: { childId: ChildId; epoch: ChildEpoch }, refinementContext: z.RefinementCtx) => void {
	return (value, refinementContext) => {
		try {
			assertCurrentTarget(context.validator, value);
		} catch (error) {
			addContextIssue(refinementContext, error, ["epoch"]);
		}
	};
}

export {
	TimestampSchema,
	DeliveryOutcomeSchema,
	BROWSER_THREAD_CANDIDATE_LIMIT,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	BROWSER_PERMISSION_FILE_ACCESS,
	addContextIssue,
	refineCurrentTarget,
};

// The vocabulary every browser DTO schema shares: the bounds a snapshot may
// not exceed, the scalar schemas they are built from, and the refinement that
// refuses a value addressed to another child or an earlier epoch.

import { z } from "zod";

import { assertCurrentTarget } from "#shared/schemas/browser/scalars.ts";
import type { IdentityContext } from "#shared/schemas/browser/scalars.ts";
import type { ChildEpoch, ChildId } from "@archboard/codex-app-server/identity";

const TimestampSchema = z.number().int().nonnegative();
const DeliveryOutcomeSchema = z.enum(["delivered", "not_delivered", "outcome_unknown"]);
/**
 * What one timeline value may carry, in UTF-8 bytes or entries. The server
 * projection bounds each value to these before the schema checks them, so a
 * long command output or a sprawling patch is cut, never refused.
 */
const BROWSER_TIMELINE_LIMITS = Object.freeze({
	/** A prompt, an assistant message, reasoning, a plan item or a command line. */
	text: 16_384,
	/** A tool name, or the MCP server or dynamic namespace that owns it. */
	toolName: 256,
	/** A tool call's arguments, as compact JSON. */
	toolArguments: 1024,
	/** The tail of a command's aggregated output. */
	outputTail: 4096,
	/** A working directory or a changed file's path. */
	path: 1024,
	/** A web search query. */
	query: 1024,
	/** A tool or turn error message. */
	errorMessage: 2048,
	/** The additional details a failed turn carries. */
	errorDetails: 4096,
	/** How many changed files one file change item lists. */
	fileChanges: 64,
	/** A plan's explanation. */
	planExplanation: 2048,
	/** How many steps one plan lists. */
	planSteps: 64,
	/** One plan step. */
	planStep: 512,
});
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
	BROWSER_TIMELINE_LIMITS,
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	BROWSER_PERMISSION_FILE_ACCESS,
	addContextIssue,
	refineCurrentTarget,
};

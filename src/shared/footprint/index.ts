// The answer of a footprint, `archboard semantic footprint` and
// `GET /api/semantic-boards/footprint` (ADR 0045).
//
// A footprint reads the commits from the merge base of a named ref and HEAD up
// to HEAD, in each checkout, and says which parts of a board's current variant
// those commits changed through their bound files. With a proposal it sets
// that against the parts the proposal names, in three lists: named and
// changed, changed but not named, and named but not changed. A part the lens
// skipped is in none of the three lists, and it is listed with the reason, so
// a part that was not read never looks like a part that no commit changed.
//
// It is information: it carries no severity and changes no exit status. It is
// derived on request and never stored.

import { z } from "zod";
import { BehindCommitSchema, BehindPartSchema, BehindSkipSchema } from "@/shared/code-check/index";
import { SubjectStandingSchema } from "@/shared/semantic-board/index";

/** How the comparison marks a part, relationship or step that it names. */
const NamedStatusSchema = SubjectStandingSchema.exclude(["unchanged"]);

/** One end of a relationship or a step. */
const FootprintEndSchema = z.object({ id: z.string(), name: z.string() }).strict();

/**
 * Why a proposal names a part. A part the comparison marks is named for itself.
 * A part at either end of a relationship or a step that the comparison marks
 * is named for that relationship or step: its code changes at that end,
 * though the comparison does not badge it (ADR 0023). Both ends count,
 * because the direction of a relationship does not say which end's code
 * changes.
 */
const NamedReasonSchema = z.discriminatedUnion("by", [
	z.object({ by: z.literal("part"), status: NamedStatusSchema }).strict(),
	z
		.object({
			by: z.literal("relationship"),
			status: NamedStatusSchema,
			relationship: z.string(),
			from: FootprintEndSchema,
			to: FootprintEndSchema,
		})
		.strict(),
	z
		.object({
			by: z.literal("step"),
			status: NamedStatusSchema,
			step: z.string(),
			flow: z.string(),
			from: FootprintEndSchema,
			to: FootprintEndSchema,
		})
		.strict(),
]);

/**
 * One part the footprint read, and the commits of the answer's `commits` that
 * changed it, newest first: none for a part that nothing changed.
 */
const FootprintPartSchema = BehindPartSchema.extend({
	/** Why the proposal names it; none for a part it does not name. */
	named: z.array(NamedReasonSchema),
});

/** Why a checkout's range was not read. */
const UNREAD_REASONS = ["base-unresolved", "no-merge-base"] as const;

/**
 * Why a part was not read: one of behind's reasons, or the range of its
 * repository was not read.
 */
const FootprintSkipSchema = BehindSkipSchema.extend({
	reason: z.enum([...BehindSkipSchema.shape.reason.options, ...UNREAD_REASONS]),
	/** Why the proposal names it; a skipped part is never listed as changed or unchanged. */
	named: z.array(NamedReasonSchema),
});

/**
 * What one repository's checkout was read for: the commit the ref resolved to,
 * the merge base with HEAD, HEAD, and how many commits lie between. Or why it
 * was not read: the ref does not resolve there, or shares no history with HEAD.
 */
const FootprintRepositorySchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("read"),
			repo: z.string(),
			base: z.string(),
			mergeBase: z.string(),
			head: z.string(),
			/** The commits after the merge base up to HEAD, merges left out, whether or not they changed a part. */
			commits: z.int().nonnegative(),
		})
		.strict(),
	z
		.object({
			status: z.literal("unread"),
			repo: z.string(),
			reason: z.enum(UNREAD_REASONS),
			detail: z.string(),
		})
		.strict(),
]);

/** What every footprint says, whether or not a proposal was named. */
const footprintBase = {
	board: z.string(),
	version: z.int().nonnegative(),
	/** The ref as the caller named it. */
	base: z.string(),
	/** The current variant, which the commits are read against. */
	current: z.object({ id: z.string(), name: z.string() }).strict(),
	repositories: z.array(FootprintRepositorySchema),
	/** Every commit that changed a part it read, newest first. Large commits are kept and marked. */
	commits: z.array(BehindCommitSchema),
	skipped: z.array(FootprintSkipSchema),
};

/** A footprint with no proposal named: the parts the commits changed. */
const UnproposedFootprintSchema = z
	.object({ ...footprintBase, proposal: z.null(), changed: z.array(FootprintPartSchema) })
	.strict();

/** A footprint set against a proposal: the three lists of ADR 0045. */
const ProposedFootprintSchema = z
	.object({
		...footprintBase,
		proposal: z.object({ id: z.string(), name: z.string() }).strict(),
		namedAndChanged: z.array(FootprintPartSchema),
		changedNotNamed: z.array(FootprintPartSchema),
		namedNotChanged: z.array(FootprintPartSchema),
	})
	.strict();

/** One footprint. */
const FootprintAnswerSchema = z.union([UnproposedFootprintSchema, ProposedFootprintSchema]);

/** What the route answers and the command prints: the footprint beside the `success` every answer carries. */
const FootprintReplySchema = z.union([
	UnproposedFootprintSchema.extend({ success: z.literal(true) }),
	ProposedFootprintSchema.extend({ success: z.literal(true) }),
]);

type FootprintReply = z.infer<typeof FootprintReplySchema>;
type FootprintAnswer = z.infer<typeof FootprintAnswerSchema>;
type FootprintPart = z.infer<typeof FootprintPartSchema>;
type FootprintSkip = z.infer<typeof FootprintSkipSchema>;
type FootprintRepository = z.infer<typeof FootprintRepositorySchema>;
type NamedReason = z.infer<typeof NamedReasonSchema>;

export {
	FootprintAnswerSchema,
	type FootprintAnswer,
	FootprintReplySchema,
	type FootprintReply,
	FootprintPartSchema,
	type FootprintPart,
	FootprintRepositorySchema,
	type FootprintRepository,
	FootprintSkipSchema,
	type FootprintSkip,
	NamedReasonSchema,
	type NamedReason,
};

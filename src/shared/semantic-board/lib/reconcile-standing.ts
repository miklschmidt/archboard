// What a reconciliation IS, as a document holds it.
//
// Apart from `reconcile.ts` — which is how one is worked out — because the two
// change for different reasons and only one of them is a contract. An unsettled
// disagreement outlives the command that found it: it is written on the variant,
// read back after a restart, and shown to whoever opens the board (ADR 0023),
// so its shape is something the board's contract has to describe. The merge
// algorithm beside it can be rewritten without any of that moving.

import { z } from "zod";
import { VariantContentSchema } from "@/shared/semantic-board/lib/content";
import { SemanticIdSchema } from "@/shared/semantic-board/lib/primitives";

/** What kind of disagreement a reader has to settle. */
const ReconciliationKindSchema = z.enum([
	"competing-field",
	"competing-order",
	"deleted-and-changed",
	"reference-lost",
	"left-empty",
]);
type ReconciliationKind = z.infer<typeof ReconciliationKindSchema>;

/**
 * One thing a person has to decide before this proposal is coherent again.
 *
 * A schema rather than a bare type because an unsettled disagreement outlives
 * the command that found it: it is written on the variant, read back after a
 * restart, and shown to whoever opens the board (ADR 0023). Something a
 * document holds is something the document's contract has to describe.
 */
const ReconciliationIssueSchema = z
	.object({
		/** The subject it is about. */
		subject: SemanticIdSchema,
		/** What kind of subject that is, in the words a refusal uses. */
		what: z.string().min(1),
		/** What kind of disagreement it is. */
		kind: ReconciliationKindSchema,
		/** The field in dispute, for a disagreement about one. */
		field: z.string().min(1).optional(),
		/** What this proposal says, or a description of what it did. */
		mine: z.unknown(),
		/** What the variant it came from says now. */
		theirs: z.unknown(),
		/** What somebody has to do about it, in a sentence. */
		repair: z.string().min(1),
	})
	.strict();
type ReconciliationIssue = z.infer<typeof ReconciliationIssueSchema>;

/**
 * What a draft is waiting on, as the board records it.
 *
 * Held on the variant rather than worked out on every read, because it is a
 * fact about a moment: these two states disagreed when the predecessor moved,
 * and the disagreement stands until somebody settles it. Recomputing it later
 * would need the base — what the predecessor said when the two last agreed —
 * and that state is gone the instant the predecessor is written.
 */
const StandingShapeSchema = z
	.object({
		/** The variant whose change this one has not caught up with. */
		against: SemanticIdSchema,
		/** The board version the disagreement arose at. */
		atVersion: z.int().min(1),
		/**
		 * What the predecessor said when this draft last agreed with it.
		 *
		 * The third state a merge needs, and the only one that cannot be recovered
		 * from the board: the predecessor has moved on, and the draft is a whole
		 * architecture rather than a patch, so "what did this draft change" has no
		 * answer without it. It is kept only while something is unsettled — a
		 * draft that agrees with its predecessor has the predecessor itself as its
		 * base — and it does not advance while the disagreement stands, so
		 * everything the predecessor does in the meantime is still seen as the
		 * predecessor's doing when the draft finally catches up.
		 */
		base: VariantContentSchema,
		/**
		 * What somebody has to settle here. Empty for a draft that is only waiting
		 * on an ancestor: it has no disagreement of its own, because it has not
		 * been merged — and it will not be until the state it is derived from
		 * stops being in dispute.
		 */
		issues: z.array(ReconciliationIssueSchema),
		/**
		 * The ancestor that has to settle before this draft can move.
		 *
		 * Recorded rather than worked out on every read, because it is what this
		 * draft is actually waiting for: its content was deliberately not merged,
		 * and which decision it is waiting on is the whole of what a reader — or an
		 * adoption — needs to know about it.
		 */
		blockedBy: SemanticIdSchema.optional(),
	})
	.strict();

/** What it means for a standing to say anything at all. */
const SAYS_SOMETHING =
	"a variant waits on something it has to settle or on an ancestor; recording that it waits for nothing says nothing";

const VariantStandingSchema = StandingShapeSchema.refine(
	(standing) => standing.issues.length > 0 || standing.blockedBy !== undefined,
	SAYS_SOMETHING,
);
type VariantStanding = z.infer<typeof VariantStandingSchema>;

/**
 * The same standing as a reader is told it: everything except the state it was
 * measured from.
 *
 * That retained base is the store's own machinery — a second whole copy of the
 * architecture, kept so a later merge has something to compare against — and a
 * reader needs none of it. Sending it would put the board on the wire twice to
 * answer two sentences, and would make a mechanism somebody has to keep working
 * into a field somebody could start depending on.
 */
const ToldStandingSchema = StandingShapeSchema.omit({ base: true }).refine(
	(standing) => standing.issues.length > 0 || standing.blockedBy !== undefined,
	SAYS_SOMETHING,
);
type ToldStanding = z.infer<typeof ToldStandingSchema>;

export {
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	StandingShapeSchema,
	ToldStandingSchema,
	VariantStandingSchema,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ToldStanding,
	type VariantStanding,
};

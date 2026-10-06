// The answer of `archboard semantic locality` and
// `GET /api/semantic-boards/locality` (ADR 0045).
//
// Locality is where change concentrates in a board's code. The answer reads
// one variant of one board over a period, through the files its parts bind.
// `hotspots` ranks every part the lens read by the commits of the period that
// changed its bound files. `coupling` lists the pairs of those parts that
// change together, and marks the pairs that nothing on the board joins. Both
// read the same walk, the same `commits` and the same `leftOut`.
//
// Both readings leave out large commits and say how many (`leftOut`), and both
// say which parts they did not read and why (`skipped`), so a part that was not
// read never looks like a part that no commit changed. Nothing in the answer
// is stored in a board.

import { z } from "zod";
import { BehindCommitSchema, BehindPartSchema, BehindSkipSchema } from "@/shared/code-check/index";
import { RenderedVariantSchema } from "@/shared/semantic-board/index";

/**
 * The start of a period: a date, or a date and time with its offset. A date
 * alone is midnight UTC.
 */
const PeriodStartSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/**
 * One commit a hotspot lists. A large commit is never here, so there is no
 * field that says so.
 */
const LocalityCommitSchema = BehindCommitSchema.omit({ large: true });

/**
 * The period read in one repository: the commits on the HEAD of its checkout
 * that were committed from `since` up to the commit time of HEAD (ADR 0045).
 * It ends at HEAD and not at the clock, so one HEAD always gives one answer.
 */
const LocalityPeriodSchema = z
	.object({
		repo: z.string(),
		/** The commit the checkout has out, which the period ends at. */
		head: z.string(),
		since: z.iso.datetime(),
		until: z.iso.datetime(),
	})
	.strict();

/**
 * One part the lens read, and the commits of the period that changed its bound
 * files. Parts that bind the same files list the same commits.
 */
const HotspotSchema = BehindPartSchema.extend({
	/** How many commits: the length of `commits`. Parts are ranked by it. */
	count: z.int().nonnegative(),
});

/**
 * Two parts that changed together in enough commits of the period to pass
 * code-maat's filters, which are fixed: at least 5 shared commits, and a
 * degree of at least 30% (ADR 0045). Only parts bound into one repository can
 * pair, and a pair whose bound paths overlap is left out, because each of its
 * shared commits is one change counted twice.
 */
const CoupledPairSchema = z
	.object({
		/** The two parts, in the variant's order. */
		subjects: z.tuple([BehindPartSchema.shape.subject, BehindPartSchema.shape.subject]),
		repo: z.string(),
		/** The commits of `commits` that changed both parts, newest first. */
		commits: z.array(z.string()),
		/** How many commits the two share: the length of `commits`. */
		shared: z.int().positive(),
		/**
		 * The shared commits over the mean of the two parts' own counts, in
		 * whole percent, cut as code-maat prints it. Each part's count is its
		 * hotspot's `count`.
		 */
		degree: z.int().min(0).max(100),
		/**
		 * No relationship or flow step of the variant joins the two parts, in
		 * either direction, and neither part is inside the other. A part inside
		 * an end counts as at that end, and so does a container that holds the
		 * end (ADR 0045 as amended). An unjoined pair asks
		 * whether the board misses a dependency, or whether two parts carry one
		 * decision.
		 */
		unjoined: z.boolean(),
	})
	.strict();

/** What the answer says it left out of every reading. */
const LeftOutSchema = z
	.object({
		/**
		 * Commits of more than 30 files that changed a bound file of a part the
		 * lens read. They make unrelated parts look coupled, so no reading counts
		 * them (ADR 0045).
		 */
		largeCommits: z.int().nonnegative(),
	})
	.strict();

/** What `semantic locality` says about one variant of one board. */
const LocalityAnswerSchema = z
	.object({
		board: z.string(),
		/** The board's version the reading was made at. */
		version: z.int().nonnegative(),
		/** The variant read: the current one, or the draft that was named. */
		variant: RenderedVariantSchema,
		/** One for each repository a part was read in. */
		periods: z.array(LocalityPeriodSchema),
		/** Every commit that a hotspot lists, newest first, listed once. */
		commits: z.array(LocalityCommitSchema),
		/**
		 * Every part the lens read, most commits first. Parts with as many
		 * commits keep the order of the variant. A part that no commit changed
		 * in the period is here with a count of 0.
		 */
		hotspots: z.array(HotspotSchema),
		/**
		 * The coupled pairs among the parts in `hotspots`, highest degree first,
		 * then most shared commits, then in the variant's order.
		 */
		coupling: z.array(CoupledPairSchema),
		leftOut: LeftOutSchema,
		/** Every part the lens did not read, with the reason. It is in no count. */
		skipped: z.array(BehindSkipSchema),
	})
	.strict();

/**
 * What the route sends: the answer beside the `success` that every route
 * carries, and what the command prints.
 */
const LocalityReplySchema = LocalityAnswerSchema.extend({ success: z.literal(true) });

type LocalityAnswer = z.infer<typeof LocalityAnswerSchema>;
type LocalityReply = z.infer<typeof LocalityReplySchema>;
type LocalityCommit = z.infer<typeof LocalityCommitSchema>;
type LocalityPeriod = z.infer<typeof LocalityPeriodSchema>;
type Hotspot = z.infer<typeof HotspotSchema>;
type CoupledPair = z.infer<typeof CoupledPairSchema>;

export {
	CoupledPairSchema,
	type CoupledPair,
	HotspotSchema,
	type Hotspot,
	LeftOutSchema,
	LocalityAnswerSchema,
	type LocalityAnswer,
	LocalityCommitSchema,
	type LocalityCommit,
	LocalityPeriodSchema,
	type LocalityPeriod,
	LocalityReplySchema,
	type LocalityReply,
	PeriodStartSchema,
};

// One board, one file, one version.
//
// ADR 0023 asks for a board's whole branching family — every variant, its
// ancestry, and which one is current — to live in a single versioned document,
// so that a change to a parent and its consequences for the children are one
// write or no write at all. This is the shape of that document.
//
// `current` is a designation, not an identity. A variant keeps its name for
// life; the designation moves to whichever variant describes the architecture
// that is actually implemented. That is why the board names the current
// variant by id rather than storing a variant called "current".
//
// The version is archboard's own edit counter for the aggregate, in the same
// spirit as the note's frontmatter counter (board-version.ts) and for the same
// purpose: it orders archboard's own writes so a writer working from a stale
// read is refused rather than silently overwriting somebody. It advances
// exactly once per accepted write, and the write boundary in
// `src/runtime/semantic-board-store` is the only thing that may advance it.

import { z } from "zod";
import {
	DescriptionSchema,
	DisplayNameSchema,
	SemanticIdSchema,
} from "@/shared/semantic-board/lib/primitives";
import { VariantContentSchema } from "@/shared/semantic-board/lib/content";
import { VariantStandingSchema } from "@/shared/semantic-board/lib/reconcile";
import { VariantLifecycleSchema } from "@/shared/semantic-board/lib/vocabulary";

/**
 * The contract version of the document itself. A reader that does not
 * implement a version says so instead of guessing at the fields it knows.
 */
const SEMANTIC_BOARD_SCHEMA_VERSION = "1.0.0";

/**
 * The major version this build implements. A document whose major differs is
 * refused rather than read: a major change is one that moves or reinterprets a
 * field, and a reader that guesses at one of those does not fail, it draws
 * something wrong. A later minor is accepted because the schema is strict —
 * anything genuinely new in it arrives as a field this build does not know,
 * and that is already refused.
 */
const SUPPORTED_SCHEMA_MAJOR = Number(SEMANTIC_BOARD_SCHEMA_VERSION.split(".")[0]);

/** The first version number a freshly created board carries. */
const FIRST_BOARD_VERSION = 1;

const SemanticVersionFieldSchema = z
	.string()
	.regex(/^\d+\.\d+\.\d+$/u, "must be a semver string, for example 1.0.0");

const TimestampSchema = z.iso.datetime();

/**
 * One architectural state.
 *
 * `parent` is the variant this one was derived from — its actual predecessor,
 * which is what a proposal's changes are measured against. It is absent only
 * on the root of the family. Branching, reconciliation and adoption are later
 * work; what this shape settles now is that they have somewhere to live and
 * that ancestry is single-parent.
 */
const SemanticVariantSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		lifecycle: VariantLifecycleSchema,
		parent: SemanticIdSchema.optional(),
		summary: DescriptionSchema.optional(),
		content: VariantContentSchema,
		/**
		 * What this variant is waiting on, when its predecessor has moved under it
		 * and somebody has to say what that means here. Absent is the ordinary
		 * case: a variant that agrees with where it came from, or came from
		 * nothing.
		 */
		reconciliation: VariantStandingSchema.optional(),
	})
	.strict();
type SemanticVariant = z.infer<typeof SemanticVariantSchema>;

/**
 * One time the designation moved.
 *
 * Which architecture was implemented, and when it stopped being, is the record
 * a board exists to keep: "we moved to the queued ingest in September, off the
 * synchronous one" is the sentence somebody needs two years later, and neither
 * end of it can be recovered from the variants alone once the designation has
 * moved twice. So each move is written down as it happens.
 *
 * By identity, not by name, because a name is a label on a state and this is a
 * record of states. It is append-only in practice: nothing in the contract
 * rewrites an entry, because nothing can un-happen a decision that was made.
 */
const AdoptionSchema = z
	.object({
		/** The variant that became current. */
		variant: SemanticIdSchema,
		/** The variant it took the designation from, absent for the first one. */
		from: SemanticIdSchema.optional(),
		/** When it happened. */
		at: TimestampSchema,
		/** Why, when whoever adopted it said so. */
		reason: DescriptionSchema.optional(),
	})
	.strict();
type Adoption = z.infer<typeof AdoptionSchema>;

/**
 * A whole board as it sits on disk.
 *
 * The shape alone does not make a document coherent — an edge can name a node
 * that is not there, and a containment chain can close on itself. Those are
 * checked by `checkSemanticBoard`, which runs on everything read and on every
 * candidate before it is written.
 */
const SemanticBoardSchema = z
	.object({
		schemaVersion: SemanticVersionFieldSchema,
		kind: z.literal("semantic-board"),
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		version: z.int().min(FIRST_BOARD_VERSION),
		createdAt: TimestampSchema,
		updatedAt: TimestampSchema,
		variants: z.array(SemanticVariantSchema).min(1),
		current: SemanticIdSchema,
		/**
		 * Every time the designation moved, oldest first. Absent on a board where
		 * it never has: the first variant of a board was never adopted over
		 * anything, and recording that it "became current" at creation would be
		 * inventing a decision nobody made.
		 */
		adoptions: z.array(AdoptionSchema).optional(),
	})
	.strict();
type SemanticBoard = z.infer<typeof SemanticBoardSchema>;

/**
 * The version a board will carry once the write in flight lands.
 *
 * One owner, because two places need to agree about it and they are not next to
 * each other: a transition records it in whatever it writes down about this
 * moment, and the write boundary stamps it on the document. Two `+ 1`s in
 * different files are two things that can drift apart by one.
 * @param board The board as it stands, or null before there is one.
 * @returns The version the write in flight will produce.
 */
function nextVersion(board: SemanticBoard | null): number {
	return (board?.version ?? 0) + 1;
}

/**
 * The variant a board's `current` designation names.
 * @param board The board.
 * @returns The current variant, or undefined when the designation dangles.
 */
function currentVariant(board: SemanticBoard): SemanticVariant | undefined {
	return board.variants.find((variant) => variant.id === board.current);
}

/**
 * The word that asks for whichever variant is currently designated, rather than
 * for a variant by name.
 *
 * It is a selector and never a name. A variant keeps the name it was given for
 * life, and the designation moves off it when something else is adopted; a
 * state still called `current` years after it stopped being current would make
 * the record of what was implemented unreadable. So the contract refuses the
 * name and reserves the word for the question "which one is it now?".
 */
const CURRENT_DESIGNATION = "current";

/**
 * Whether a word is the designation selector rather than a name.
 * @param asked The word asked for.
 * @returns True when it asks for whichever variant is designated current.
 */
function asksForDesignation(asked: string): boolean {
	return asked.trim().toLowerCase() === CURRENT_DESIGNATION;
}

/**
 * The variant a name or id selects, matched by id first and then by name.
 * This is the lookup by identity; `resolveVariant` is what an address goes
 * through, because an address may also ask for the designation.
 * @param board The board.
 * @param asked The id or name asked for.
 * @returns The variant, or undefined when nothing answers to it.
 */
function findVariant(board: SemanticBoard, asked: string): SemanticVariant | undefined {
	return (
		board.variants.find((variant) => variant.id === asked) ??
		board.variants.find((variant) => variant.name === asked)
	);
}

/**
 * The variant an address asks for: the designated one when it says `current`,
 * and otherwise the one with that id or lasting name.
 *
 * The two stay distinguishable on purpose. Asking for `current` is asking a
 * question whose answer moves; asking for a name is asking for one particular
 * architectural state, and it keeps answering after the designation has gone
 * somewhere else.
 * @param board The board.
 * @param asked The address, or undefined to ask for the designation.
 * @returns The variant, or undefined when nothing answers to it.
 */
function resolveVariant(board: SemanticBoard, asked?: string): SemanticVariant | undefined {
	if (asked === undefined || asked === "" || asksForDesignation(asked)) {
		return currentVariant(board);
	}
	return findVariant(board, asked);
}

export {
	AdoptionSchema,
	type Adoption,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SUPPORTED_SCHEMA_MAJOR,
	FIRST_BOARD_VERSION,
	SemanticVariantSchema,
	type SemanticVariant,
	SemanticBoardSchema,
	type SemanticBoard,
	currentVariant,
	nextVersion,
	findVariant,
	resolveVariant,
	CURRENT_DESIGNATION,
	asksForDesignation,
};

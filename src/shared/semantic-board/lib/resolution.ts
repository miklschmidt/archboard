// Saying which side of a disagreement a proposal takes.
//
// Reconciliation holds what it cannot decide; this is where a person decides
// it. Every choice names the disagreement it answers — the subject, the field,
// and which side — so that a resolution written against what somebody read is
// refused rather than misapplied if the disagreement has moved since. Nothing
// here guesses: an issue nobody answered stays open, and a proposal with
// anything open is still a proposal that needs attention.
//
// The choice is deliberately between the two states that exist. "Mine" keeps
// what the proposal already said and drops the issue; "theirs" takes the value
// the predecessor has now. Anything else — a third answer nobody has written
// yet — is an ordinary edit to the proposal, through the ordinary edit path,
// because that is what writing an architecture is.

import { z } from "zod";
import { SemanticIdSchema } from "@/shared/semantic-board/lib/primitives";

/** Which side of one disagreement a proposal takes. */
const SideSchema = z.enum(["mine", "theirs"]);
type Side = z.infer<typeof SideSchema>;

/**
 * One answer to one disagreement.
 *
 * The subject and field identify it exactly as the issue reports them, so a
 * caller answers what it was shown. An answer that matches nothing standing is
 * refused: it means the caller is working from a reading of the board that has
 * moved, and applying the rest of its answers would be applying half a decision.
 */
const ChoiceSchema = z
	.object({
		subject: SemanticIdSchema,
		field: z.string().min(1).optional(),
		side: SideSchema,
	})
	.strict();
type Choice = z.infer<typeof ChoiceSchema>;

/**
 * A resolution as an agent or a person states it.
 *
 * Partial by design. Somebody settling a long-standing disagreement one
 * decision at a time is doing the normal thing, and each settled decision is
 * worth writing down; what is left stays open and says so.
 */
const ResolutionInputSchema = z
	.object({
		/** The proposal being settled; the variant the board's bare name opens when absent. */
		variant: z.string().trim().min(1).optional(),
		/** What it decides. */
		choices: z.array(ChoiceSchema).min(1),
	})
	.strict();
type ResolutionInput = z.infer<typeof ResolutionInputSchema>;

/**
 * An adoption as it is asked for: which variant, and why.
 *
 * The reason is optional and is kept for good: it is the only part of the
 * record that says why the architecture changed, and a year later it is the
 * part somebody is actually looking for.
 */
const BoardAdoptInputSchema = z
	.object({
		variant: z.string().trim().min(1),
		reason: z.string().trim().min(1).max(280).optional(),
	})
	.strict();
type BoardAdoptInput = z.infer<typeof BoardAdoptInputSchema>;

/**
 * A shelving as it is asked for: which proposal, and why it was let go.
 *
 * The reason is required, unlike an adoption's. An adoption is legible without
 * one — the board afterwards says which architecture is implemented — but a
 * proposal that simply stops says nothing about whether it was tried, refused,
 * overtaken or forgotten, and that is the whole of what shelving preserves.
 */
const BoardShelveInputSchema = z
	.object({
		variant: z.string().trim().min(1),
		reason: z.string().trim().min(1).max(280),
	})
	.strict();
type BoardShelveInput = z.infer<typeof BoardShelveInputSchema>;

export {
	BoardAdoptInputSchema,
	type BoardAdoptInput,
	BoardShelveInputSchema,
	type BoardShelveInput,
	ChoiceSchema,
	type Choice,
	ResolutionInputSchema,
	type ResolutionInput,
	SideSchema,
	type Side,
};

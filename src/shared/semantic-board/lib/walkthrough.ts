// The explanation a variant gives of itself.
//
// A walkthrough is what somebody says while showing the architecture to a room:
// a named, ordered sequence of beats, each of which says something in prose and
// names the parts of the variant it is saying it about. It is what a
// scroll-driven presentation steps through, and it is the thing that has to
// stay honest when the architecture it explains is edited underneath it.
//
// ADR 0023's line runs straight through this file. A beat says what it is about
// and what it says. It does not say how long to linger on it, where to put the
// camera, what to fade, how fast, or how far down the page it sits — every one
// of those belongs to the viewer, and a beat that carried one would be the
// board telling the renderer how to look, which is the thing the whole contract
// exists to stop. There is no field here an author could spend on one, in any
// spelling, and there is no cap on how many beats an explanation has or how
// many subjects a beat names: a long explanation of a large system is a thing
// people legitimately have, and the viewer scrolls.
//
// Order is array position, exactly as it is for a flow's steps and for the same
// reason: a written beat number would be a second opinion about the order, and
// a document that carries two opinions eventually carries two different ones.
//
// Identity is what `id` is for. A beat keeps the id it was minted under when it
// is reworded, when it is moved earlier in the narrative, and when it is
// carried into a proposal. That is what lets one explanation be compared across
// two variants at all, and what lets a later reconciliation say "this beat is
// about a node that is no longer there" instead of "the narrative was
// replaced". Ids come from the one minting site and are never rewritten.

import { z } from "zod";
import {
	DescriptionSchema,
	DisplayNameSchema,
	SemanticIdSchema,
} from "@/shared/semantic-board/lib/primitives";

/**
 * One moment of an explanation: what it says, and what it is about.
 *
 * `heading` is spelled as a display name because that is what it is — one line
 * a person reads, in a rail beside the diagram — and `body` is the prose, which
 * is the point of the beat existing at all. Both are required: a beat is a
 * thing somebody says, and a beat that says nothing is a gap in the
 * explanation rather than a beat.
 *
 * `subjects` are the parts of the variant this beat is about — nodes,
 * relationships, flows, steps — and a beat may name none. An opening beat is
 * about the whole picture, and forcing it to single something out would make it
 * say something its author did not mean. Which of them the highlight actually
 * looks like is the viewer's.
 *
 * `view` is which reading of the variant this beat is told through, and it is
 * meaning rather than staging: "now follow one request end to end" is a claim
 * about what the audience should be looking at, not a camera move. A beat that
 * names none is told through whatever the presentation is already showing.
 */
const WalkthroughBeatSchema = z
	.object({
		id: SemanticIdSchema,
		heading: DisplayNameSchema,
		body: DescriptionSchema,
		subjects: z.array(SemanticIdSchema).default([]),
		view: SemanticIdSchema.optional(),
	})
	.strict();
type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/**
 * One named, ordered explanation of this variant.
 *
 * A variant may hold several: the same architecture explained to a board and
 * explained to the people who have to build it are two explanations, not one
 * with a mode. Each is addressed by name, the way a flow and a view are, so two
 * of one name is refused by the coherence rules.
 *
 * `beats` is deliberately allowed to be empty by the shape and refused by the
 * coherence rules. An explanation with nothing in it is incoherent either way;
 * the difference is what a caller is told. A shape error says a document was
 * malformed at a path; a coherence issue says which walkthrough has nothing to
 * say, which is what an agent that just removed the last beat needs to hear.
 */
const SemanticWalkthroughSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		summary: DescriptionSchema.optional(),
		beats: z.array(WalkthroughBeatSchema).default([]),
	})
	.strict();
type SemanticWalkthrough = z.infer<typeof SemanticWalkthroughSchema>;

export {
	WalkthroughBeatSchema,
	type WalkthroughBeat,
	SemanticWalkthroughSchema,
	type SemanticWalkthrough,
};

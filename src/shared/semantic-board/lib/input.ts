// What an agent is allowed to say, as opposed to what a board holds.
//
// ADR 0015's rule outlives the drawing engine: there is one converter, on the
// way in, and nothing on the way out. An agent writes what it means in the
// most convenient spelling — a node with no id yet, an edge between two names
// — and the write boundary spends that spelling once, minting the identity and
// resolving the reference. What lands in the document is always the resolved
// form, so nothing downstream has to know that a shorter spelling exists.
//
// The convenience is deliberate and narrow. An agent may leave out an id,
// because ids are minted here and an agent that invented one would be minting
// them somewhere else. An agent may name an endpoint, because it has just
// written that name and does not yet know what id it was given. An agent may
// not leave out a name, a kind, or anything else that carries meaning.

import { z } from "zod";
import {
	DrillDownSchema,
	EdgeLabelSchema,
	EdgeTrafficSchema,
} from "@/shared/semantic-board/lib/content";
import {
	DescriptionSchema,
	DisplayNameSchema,
	GroupLabelSchema,
	ResponsibilitySchema,
	SemanticIdSchema,
} from "@/shared/semantic-board/lib/primitives";
import { StepLabelSchema } from "@/shared/semantic-board/lib/views";
import {
	DiagramGrammarSchema,
	EdgeEmphasisSchema,
	EdgeKindSchema,
	MessageKindSchema,
	NodeKindSchema,
} from "@/shared/semantic-board/lib/vocabulary";
import { CodeBindingSchema } from "@/shared/code-target/index";
import { SemanticBoardLevelSchema } from "@/shared/semantic-board/lib/aggregate";

/**
 * A reference to a node: its id, or the name it was written under. Which one
 * it is, is decided at the write boundary against the board's own nodes.
 */
const NodeReferenceSchema = z.string().trim().min(1);

const MAX_HANDLE = 60;

/**
 * A handle: a name for this one command only.
 *
 * It is the third spelling of a reference, and it exists for the two kinds that
 * have no other. A relationship and a step have no name, and their ids are
 * minted at the write boundary, so before handles there was no way to write one
 * command that creates a relationship and the walkthrough beat that explains
 * it. An agent may now write `as` on the entry that creates a thing and then
 * refer to that word anywhere else in the same command.
 *
 * A handle is spent at the boundary like every other input spelling and is
 * never persisted: the board holds the id, and nothing downstream can tell that
 * a write used one. It is spelled on the entry that creates the subject rather
 * than on the entry that refers to it, so an agent never has to invent an
 * identity — a stated id that names nothing on the board stays refused.
 */
const HandleSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_HANDLE)
	.refine((value) => !value.includes("\n"), "must be a single line");

/**
 * A node as an agent states it. `id` names an existing node to replace; when
 * it is absent the node is matched by name, and minted when no name matches.
 */
const SemanticNodeInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		as: HandleSchema.optional(),
		name: DisplayNameSchema,
		kind: NodeKindSchema,
		responsibility: ResponsibilitySchema.optional(),
		description: DescriptionSchema.optional(),
		parent: NodeReferenceSchema.optional(),
		// A label, not a reference: a group is not a thing on the board that could
		// be named or identified, which is exactly why it needs no registry.
		group: GroupLabelSchema.optional(),
		binding: CodeBindingSchema.optional(),
		// Stated in full or not at all. A shorter spelling — the target board's
		// name on its own — would have to mean "whatever is current there", and
		// that is the silent fallback ADR 0023 refuses.
		drillDown: DrillDownSchema.optional(),
	})
	.strict();
type SemanticNodeInput = z.infer<typeof SemanticNodeInputSchema>;

/** An edge as an agent states it, with its endpoints named or identified. */
const SemanticEdgeInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		as: HandleSchema.optional(),
		from: NodeReferenceSchema,
		to: NodeReferenceSchema,
		kind: EdgeKindSchema,
		label: EdgeLabelSchema.optional(),
		description: DescriptionSchema.optional(),
		emphasis: EdgeEmphasisSchema.optional(),
		traffic: EdgeTrafficSchema.optional(),
	})
	.strict();
type SemanticEdgeInput = z.infer<typeof SemanticEdgeInputSchema>;

/** One step of a flow as an agent states it, with its ends named or identified. */
const FlowStepInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		as: HandleSchema.optional(),
		from: NodeReferenceSchema,
		to: NodeReferenceSchema,
		label: StepLabelSchema,
		kind: MessageKindSchema.optional(),
		note: DescriptionSchema.optional(),
		repeat: z.int().min(2).optional(),
	})
	.strict();
type FlowStepInput = z.infer<typeof FlowStepInputSchema>;

/** A flow as an agent states it: its columns and its steps, in order. */
const SemanticFlowInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		as: HandleSchema.optional(),
		name: DisplayNameSchema,
		summary: DescriptionSchema.optional(),
		participants: z.array(NodeReferenceSchema).min(1),
		steps: z.array(FlowStepInputSchema).min(1),
	})
	.strict();
type SemanticFlowInput = z.infer<typeof SemanticFlowInputSchema>;

/**
 * What a stated view selects. Every entry is a reference, resolved the same way
 * an endpoint is: a node or flow may be named, and an edge, which has no name,
 * is identified.
 */
const ViewScopeInputSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("all") }).strict(),
	z
		.object({
			kind: z.literal("selection"),
			nodes: z.array(NodeReferenceSchema).default([]),
			edges: z.array(NodeReferenceSchema).default([]),
			flows: z.array(NodeReferenceSchema).default([]),
		})
		.strict(),
]);
type ViewScopeInput = z.infer<typeof ViewScopeInputSchema>;

/**
 * One beat of a walkthrough as an agent states it.
 *
 * `subjects` is where the shorter spelling earns its place twice over: an agent
 * explaining what it has just written knows the gateway by the name it gave it,
 * not by the identity the boundary minted for it. A relationship and a step have
 * no name, so those are identified; either way the board holds the resolved id,
 * and a reference that names nothing is refused rather than quietly dropped.
 */
const WalkthroughBeatInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		heading: DisplayNameSchema,
		body: DescriptionSchema,
		subjects: z.array(NodeReferenceSchema).default([]),
		view: NodeReferenceSchema.optional(),
	})
	.strict();
type WalkthroughBeatInput = z.infer<typeof WalkthroughBeatInputSchema>;

/** A walkthrough as an agent states it: its name, and its beats in order. */
const SemanticWalkthroughInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		name: DisplayNameSchema,
		summary: DescriptionSchema.optional(),
		beats: z.array(WalkthroughBeatInputSchema).default([]),
	})
	.strict();
type SemanticWalkthroughInput = z.infer<typeof SemanticWalkthroughInputSchema>;

/** A view as an agent states it. */
const SemanticViewInputSchema = z
	.object({
		id: SemanticIdSchema.optional(),
		name: DisplayNameSchema,
		grammar: DiagramGrammarSchema,
		summary: DescriptionSchema.optional(),
		scope: ViewScopeInputSchema.optional(),
	})
	.strict();
type SemanticViewInput = z.infer<typeof SemanticViewInputSchema>;

/**
 * One edit. Everything in it lands in one write or none of it does, which is
 * the whole reason the shape is a batch rather than a single change: one thing
 * somebody asked for is one write (TASK-068).
 */
const VariantEditInputSchema = z
	.object({
		/** Board metadata: omit to preserve it, or state a configured value to change it. */
		level: SemanticBoardLevelSchema.optional(),
		variant: NodeReferenceSchema.optional(),
		nodes: z.array(SemanticNodeInputSchema).default([]),
		edges: z.array(SemanticEdgeInputSchema).default([]),
		flows: z.array(SemanticFlowInputSchema).default([]),
		/** Board-owned views, independent of the selected variant. */
		views: z.array(SemanticViewInputSchema).default([]),
		walkthroughs: z.array(SemanticWalkthroughInputSchema).default([]),
		removeNodes: z.array(NodeReferenceSchema).default([]),
		removeEdges: z.array(NodeReferenceSchema).default([]),
		removeFlows: z.array(NodeReferenceSchema).default([]),
		/** Removing a shared view must leave every variant walkthrough coherent. */
		removeViews: z.array(NodeReferenceSchema).default([]),
		removeWalkthroughs: z.array(NodeReferenceSchema).default([]),
	})
	.strict();
type VariantEditInput = z.infer<typeof VariantEditInputSchema>;

/**
 * A proposal as it is asked for: a name of its own, and the variant it is
 * derived from.
 *
 * There is nothing about content here. A branch carries its predecessor's
 * architecture over whole, identities and all, because that is what makes the
 * two comparable; what the proposal actually proposes is said afterwards, as
 * ordinary edits to it.
 */
const BoardBranchInputSchema = z
	.object({
		from: NodeReferenceSchema,
		name: DisplayNameSchema,
		summary: DescriptionSchema.optional(),
	})
	.strict();
type BoardBranchInput = z.infer<typeof BoardBranchInputSchema>;

/**
 * A board as it is asked for. A board with nothing on it is a valid thing to
 * ask for: architecture is built up, and refusing an empty board would mean
 * the first request had to invent something to say.
 */
const BoardCreateInputSchema = z
	.object({
		name: DisplayNameSchema,
		level: SemanticBoardLevelSchema,
		variant: DisplayNameSchema.optional(),
		summary: DescriptionSchema.optional(),
		nodes: z.array(SemanticNodeInputSchema).default([]),
		edges: z.array(SemanticEdgeInputSchema).default([]),
		flows: z.array(SemanticFlowInputSchema).default([]),
		views: z.array(SemanticViewInputSchema).default([]),
		walkthroughs: z.array(SemanticWalkthroughInputSchema).default([]),
	})
	.strict();
type BoardCreateInput = z.infer<typeof BoardCreateInputSchema>;

export {
	BoardBranchInputSchema,
	type BoardBranchInput,
	FlowStepInputSchema,
	type FlowStepInput,
	SemanticFlowInputSchema,
	type SemanticFlowInput,
	ViewScopeInputSchema,
	type ViewScopeInput,
	SemanticViewInputSchema,
	type SemanticViewInput,
	WalkthroughBeatInputSchema,
	type WalkthroughBeatInput,
	SemanticWalkthroughInputSchema,
	type SemanticWalkthroughInput,
	NodeReferenceSchema,
	SemanticNodeInputSchema,
	type SemanticNodeInput,
	SemanticEdgeInputSchema,
	type SemanticEdgeInput,
	VariantEditInputSchema,
	type VariantEditInput,
	BoardCreateInputSchema,
	type BoardCreateInput,
};

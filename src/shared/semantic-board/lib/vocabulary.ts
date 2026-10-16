// The words a semantic board is written in, and nothing else.
//
// ADR 0023 draws one line: an agent says what a thing *is* and how it relates
// to its neighbours, and the renderer decides where it goes and what it looks
// like. So every value in this file is a meaning — a kind, a relationship, a
// lifecycle — and none of them is a coordinate, a colour, a font or a route.
// A field an agent could use to move a box would move that line, so there is
// no such field, in any spelling.
//
// Node and relationship kinds are references into the consumer-authored vault
// policy. Structural parsing preserves removed definitions; the store enforces
// membership for newly authored references when configuration is valid.

import { z } from "zod";
import { VocabularyNameSchema } from "@/shared/semantic-policy/index";

/**
 * What an architectural node is, named by the vault vocabulary.
 */
const NodeKindSchema = VocabularyNameSchema;
type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * How one node reaches another.
 */
const EdgeKindSchema = VocabularyNameSchema;
type EdgeKind = z.infer<typeof EdgeKindSchema>;

/**
 * How much of the reader's attention a relationship is asking for. This is
 * presentation *intent* rather than presentation: the renderer decides what
 * "hero" looks like, and an author who marks everything a hero has marked
 * nothing.
 */
const EdgeEmphasisSchema = z.enum(["normal", "hero", "muted"]);
type EdgeEmphasis = z.infer<typeof EdgeEmphasisSchema>;

/**
 * The grammars a variant can be drawn in.
 *
 * Each reads what the variant already says, and none adds a way of saying
 * something: architecture shows what the parts are and how they are wired;
 * sequence shows a flow as an ordered exchange between their columns, a
 * decision as labelled alternative frames and a loop as a loop frame; and
 * flowchart shows the logic of the same flow, its steps as boxes and its
 * decisions as diamonds with labelled branches (ADR 0053).
 *
 * `sequence` was called `data-flow` until schema 2.5.0, which renames every
 * stored view. A write that still names it is told the new name.
 */
const DiagramGrammarSchema = z.enum(["architecture", "sequence", "flowchart"], {
	/**
	 * Why a grammar is refused, naming the new name of the old one.
	 * @param issue What was refused.
	 * @returns The reason.
	 */
	error: (issue) =>
		issue.input === "data-flow"
			? 'the grammar "data-flow" is now called "sequence"'
			: 'a grammar is "architecture", "sequence" or "flowchart"',
});
type DiagramGrammar = z.infer<typeof DiagramGrammarSchema>;

/**
 * What one message in a flow does. `async` is sent and not waited for,
 * `return` carries an answer back, and `self` never leaves its sender.
 */
const MessageKindSchema = z.enum(["sync", "async", "return", "self"]);
type MessageKind = z.infer<typeof MessageKindSchema>;

/**
 * Where a variant stands. `current` is the architecture that is implemented,
 * `draft` a proposal, `historical` an architecture that was once current,
 * `shelved` a proposal nobody intends to carry out, kept under its name so the
 * thinking and every link into it survive. The designation moves; the variant's
 * name never does (ADR 0023, ADR 0030).
 */
const VariantLifecycleSchema = z.enum(["current", "draft", "historical", "shelved"]);
type VariantLifecycle = z.infer<typeof VariantLifecycleSchema>;

export {
	DiagramGrammarSchema,
	type DiagramGrammar,
	MessageKindSchema,
	type MessageKind,
	NodeKindSchema,
	type NodeKind,
	EdgeKindSchema,
	type EdgeKind,
	EdgeEmphasisSchema,
	type EdgeEmphasis,
	VariantLifecycleSchema,
	type VariantLifecycle,
};

// The words a semantic board is written in, and nothing else.
//
// ADR 0023 draws one line: an agent says what a thing *is* and how it relates
// to its neighbours, and the renderer decides where it goes and what it looks
// like. So every value in this file is a meaning — a kind, a relationship, a
// lifecycle — and none of them is a coordinate, a colour, a font or a route.
// A field an agent could use to move a box would move that line, so there is
// no such field, in any spelling.
//
// The kind and relationship vocabularies are PR Lens's, at the revision the
// renderer was forked from (see `src/runtime/semantic-renderer`). They are
// coarse on purpose: a kind drives a card's glyph, never an analysis, and
// anything that does not fit is `other`, which still draws.

import { z } from "zod";

/**
 * What an architectural node is. Coarse: it picks a glyph, not a behaviour.
 */
const NodeKindSchema = z.enum([
	"service",
	"app",
	"module",
	"function",
	"route",
	"job",
	"queue",
	"datastore",
	"cache",
	"external",
	"ui",
	"config",
	"test",
	"package",
	"other",
]);
type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * How one node reaches another.
 */
const EdgeKindSchema = z.enum([
	"call",
	"http",
	"rpc",
	"event",
	"queue",
	"data",
	"dependency",
	"render",
	"other",
]);
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
 * The two grammars a variant can be drawn in.
 *
 * Both are inherited from the renderer this repository forked, and both read
 * the same nodes: architecture shows what the parts are and how they are wired,
 * and data-flow shows one ordered exchange between them. A third would be a new
 * way of saying something, not a new way of drawing it, so the set is closed.
 */
const DiagramGrammarSchema = z.enum(["architecture", "data-flow"]);
type DiagramGrammar = z.infer<typeof DiagramGrammarSchema>;

/**
 * What one message in a flow does. `async` is sent and not waited for,
 * `return` carries an answer back, and `self` never leaves its sender.
 */
const MessageKindSchema = z.enum(["sync", "async", "return", "self"]);
type MessageKind = z.infer<typeof MessageKindSchema>;

/**
 * Where a variant stands. `current` is the architecture that is implemented,
 * `draft` a proposal, `historical` an architecture that was once current.
 * The designation moves; the variant's name never does (ADR 0023).
 */
const VariantLifecycleSchema = z.enum(["current", "draft", "historical"]);
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

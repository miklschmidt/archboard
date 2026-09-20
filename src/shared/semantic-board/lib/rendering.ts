// What a drawn board looks like on the wire.
//
// Three things consume a render: the canvas that produces it, the command that
// writes it to a file, and the pane that shows it. They are in three areas of
// the repository and cannot import each other, so without one owner the same
// shape gets written down three times and drifts the first time a field is
// added. This is that owner: the schema is here, and every consumer infers its
// types from it rather than describing the answer again.
//
// The reply is a union rather than a record of optional fields, and that is the
// whole point of it. A render either produced a picture or found nothing to
// draw, and those are different answers. A shape that made `svg` and `empty`
// independently optional would accept both halves of a torn one — a size with
// no picture, a picture with no size, neither, or both — and the only thing a
// viewer could do with that is show "this board is empty" for what is actually
// a protocol failure. A board with things on it looking like a board nobody has
// started is the worst confusion this contract can cause, so it is unspellable.

import { z } from "zod";
import { DisplayNameSchema, SemanticIdSchema } from "@/shared/semantic-board/lib/primitives";
import { ToldStandingSchema } from "@/shared/semantic-board/lib/reconcile";
import {
	DiagramGrammarSchema,
	VariantLifecycleSchema,
} from "@/shared/semantic-board/lib/vocabulary";

/** The two grounds a board can be drawn on. */
const DiagramThemeSchema = z.enum(["light", "dark"]);
type DiagramTheme = z.infer<typeof DiagramThemeSchema>;

/**
 * Where a drawn document's faces come from.
 *
 * A pane is inside a page the canvas serves, so it links them and the browser
 * fetches each one once. A file somebody keeps has no canvas behind it, so it
 * carries them. Nothing else is offered: naming a face without delivering it is
 * how a picture ends up drawn in a font nobody measured.
 */
const FontSourceSchema = z.enum(["linked", "embedded"]);
type FontSource = z.infer<typeof FontSourceSchema>;

/** A rectangle in the drawn document's own viewBox units. */
const DiagramBoxSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});
type DiagramBox = z.infer<typeof DiagramBoxSchema>;

/**
 * Where every semantic subject the renderer drew ended up, keyed by the id the
 * board gave it.
 *
 * Only the renderer knows where anything landed, and it knows while it is
 * drawing, so the geometry travels with the picture rather than being measured
 * back out of it by something that would have to guess.
 */
const DiagramAtlasSchema = z.object({
	nodes: z.record(z.string(), DiagramBoxSchema),
	edges: z.record(z.string(), DiagramBoxSchema),
	regions: z.record(z.string(), DiagramBoxSchema),
});
type DiagramAtlas = z.infer<typeof DiagramAtlasSchema>;

/** Which variant was drawn, and where it stands. */
const RenderedVariantSchema = z.object({
	id: SemanticIdSchema,
	name: DisplayNameSchema,
	lifecycle: VariantLifecycleSchema,
});
type RenderedVariant = z.infer<typeof RenderedVariantSchema>;

/**
 * One of a board's named views, as a reader needs to know it: enough to put
 * it in a switcher and ask for it, and nothing about what is inside it.
 */
const OfferedViewSchema = z.object({
	id: SemanticIdSchema,
	name: DisplayNameSchema,
	grammar: DiagramGrammarSchema,
});
type OfferedView = z.infer<typeof OfferedViewSchema>;

/** How one subject of a proposal stands against the variant it came from. */
const SubjectStandingSchema = z.enum(["added", "removed", "changed", "unchanged"]);

/**
 * What a proposal changed, as the answer carries it: its predecessor, and how
 * every subject of the comparison picture stands against that predecessor. A
 * clean canvas reading keeps this report even though it leaves the comparison
 * marks and removed subjects out of its SVG.
 *
 * Derived on every render rather than stored. Nothing on a board says "this node
 * is new": a proposal states its architecture, and what it changed is read
 * against the variant it came from, every time, out of the identities the two
 * share (ADR 0023). A variant with no predecessor carries none of this, because
 * there is nothing for it to have changed.
 *
 * By subject id rather than nested by kind, because that is how the comparison
 * atlas, selection, and inspector already work.
 */
const RenderedChangesSchema = z.object({
	predecessor: RenderedVariantSchema,
	standing: z.record(z.string(), SubjectStandingSchema),
});
type RenderedChanges = z.infer<typeof RenderedChangesSchema>;

/**
 * What every render answer says about what was drawn, before the picture.
 *
 * Every answer carries the board's whole list of views, because a pane that
 * has just been given a picture is exactly the thing that needs to offer the
 * others, and a second round trip to find out what they are would be a second
 * chance for the two to disagree.
 */
const RenderIdentitySchema = z.object({
	success: z.literal(true),
	board: DisplayNameSchema,
	version: z.int(),
	variant: RenderedVariantSchema,
	theme: DiagramThemeSchema,
	/** The view this picture is of, or null when it is of the whole variant. */
	view: OfferedViewSchema.nullable(),
	/** Every board view, in its authored order. */
	views: z.array(OfferedViewSchema),
	/**
	 * What this variant changed about the one it came from, or null when it came
	 * from nothing and so changed nothing.
	 */
	changes: RenderedChangesSchema.nullable(),
	/**
	 * What this variant is waiting on, or null when it is waiting on nothing.
	 *
	 * On the answer rather than left to the viewer to fetch, because a picture of
	 * a variant that is holding an unsettled disagreement is a picture of content
	 * that is coherent but out of date with where it came from — and a reader
	 * looking at it has to be told, in the same breath as being shown it.
	 *
	 * What it is waiting on, not the state it was measured from: the retained
	 * base is how the store settles a later merge, and nothing a reader does with
	 * this needs it.
	 */
	waiting: ToldStandingSchema.nullable(),
});

/** A board that was drawn. */
const DrawnBoardSchema = RenderIdentitySchema.extend({
	svg: z.string().min(1),
	width: z.number().positive(),
	height: z.number().positive(),
	atlas: DiagramAtlasSchema,
});
type DrawnBoard = z.infer<typeof DrawnBoardSchema>;

/**
 * A board that exists and has nothing on it yet. Not a failure: it is a board
 * somebody has just made, and the viewer says so in its own words.
 */
const NothingDrawnSchema = RenderIdentitySchema.extend({
	empty: z.literal("NOTHING_TO_RENDER"),
});
type NothingDrawn = z.infer<typeof NothingDrawnSchema>;

const SemanticRenderReplySchema = z.union([DrawnBoardSchema, NothingDrawnSchema]);
type SemanticRenderReply = z.infer<typeof SemanticRenderReplySchema>;

/**
 * Whether a render answer carries a picture.
 * @param reply The answer.
 * @returns True when there is something to show.
 */
function wasDrawn(reply: SemanticRenderReply): reply is DrawnBoard {
	return "svg" in reply;
}

export {
	OfferedViewSchema,
	type OfferedView,
	SubjectStandingSchema,
	RenderedChangesSchema,
	type RenderedChanges,
	DiagramThemeSchema,
	type DiagramTheme,
	FontSourceSchema,
	type FontSource,
	DiagramBoxSchema,
	type DiagramBox,
	DiagramAtlasSchema,
	type DiagramAtlas,
	RenderedVariantSchema,
	type RenderedVariant,
	RenderIdentitySchema,
	DrawnBoardSchema,
	type DrawnBoard,
	NothingDrawnSchema,
	type NothingDrawn,
	SemanticRenderReplySchema,
	type SemanticRenderReply,
	wasDrawn,
};

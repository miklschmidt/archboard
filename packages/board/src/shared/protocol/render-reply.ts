// What a drawn board looks like on the wire.
//
// Three things consume a render: the server that produces it, the command that
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
import { DisplayNameSchema, SemanticIdSchema } from "#shared/schemas/primitives.ts";
import { ToldStandingSchema } from "#shared/schemas/reconciliation.ts";
import { EVERYTHING_VIEW } from "#shared/rules/scope.ts";
import { DiagramGrammarSchema, VariantLifecycleSchema } from "#shared/schemas/vocabulary.ts";

/** The two themes a document that stands alone can be drawn in. */
const DiagramThemeSchema = z.enum(["light", "dark"]);
type DiagramTheme = z.infer<typeof DiagramThemeSchema>;

/**
 * The themes a document that stands alone can be drawn in: one of the two
 * grounds, or `auto`, which carries both and follows the colour scheme of
 * whoever reads it (TASK-466). A bitmap holds one ground, so only an SVG can be
 * drawn `auto`.
 */
const StandaloneThemeSchema = z.enum([...DiagramThemeSchema.options, "auto"]);
type StandaloneTheme = z.infer<typeof StandaloneThemeSchema>;

/**
 * How an exported picture's legend is laid out (TASK-468): a row that wraps at
 * the picture's width, under it, or a column beside it.
 */
const LegendLayoutSchema = z.enum(["horizontal", "vertical"]);
type LegendLayout = z.infer<typeof LegendLayoutSchema>;

/**
 * Which engine lays an architecture out, behind one seam (TASK-348, ADR 0040).
 * `track` routes every relationship on an assigned track in the channels
 * between ranks (TASK-349); `blocks` packs each container as a block and
 * routes shared trunks between them (TASK-351).
 */
const LayoutEngineSchema = z.enum(["track", "blocks"]);
type LayoutEngineName = z.infer<typeof LayoutEngineSchema>;
/** The engine a render uses when it names none. */
const DEFAULT_LAYOUT_ENGINE: LayoutEngineName = "track";

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
 * it in a switcher and ask for it, and nothing about what is inside it. Every
 * id is minted, except Everything's, which every board has (ADR 0052).
 */
const OfferedViewSchema = z.object({
	id: z.union([SemanticIdSchema, z.literal(EVERYTHING_VIEW.id)]),
	name: DisplayNameSchema,
	grammar: DiagramGrammarSchema,
});
type OfferedView = z.infer<typeof OfferedViewSchema>;

/** How one subject of a variant stands against the variant it is read against. */
const SubjectStandingSchema = z.enum(["added", "removed", "changed", "unchanged"]);

/**
 * How a variant differs, as the answer carries it: the variant it is read
 * against, and how every subject the picture draws stands against that one. A
 * clean canvas reading keeps this report for what it draws, even though it
 * leaves the comparison marks and removed subjects out of its SVG. A subject
 * the view's reading holds and its grammar does not draw is not here, so a
 * count of these is a count of marks the picture shows (TASK-497).
 *
 * Derived on every render rather than stored. Nothing on a board says "this node
 * is new": a variant states its architecture, and how it differs is read
 * against the board's current variant — or, on a board with none, the variant
 * it came from — every time, out of the identities the two share (ADR 0023).
 * The current variant, and a first draft on a board with none, carry none of
 * this, because there is nothing to read them against.
 *
 * By subject id rather than nested by kind, because that is how the comparison
 * atlas, selection, and inspector already work.
 */
const RenderedChangesSchema = z.object({
	against: RenderedVariantSchema,
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
	/** The view this picture is of, or null when it is of the overview. */
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

/** One subject a picture draws: the id that asks for it, and the name a person reads. */
const DrawnSubjectSchema = z.object({
	id: z.string(),
	/**
	 * A node's or a flow's name, a step's words, and a relationship's label,
	 * or the names of the parts it joins when it has none.
	 */
	name: z.string(),
});

/**
 * What a picture draws, by kind of subject, in the board's order: only what
 * the renderer placed. A view's reading holds more than its grammar draws (a
 * sequence draws no relationship, a flowchart no part, an architecture no flow
 * on a board with relationships), so this is read off the drawing, never off
 * the reading (TASK-496).
 */
const DrawnSubjectsSchema = z.object({
	nodes: z.array(DrawnSubjectSchema),
	edges: z.array(DrawnSubjectSchema),
	flows: z.array(DrawnSubjectSchema),
	steps: z.array(DrawnSubjectSchema),
});
type DrawnSubjects = z.infer<typeof DrawnSubjectsSchema>;

/**
 * A subject a picture draws, as a receipt names it: with how it stands when
 * the picture marks a comparison, and without a standing when it marks none.
 */
const MarkedSubjectSchema = DrawnSubjectSchema.extend({
	standing: SubjectStandingSchema.optional(),
});

/** What a picture draws and how each subject stands, by kind, as a receipt names it. */
const MarkedSubjectsSchema = z.object({
	nodes: z.array(MarkedSubjectSchema),
	edges: z.array(MarkedSubjectSchema),
	flows: z.array(MarkedSubjectSchema),
	steps: z.array(MarkedSubjectSchema),
});
type MarkedSubjects = z.infer<typeof MarkedSubjectsSchema>;

/**
 * How many subjects a picture marks each way: the counts its key shows beside
 * each mark, zero for a mark the key leaves out.
 */
const PictureMarksSchema = z.object({
	added: z.int(),
	changed: z.int(),
	removed: z.int(),
});
type PictureMarks = z.infer<typeof PictureMarksSchema>;

/**
 * What a drawing command's receipt says about its picture (TASK-496,
 * TASK-497): every subject it draws, and the counts of its marks, or null when
 * it marks no comparison.
 */
const PictureReceiptShape = {
	drawn: MarkedSubjectsSchema,
	marks: PictureMarksSchema.nullable(),
};

/**
 * How a picture drew one subject, as the renderer core read it off the picture
 * it drew: each fact as the subject's group in the document says it.
 */
const AppliedAppearanceSchema = z.object({
	id: z.string(),
	/** What its kind is called. */
	typeName: z.string(),
	/** The key of its kind in the vault's policy. */
	typeKind: z.string(),
	/** The icon's own markup, as the picture draws it; empty for a line. */
	iconSvg: z.string(),
	/** `card` or `container` for a part; empty for a line. */
	depiction: z.string(),
	typeColor: z.string(),
	lineColor: z.string(),
	dash: z.string(),
	arrowhead: z.string(),
});

/**
 * What a picture's key lists (TASK-383): one sample of each part kind and of
 * each relationship kind the picture draws, in the order it draws them, so
 * nothing in the key is absent from the picture.
 */
const PictureKeySchema = z.object({
	kinds: z.array(AppliedAppearanceSchema).readonly(),
	relationships: z.array(AppliedAppearanceSchema).readonly(),
});

/** A board that was drawn. */
const DrawnBoardSchema = RenderIdentitySchema.extend({
	svg: z.string().min(1),
	width: z.number().positive(),
	height: z.number().positive(),
	atlas: DiagramAtlasSchema,
	/** Each subject the picture draws with the appearance it was drawn with, in drawing order. */
	appearances: z.array(AppliedAppearanceSchema).readonly(),
	/** What the picture's key lists, or null when it draws no subject of a kind. */
	key: PictureKeySchema.nullable(),
	/** What the picture draws; `changes.standing` says how each of these stands, and no other. */
	drawn: DrawnSubjectsSchema,
});
type DrawnBoard = z.infer<typeof DrawnBoardSchema>;

/**
 * Why nothing was drawn. `NOTHING_TO_RENDER`: the variant holds nothing at all.
 * `VIEW_EMPTY_ON_VARIANT`: it holds content, but none of the parts or flows the
 * chosen view names.
 */
const NothingDrawnReasonSchema = z.enum(["NOTHING_TO_RENDER", "VIEW_EMPTY_ON_VARIANT"]);
type NothingDrawnReason = z.infer<typeof NothingDrawnReasonSchema>;

/**
 * A board that exists and has nothing to draw. Not a failure: it is a board
 * somebody has just made, or a view that names nothing the variant holds, and
 * the viewer says so in its own words.
 */
const NothingDrawnSchema = RenderIdentitySchema.extend({
	empty: NothingDrawnReasonSchema,
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
	AppliedAppearanceSchema,
	PictureKeySchema,
	OfferedViewSchema,
	type OfferedView,
	SubjectStandingSchema,
	RenderedChangesSchema,
	type RenderedChanges,
	DiagramThemeSchema,
	type DiagramTheme,
	StandaloneThemeSchema,
	type StandaloneTheme,
	LegendLayoutSchema,
	type LegendLayout,
	DEFAULT_LAYOUT_ENGINE,
	LayoutEngineSchema,
	type LayoutEngineName,
	DiagramBoxSchema,
	type DiagramBox,
	DiagramAtlasSchema,
	type DiagramAtlas,
	RenderedVariantSchema,
	type RenderedVariant,
	RenderIdentitySchema,
	type DrawnSubjects,
	type MarkedSubjects,
	PictureMarksSchema,
	type PictureMarks,
	PictureReceiptShape,
	DrawnBoardSchema,
	type DrawnBoard,
	NothingDrawnReasonSchema,
	type NothingDrawnReason,
	NothingDrawnSchema,
	type NothingDrawn,
	SemanticRenderReplySchema,
	type SemanticRenderReply,
	wasDrawn,
};

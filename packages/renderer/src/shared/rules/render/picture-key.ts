// What a picture's key lists, read from the picture.
//
// The key explains only what the picture draws, in the order it draws it, with
// the picture's own symbols (TASK-383, docs/design/pane-sidebar-hierarchy.md):
// each node kind, each relationship kind, the two things a line says beside
// its kind, and the marks a comparison puts on what it changed. The page's
// sidebar reads it here, from the drawn document. An exported picture's legend
// (TASK-468) is drawn by the renderer core, which reads its own scene by the
// same rules (`crates/archboard-scene/src/paint/export.rs`), and the export
// legend tests hold the two keys to the same entries. The core writes what a
// subject is drawn as onto the subject's group, and this reads it back without
// a DOM, so it runs wherever the renderer runs.
//
// Nothing here interprets the architecture: a picture that draws a subject a
// certain way is read as drawing it that way, whatever policy drew it.

import type { SubjectStanding } from "#shared/protocol/render-request.ts";

/** The attribute naming the subject a group of the picture draws. */
const SUBJECT = "data-semantic-id";
/** The attribute naming the type the renderer drew a subject as. */
const TYPE_NAME = "data-type-name";
/** The attribute of the group the renderer draws a kind's icon in. */
const ICON = "data-type-icon";

/** The renderer's appearance facts about one visible subject. */
interface AppliedAppearance {
	readonly id: string;
	readonly typeName: string;
	readonly typeKind: string;
	/** The icon's own markup, as the picture draws it; empty for a line. */
	readonly iconSvg: string;
	/** `card` or `container` for a node; empty for a line. */
	readonly depiction: string;
	readonly typeColor: string;
	readonly lineColor: string;
	readonly dash: string;
	readonly arrowhead: string;
}

/**
 * One subject's appearance from the attributes of the group that draws it.
 * @param id The subject.
 * @param attribute Reads one of the group's attributes, null when it has none.
 * @param iconSvg The markup of the first icon inside the group, or empty.
 * @returns Its appearance, each absent fact at its neutral value.
 */
function appearanceFrom(
	id: string,
	attribute: (name: string) => string | null,
	iconSvg: string,
): AppliedAppearance {
	/**
	 * One fact the group carries.
	 * @param name The attribute that carries it.
	 * @param neutral Its value when the group carries none.
	 * @returns The fact.
	 */
	const read = (name: string, neutral: string): string => attribute(name) ?? neutral;
	return {
		id,
		iconSvg,
		typeName: read(TYPE_NAME, ""),
		typeKind: read("data-type-kind", ""),
		depiction: read("data-depiction", ""),
		typeColor: read("data-type-color", "neutral"),
		lineColor: read("data-line-color", "neutral"),
		dash: read("data-line-dash", "solid"),
		arrowhead: read("data-arrowhead", "filled"),
	};
}

/** One start or end tag of the document, as the scan meets it. */
const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gu;
/** One attribute of a start tag. */
const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
/** The entities an attribute value can carry. */
const ENTITY = /&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/giu;
const NAMED: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/**
 * An attribute value as it reads once its entities are resolved.
 * @param raw The value as written.
 * @returns What it says.
 */
function unescaped(raw: string): string {
	return raw.replace(
		ENTITY,
		(_, hex: string | undefined, decimal: string | undefined, name: string | undefined) =>
			name === undefined
				? String.fromCodePoint(Number.parseInt(hex ?? decimal ?? "0", hex === undefined ? 10 : 16))
				: NAMED[name.toLowerCase()]!,
	);
}

/**
 * The attributes of one start tag.
 * @param written The tag's attribute text.
 * @returns Each attribute's value, by name.
 */
function attributesOf(written: string): Map<string, string> {
	return new Map(
		[...written.matchAll(ATTRIBUTE)].map((found) => [
			found[1]!,
			unescaped(found[2] ?? found[3] ?? ""),
		]),
	);
}

/** A subject group met in the document, and the first icon found inside it. */
interface Met {
	readonly id: string;
	readonly attributes: Map<string, string>;
	icon: string;
}

/** One element the scan is inside. */
interface Open {
	readonly name: string;
	/** Whether it is a kind's icon group. */
	readonly icon: boolean;
	/** Where its start tag begins, for an icon's markup. */
	readonly start: number;
	/** The subject it draws, when it is a subject's group. */
	readonly subject: Met | undefined;
}

/**
 * Give a kind's icon to every subject the scan is inside that has none yet,
 * because the first icon inside a subject is its kind's.
 * @param open The elements the scan is inside.
 * @param markup The icon's own svg.
 */
function giveIcon(open: readonly Open[], markup: string): void {
	for (const { subject } of open) {
		if (subject?.icon === "") subject.icon = markup;
	}
}

/**
 * Meet one end tag: when it closes the svg of a kind's icon group, that markup
 * is an icon.
 * @param svg The document.
 * @param open The elements the scan is inside, the closed one last.
 * @param end Where the end tag ends.
 */
function closed(svg: string, open: Open[], end: number): void {
	const element = open.pop();
	const parent = open.at(-1);
	if (element === undefined || parent === undefined) return;
	if (element.name === "svg" && parent.icon) giveIcon(open, svg.slice(element.start, end));
}

/**
 * Meet one start tag: a subject's group is met, and every element but an
 * empty one is entered.
 * @param found The tag.
 * @param open The elements the scan is inside.
 * @param met The subject groups met so far, in document order.
 */
function opened(found: RegExpExecArray, open: Open[], met: Met[]): void {
	const [, , name, written, selfClosing] = found;
	const attributes = attributesOf(written ?? "");
	const id = attributes.get(SUBJECT);
	const subject =
		id !== undefined && attributes.has(TYPE_NAME) ? { id, attributes, icon: "" } : undefined;
	if (subject !== undefined) met.push(subject);
	if (selfClosing !== "/")
		open.push({ name: name!, icon: attributes.has(ICON), start: found.index, subject });
}

/**
 * Read the appearance facts of every subject a picture draws, without
 * interpreting architecture or drawing it again: what a DOM query for
 * `[data-semantic-id][data-type-name]` finds, in document order, a subject
 * drawn by several groups (a container's frame and its header) keeping its
 * first place and the last group's facts.
 * @param svg The drawn document, or any markup it is made of.
 * @returns Metadata for the visible nodes and relationships, by subject.
 */
function pictureAppearances(svg: string): ReadonlyMap<string, AppliedAppearance> {
	const open: Open[] = [];
	const met: Met[] = [];
	for (const found of svg.matchAll(TAG)) {
		if (found[1] === "/") closed(svg, open, found.index + found[0].length);
		else opened(found, open, met);
	}
	return new Map(
		met.map(({ id, attributes, icon }) => [
			id,
			appearanceFrom(id, (name) => attributes.get(name) ?? null, icon),
		]),
	);
}

/** What a picture's key lists: its node kinds, and its relationship kinds. */
interface PictureKey<Appearance extends AppliedAppearance = AppliedAppearance> {
	/** Each node kind the picture draws, once per distinct sample, in drawing order. */
	readonly kinds: readonly Appearance[];
	/** Each relationship kind the picture draws, likewise. */
	readonly relationships: readonly Appearance[];
}

/**
 * What a picture's key lists: only what the picture draws, so nothing in the
 * key is absent from the picture, and in the order the picture draws it.
 * @param appearances The picture's appearance facts, by subject.
 * @returns Its kinds and its relationship kinds, or null when it draws no typed subject.
 */
function keyOf<Appearance extends AppliedAppearance>(
	appearances: ReadonlyMap<string, Appearance>,
): PictureKey<Appearance> | null {
	const entries = [...appearances.values()];
	const kinds = distinctSamples(entries.filter((item) => item.depiction !== ""));
	const relationships = distinctSamples(entries.filter((item) => item.depiction === ""));
	return kinds.length + relationships.length === 0 ? null : { kinds, relationships };
}

/**
 * Keep each configured kind and its applied sample, even when display names repeat.
 * @param appearances Visible appearance facts.
 * @returns Unique samples in drawing order.
 */
function distinctSamples<Appearance extends AppliedAppearance>(
	appearances: readonly Appearance[],
): Appearance[] {
	return [...new Map(appearances.map((item) => [sampleKey(item), item])).values()];
}

/**
 * Identify the configured kind and the visual meaning of its sample.
 * @param item One depicted type.
 * @returns A stable key independent of the subject or containment scope.
 */
function sampleKey(item: AppliedAppearance): string {
	return JSON.stringify([
		item.typeKind,
		item.typeName,
		item.iconSvg,
		item.typeColor,
		item.lineColor,
		item.dash,
		item.arrowhead,
	]);
}

/**
 * The two things a line says beside its kind, which a key lists under the
 * relationship kinds whenever the picture draws a line: how heavily it is
 * drawn, and the pulses that ride it.
 */
const LINE_MARKS = [
	{ mark: "emphasis", word: "More emphasis" },
	{ mark: "traffic", word: "Illustrated traffic" },
] as const;

/** One of the two things a line says beside its kind. */
type LineMark = (typeof LINE_MARKS)[number]["mark"];

/** The standings a comparison marks, in the order a reader is told them. */
const MARKED = [
	{ standing: "added", word: "Added" },
	{ standing: "changed", word: "Changed" },
	{ standing: "removed", word: "Removed" },
] as const satisfies readonly { readonly standing: SubjectStanding; readonly word: string }[];

/** One marked standing and how many subjects stand so. */
type MarkCount = (typeof MARKED)[number] & { readonly count: number };

/**
 * How the subjects a drawing placed stand: a comparison's standing kept to
 * them. A reading holds more than its grammar draws (a sequence view keeps the
 * relationships between its participants and draws none of them), so a mark
 * is counted, and a subject named, only where the drawing put one (TASK-497).
 * @param standing How every subject of the reading stands.
 * @param placed The subjects the drawing placed, by id.
 * @returns The standing of those alone.
 */
function placedStanding(
	standing: Readonly<Record<string, SubjectStanding>>,
	placed: readonly string[],
): Record<string, SubjectStanding> {
	return Object.fromEntries(
		placed.flatMap((id) => {
			const stands = standing[id];
			return stands === undefined ? [] : [[id, stands]];
		}),
	);
}

/**
 * How many subjects stand each marked way, leaving out the standings nothing has.
 * @param standing How every subject of the comparison stands.
 * @returns The counts, in the order a reader is told them.
 */
function markCounts(standing: Readonly<Record<string, SubjectStanding>>): readonly MarkCount[] {
	const values = Object.values(standing);
	return MARKED.map((marked) => ({
		...marked,
		count: values.filter((one) => one === marked.standing).length,
	})).filter((marked) => marked.count > 0);
}

export {
	appearanceFrom,
	keyOf,
	LINE_MARKS,
	markCounts,
	pictureAppearances,
	placedStanding,
	sampleKey,
	type AppliedAppearance,
	type LineMark,
	type MarkCount,
	type PictureKey,
};

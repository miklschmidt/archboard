// Reading the subjects back out of a drawn document.
//
// A viewer finds a subject by its `data-semantic-*` attributes and selects on
// it, so that is how these tests find one too: the assertions are about what a
// pane could pick out of the returned string, not about the string.

/** One subject group the renderer emitted. */
interface DrawnGroup {
	/** What sort of subject it is. */
	readonly kind: string;
	/** Its semantic id. */
	readonly id: string;
	/** How it stands, or undefined when the group said nothing. */
	readonly standing: string | undefined;
	/** Its group opacity, or undefined when it is drawn at full strength. */
	readonly opacity: number | undefined;
	/** Everything between the group's own tags, its own start tag included. */
	readonly markup: string;
}

/** Every `<g …>` and `</g>` in a document, in order. */
const GROUP_TOKEN = /<g(\s[^>]*)?>|<\/g>/g;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

/**
 * One start tag's attributes.
 * @param tag The whole start tag.
 * @returns Its attributes.
 */
function attributesOf(tag: string): Record<string, string> {
	const found: Record<string, string> = {};
	for (const [, name, value] of tag.matchAll(ATTRIBUTE)) {
		found[name!] = value!;
	}
	return found;
}

/**
 * Every subject group a document holds, with the markup of each.
 *
 * Groups nest — a pin is a group inside a card, a glyph is a group inside a
 * chip — so the tokens are walked with a stack rather than matched pairwise.
 * @param svg The drawn document.
 * @returns The subject groups, in the order they close.
 */
function subjectGroups(svg: string): DrawnGroup[] {
	const open: { readonly at: number; readonly tag: string }[] = [];
	const found: DrawnGroup[] = [];
	for (const match of svg.matchAll(GROUP_TOKEN)) {
		if (match[0] === "</g>") {
			const started = open.pop();
			const attributes = started === undefined ? {} : attributesOf(started.tag);
			const id = attributes["data-semantic-id"];
			if (started !== undefined && id !== undefined) {
				const opacity = attributes["opacity"];
				found.push({
					kind: attributes["data-semantic-kind"] ?? "",
					id,
					standing: attributes["data-semantic-standing"],
					opacity: opacity === undefined ? undefined : Number(opacity),
					markup: svg.slice(started.at, match.index + match[0].length),
				});
			}
			continue;
		}
		open.push({ at: match.index, tag: match[0] });
	}
	return found;
}

/**
 * One named subject's group.
 * @param svg The drawn document.
 * @param kind What sort of subject.
 * @param id Its semantic id.
 * @returns The group, or undefined when nothing drew it.
 */
function groupOf(svg: string, kind: string, id: string): DrawnGroup | undefined {
	return subjectGroups(svg).find((group) => group.kind === kind && group.id === id);
}

/** The standing pin: a translated group holding a disc and the mark on it. */
const PIN = /<g transform="translate\([^"]*\)"><circle[\s\S]*?<\/g>/;

/**
 * One subject's markup as a reader sees it, with every colour spent.
 *
 * This is what somebody who cannot tell two hues apart is left with. Two
 * standings whose drawings differ only in colour collapse to the same string
 * here, which is the failure these tests exist to catch. The standing attribute
 * itself is spent with the colours: it is an instruction to a viewer, not
 * something anybody looks at, and leaving it in would make every comparison here
 * pass on the strength of a word nobody can see.
 * @param group The subject group.
 * @returns Its markup, with every literal colour and the standing word replaced.
 */
function withoutColour(group: DrawnGroup): string {
	return group.markup
		.replace(/#[0-9a-fA-F]{6}\b/g, "#ink")
		.replace(/data-semantic-standing="[a-z]+"/g, "data-semantic-standing");
}

/**
 * The same, with the standing's own mark taken away as well.
 *
 * What is left is whatever the rest of the drawing says on its own, which is how
 * these tests check that the mark is not the only thing carrying the meaning.
 * @param group The subject group.
 * @returns Its markup, without colour and without its pin.
 */
function withoutMark(group: DrawnGroup): string {
	return withoutColour(group).replace(PIN, "");
}

/**
 * The shape of the mark one subject wears.
 * @param group The subject group.
 * @returns The mark's path, or undefined when the subject wears none.
 */
function markShape(group: DrawnGroup): string | undefined {
	const pin = PIN.exec(group.markup)?.[0];
	return pin === undefined ? undefined : /<path d="([^"]*)"/.exec(pin)?.[1];
}

/** One stroked path of a drawn subject. */
interface DrawnStroke {
	/** How wide the stroke is. */
	readonly width: number;
	/** Its dash pattern, or undefined when it is solid. */
	readonly dash: string | undefined;
	/** Where in the group's markup it was drawn. */
	readonly at: number;
}

/**
 * Every stroked path of one subject, in the order they are painted.
 * @param group The subject group.
 * @returns The strokes.
 */
function strokesOf(group: DrawnGroup): DrawnStroke[] {
	const strokes: DrawnStroke[] = [];
	for (const match of group.markup.matchAll(/<path\s[^>]*\/>/g)) {
		const attributes = attributesOf(match[0]);
		const width = attributes["stroke-width"];
		if (width !== undefined) {
			strokes.push({
				width: Number(width),
				dash: attributes["stroke-dasharray"],
				at: match.index,
			});
		}
	}
	return strokes;
}

export {
	type DrawnGroup,
	type DrawnStroke,
	subjectGroups,
	groupOf,
	withoutColour,
	withoutMark,
	markShape,
	strokesOf,
};

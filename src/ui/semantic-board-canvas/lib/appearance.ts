// Applied appearance is read from the renderer's picture, so inspection never
// explains a newer policy than the picture the person actually selected.

/** The attribute naming the subject a group of the picture draws. */
const SUBJECT = "data-semantic-id";
/** The attribute naming the type the renderer drew a subject as. */
const TYPE_NAME = "data-type-name";
/** Where the renderer draws a kind's icon inside a subject's group. */
const ICON = "[data-type-icon] svg";

/** The renderer's appearance facts about one visible subject. */
interface AppliedAppearance {
	readonly id: string;
	readonly typeName: string;
	readonly typeKind: string;
	readonly iconSvg: string;
	readonly depiction: string;
	readonly typeColor: string;
	readonly lineColor: string;
	readonly dash: string;
	readonly arrowhead: string;
}

/**
 * Read appearance facts without interpreting architecture or rerendering it.
 * @param svg The server-owned picture.
 * @returns Metadata for the visible nodes and relationships.
 */
function pictureAppearances(svg: string): ReadonlyMap<string, AppliedAppearance> {
	const picture = new DOMParser().parseFromString(svg, "image/svg+xml");
	const appearances = new Map<string, AppliedAppearance>();
	for (const group of picture.querySelectorAll(`[${SUBJECT}][${TYPE_NAME}]`)) {
		const id = group.getAttribute(SUBJECT);
		if (id !== null) appearances.set(id, appearanceOf(group, id));
	}
	return appearances;
}

/**
 * How the picture draws one subject, read from the picture it is drawn in.
 * @param picture The picture, or any element inside it.
 * @param id The subject.
 * @returns Its appearance, or undefined when the picture names no type for it.
 */
function drawnAppearance(picture: Element, id: string): AppliedAppearance | undefined {
	const root = picture.closest("svg") ?? picture;
	const group = root.querySelector(`[${SUBJECT}="${id}"][${TYPE_NAME}]`);
	if (group === null) return undefined;
	const drawn = appearanceOf(group, id);
	// A container draws its kind's icon in its header, a group of its own
	// apart from the frame that carries its type.
	return drawn.iconSvg === ""
		? { ...drawn, iconSvg: root.querySelector(`[${SUBJECT}="${id}"] ${ICON}`)?.outerHTML ?? "" }
		: drawn;
}

/**
 * The appearance facts one subject's group carries.
 * @param group The group the renderer marked with the subject's type.
 * @param id The subject.
 * @returns Its appearance.
 */
function appearanceOf(group: Element, id: string): AppliedAppearance {
	return {
		id,
		iconSvg: group.querySelector(ICON)?.outerHTML ?? "",
		typeName: attribute(group, TYPE_NAME, ""),
		typeKind: attribute(group, "data-type-kind", ""),
		depiction: attribute(group, "data-depiction", ""),
		typeColor: attribute(group, "data-type-color", "neutral"),
		lineColor: attribute(group, "data-line-color", "neutral"),
		dash: attribute(group, "data-line-dash", "solid"),
		arrowhead: attribute(group, "data-arrowhead", "filled"),
	};
}

/**
 * Read a renderer attribute with its neutral default.
 * @param group The subject group.
 * @param name The metadata attribute.
 * @param fallback The neutral value.
 * @returns The rendered value.
 */
function attribute(group: Element, name: string, fallback: string): string {
	return group.getAttribute(name) ?? fallback;
}

/** What a picture's key lists: its node kinds, and its relationship kinds. */
interface PictureKey {
	/** Each node kind the picture draws, once per distinct sample, in drawing order. */
	readonly kinds: readonly AppliedAppearance[];
	/** Each relationship kind the picture draws, likewise. */
	readonly relationships: readonly AppliedAppearance[];
}

/**
 * What a picture's key lists: only what the picture draws, so nothing in the
 * key is absent from the picture, and in the order the picture draws it.
 * @param appearances The picture's appearance facts, by subject.
 * @returns Its kinds and its relationship kinds, or null when it draws no typed subject.
 */
function keyOf(appearances: ReadonlyMap<string, AppliedAppearance>): PictureKey | null {
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
function distinctSamples(appearances: readonly AppliedAppearance[]): AppliedAppearance[] {
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

export {
	drawnAppearance,
	keyOf,
	pictureAppearances,
	sampleKey,
	type AppliedAppearance,
	type PictureKey,
};

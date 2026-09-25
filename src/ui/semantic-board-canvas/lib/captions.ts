// The names of a picture's containers and group regions, read off the picture
// the renderer drew. At the zoom a whole board fits a pane, their drawn words
// are too small to read; a viewer names each region at a size that stays
// readable instead, and only while the drawn one is not.

/** A region's name as the picture carries it. */
interface PictureCaption {
	/** The container's semantic id, or the group region's group and container. */
	readonly id: string;
	/** A container, or a group's region inside one. */
	readonly kind: "container" | "group";
	readonly text: string;
	/** The region's box, in the drawing's own units. */
	readonly box: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
	/** The group's palette colour, for a group region. */
	readonly color: string | undefined;
	/** How large the picture draws the name, in the drawing's own units. */
	readonly size: number;
}

/**
 * A number an attribute holds.
 * @param element The element.
 * @param name The attribute.
 * @returns The number, or 0.
 */
function numberOf(element: Element | null, name: string): number {
	const value = Number(element?.getAttribute(name));
	return Number.isFinite(value) ? value : 0;
}

/**
 * An attribute's value, when the element has it.
 * @param element The element.
 * @param name The attribute.
 * @returns Its value, or nothing.
 */
function attributeOf(element: Element, name: string): string | undefined {
	return element.getAttribute(name) ?? undefined;
}

/**
 * The box a region's group draws its band with, in the drawing's own units.
 * @param band The band's rectangle.
 * @returns Its box.
 */
function boxOf(band: Element): PictureCaption["box"] {
	return {
		x: numberOf(band, "x"),
		y: numberOf(band, "y"),
		width: numberOf(band, "width"),
		height: numberOf(band, "height"),
	};
}

/**
 * One region's name, read from its group in the picture.
 * @param group The region's group.
 * @param kind What the region is.
 * @returns Its caption, or nothing when the picture names it nowhere.
 */
function captionOf(group: Element, kind: PictureCaption["kind"]): PictureCaption | undefined {
	const text = group.getAttribute("data-caption")?.trim() ?? "";
	const band = group.querySelector(":scope > rect:not(.ab-halo)");
	if (text === "" || band === null) return undefined;
	const box = boxOf(band);
	const named = group.getAttribute(kind === "container" ? "data-semantic-id" : "data-group");
	return {
		id: `${kind}:${named}@${box.x},${box.y}`,
		kind,
		text,
		box,
		color: attributeOf(group, "data-group-color"),
		size: numberOf(group.querySelector("text"), "font-size"),
	};
}

/**
 * Every container and group region the picture names, containers first.
 * @param svg The picture.
 * @returns The captions.
 */
function pictureCaptions(svg: string): PictureCaption[] {
	const picture = new DOMParser().parseFromString(svg, "image/svg+xml");
	const containers = [...picture.querySelectorAll('g[data-semantic-kind="region"][data-caption]')];
	const groups = [
		...picture.querySelectorAll('g[data-semantic-kind="group-region"][data-caption]'),
	];
	return [
		...containers.map((group) => captionOf(group, "container")),
		...groups.map((group) => captionOf(group, "group")),
	].filter((caption): caption is PictureCaption => caption !== undefined);
}

export { pictureCaptions, type PictureCaption };

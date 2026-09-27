// Applied appearance is read from the renderer's picture, so inspection never
// explains a newer policy than the picture the person actually selected.

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
	for (const group of picture.querySelectorAll("[data-semantic-id][data-type-name]")) {
		const id = group.getAttribute("data-semantic-id");
		if (id === null) continue;
		appearances.set(id, {
			id,
			iconSvg: group.querySelector("[data-type-icon] svg")?.outerHTML ?? "",
			typeName: attribute(group, "data-type-name", ""),
			typeKind: attribute(group, "data-type-kind", ""),
			depiction: attribute(group, "data-depiction", ""),
			typeColor: attribute(group, "data-type-color", "neutral"),
			lineColor: attribute(group, "data-line-color", "neutral"),
			dash: attribute(group, "data-line-dash", "solid"),
			arrowhead: attribute(group, "data-arrowhead", "filled"),
		});
	}
	return appearances;
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

export { pictureAppearances, type AppliedAppearance };

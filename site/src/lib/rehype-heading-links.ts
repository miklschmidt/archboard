// Give each h2 and h3 of a docs page a link to itself, after its words, so a reader can copy the
// address of a section. Astro gives the headings their ids before this runs.

import type { RehypePlugin } from "@astrojs/markdown-remark";

/** The tree accepted by Astro's rehype plugin. */
type HastRoot = Parameters<Exclude<ReturnType<RehypePlugin>, void>>[0];
/** The root or any content node, with the upstream discriminated types. */
type HastNode = HastRoot | HastRoot["children"][number];

/**
 * Visit each element of a tree.
 * @param node A hast node.
 */
function walk(node: HastNode): void {
	if (node.type === "element") linkHeading(node);
	if ("children" in node) for (const child of node.children) walk(child);
}

/**
 * Put the link after the words of a heading that has an id.
 * @param node An element.
 */
function linkHeading(node: Extract<HastNode, { type: "element" }>): void {
	const { properties, children } = node;
	if ((node.tagName !== "h2" && node.tagName !== "h3") || !properties.id) return;
	properties.className = [...(properties.className ?? []), "heading"];
	children.push({
		type: "element",
		tagName: "a",
		properties: {
			className: ["heading-link"],
			href: `#${String(properties.id)}`,
			ariaLabel: "Link to this section",
			dataHeadingLink: "",
			dataPagefindIgnore: "",
		},
		children: [{ type: "text", value: "#" }],
	});
}

/**
 * The rehype plugin.
 * @returns The transformer.
 */
export const rehypeHeadingLinks: RehypePlugin = () => (tree) => {
	walk(tree);
};

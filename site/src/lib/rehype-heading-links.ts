// Give each h2 and h3 of a docs page a link to itself, after its words, so a reader can copy the
// address of a section. Astro gives the headings their ids before this runs.

import type { Node, RehypePlugin } from "@astrojs/markdown-remark";

/** A hast node, as far as this plugin reads and writes it. */
type HastNode = Node & {
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
	value?: string;
};

/**
 * Visit each element of a tree.
 * @param node A hast node.
 * @param visit Called for each element.
 */
function walk(node: HastNode, visit: (node: HastNode) => void): void {
	if (node.type === "element") visit(node);
	for (const child of node.children ?? []) walk(child, visit);
}

/**
 * Put the link after the words of a heading that has an id.
 * @param node An element.
 */
function linkHeading(node: HastNode): void {
	const { properties, children } = node;
	if ((node.tagName !== "h2" && node.tagName !== "h3") || !properties?.["id"] || !children) return;
	const classes = Array.isArray(properties["className"]) ? properties["className"] : [];
	properties["className"] = [...classes, "heading"];
	children.push({
		type: "element",
		tagName: "a",
		properties: {
			className: ["heading-link"],
			href: `#${String(properties["id"])}`,
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
	walk(tree, linkHeading);
};

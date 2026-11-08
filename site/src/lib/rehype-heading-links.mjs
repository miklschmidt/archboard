// Give each h2 and h3 of a docs page a link to itself, after its words, so a reader can copy the
// address of a section. Astro gives the headings their ids before this runs.

/**
 * @param {any} node A hast node.
 * @param {(node: any) => void} visit Called for each element.
 */
function walk(node, visit) {
	if (node.type === "element") visit(node);
	for (const child of node.children ?? []) walk(child, visit);
}

/** The rehype plugin. */
export function rehypeHeadingLinks() {
	return (/** @type {any} */ tree) => {
		walk(tree, (node) => {
			if ((node.tagName !== "h2" && node.tagName !== "h3") || !node.properties?.id) return;
			node.properties.className = [...(node.properties.className ?? []), "heading"];
			node.children.push({
				type: "element",
				tagName: "a",
				properties: {
					className: ["heading-link"],
					href: `#${node.properties.id}`,
					ariaLabel: "Link to this section",
					dataHeadingLink: "",
				},
				children: [{ type: "text", value: "#" }],
			});
		});
	};
}

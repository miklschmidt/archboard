// Fill in what a version of the docs describes, wherever a guide writes it in code:
// - `{{version}}`: the CLI release to pin. A release's docs show that release. Main's docs show
//   the latest release, which is the version in the repository's package.json on main.
// - `{{ref}}`: the Git ref to pin this repository's Actions to, `main` or the release's tag.
// `scripts/guides.ts` refuses a version or an Action ref that a guide writes by hand, so a pin
// never goes stale (ADR 0077).

/**
 * @param {any} node An mdast node.
 * @param {(node: any) => void} visit Called for each node.
 */
function walk(node, visit) {
	visit(node);
	for (const child of node.children ?? []) walk(child, visit);
}

/**
 * The remark plugin.
 * @param {{ version: string, ref: string }} options What the tokens stand for.
 */
export function remarkVersion({ version, ref }) {
	return (/** @type {any} */ tree) => {
		walk(tree, (node) => {
			if (node.type !== "code" && node.type !== "inlineCode") return;
			node.value = node.value.replaceAll("{{version}}", version).replaceAll("{{ref}}", ref);
		});
	};
}

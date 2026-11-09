// Fill in what a version of the docs describes, wherever a guide writes it in code:
// - `{{version}}`: the CLI release to pin. A release's docs show that release. Main's docs show
//   the latest release, which is the version in the repository's package.json on main.
// - `{{sha}}` and `{{ref}}`: the commit and the tag that an example pins this repository's Actions
//   to, as `@{{sha}} # {{ref}}` (`actionsPin` in `docs-version.ts`).
// `scripts/guides.ts` refuses a version or an Action ref that a guide writes by hand, so a pin
// never goes stale (ADR 0077).

import type { Node, RemarkPlugin } from "@astrojs/markdown-remark";

/** What the tokens stand for. */
interface VersionTokens {
	readonly version: string;
	readonly ref: string;
	readonly sha: string;
}

/** An mdast node, as far as this plugin reads and writes it. */
type MdastNode = Node & { children?: MdastNode[]; value?: unknown };

/**
 * Visit each node of a tree.
 * @param node An mdast node.
 * @param visit Called for each node.
 */
function walk(node: MdastNode, visit: (node: MdastNode) => void): void {
	visit(node);
	for (const child of node.children ?? []) walk(child, visit);
}

/**
 * The remark plugin.
 * @param tokens What the tokens stand for.
 * @returns The transformer.
 */
export const remarkVersion: RemarkPlugin<[VersionTokens]> =
	({ version, ref, sha }) =>
	(tree) => {
		walk(tree, (node) => {
			if (node.type !== "code" && node.type !== "inlineCode") return;
			if (typeof node.value !== "string") return;
			node.value = node.value
				.replaceAll("{{version}}", version)
				.replaceAll("{{ref}}", ref)
				.replaceAll("{{sha}}", sha);
		});
	};

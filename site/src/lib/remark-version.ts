// Fill in what a version of the docs describes, wherever a guide writes it in code:
// - `{{version}}`: the CLI release to pin. A release's docs show that release. Main's docs show
//   the latest release, which is the version in the repository's package.json on main.
// - `{{sha}}` and `{{ref}}`: the commit and the tag that an example pins this repository's Actions
//   to, as `@{{sha}} # {{ref}}` (`actionsPin` in `docs-version.ts`).
// `scripts/guides.ts` refuses a version or an Action ref that a guide writes by hand, so a pin
// never goes stale (ADR 0077).

import type { RemarkPlugin } from "@astrojs/markdown-remark";

/** What the tokens stand for. */
interface VersionTokens {
	readonly version: string;
	readonly ref: string;
	readonly sha: string;
}

/** The tree accepted by Astro's remark plugin. */
type MdastRoot = Parameters<Exclude<ReturnType<RemarkPlugin>, void>>[0];
/** The root or any content node, with the upstream discriminated types. */
type MdastNode = MdastRoot | MdastRoot["children"][number];

/**
 * Fill version tokens in code nodes, leaving prose unchanged.
 * @param node An mdast node.
 * @param tokens What the tokens stand for.
 */
function fillVersions(node: MdastNode, tokens: VersionTokens): void {
	if (node.type === "code" || node.type === "inlineCode") {
		node.value = node.value
			.replaceAll("{{version}}", tokens.version)
			.replaceAll("{{ref}}", tokens.ref)
			.replaceAll("{{sha}}", tokens.sha);
	}
	if ("children" in node) for (const child of node.children) fillVersions(child, tokens);
}

/**
 * The remark plugin.
 * @param tokens What the tokens stand for.
 * @returns The transformer.
 */
export const remarkVersion: RemarkPlugin<[VersionTokens]> = (tokens) => (tree) => {
	fillVersions(tree, tokens);
};

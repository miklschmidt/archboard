// Draw a Remix Icon into the standalone SVG.
//
// A vault's policy may name any of the icon set's three thousand icons, and a
// picture draws only the few its node kinds name. So the icons are not bundled
// here: the host supplies each icon's path data (from the package under Bun,
// fetched by name in a browser), and this writes the markup the icon's own
// component renders — the runtime tests hold the two to the same bytes for
// every icon in the set.

import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { rendererHost } from "@/transformers/semantic-renderer/lib/host";
import { wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** The icon drawn for a name the icon set does not have. */
const FALLBACK_ICON = "RiQuestionLine";

/**
 * One icon at chip size, as `@remixicon/react` renders it.
 * @param paths The icon's path data.
 * @param ink Its fill.
 * @returns The icon's markup.
 */
function iconMarkup(paths: readonly string[], ink: string): string {
	return wrap(
		"svg",
		{
			viewBox: "0 0 24 24",
			xmlns: "http://www.w3.org/2000/svg",
			width: 18,
			height: 18,
			fill: ink,
			"aria-hidden": "true",
			class: "remixicon ",
		},
		paths.map((d) => wrap("path", { d }, "")).join(""),
	);
}

/**
 * A configured icon, centered inside its type chip.
 * @param icon RemixIcon export name, validated by the policy owner.
 * @param cx Horizontal center.
 * @param cy Vertical center.
 * @param ink Type color, independently of body scope.
 * @returns Self-contained SVG geometry.
 */
function glyphGroup(icon: string, cx: number, cy: number, ink: string): string {
	const host = rendererHost();
	const paths = host.iconPaths(icon) ?? host.iconPaths(FALLBACK_ICON) ?? [];
	return wrap(
		"g",
		{ transform: `translate(${coord(cx - 9)},${coord(cy - 9)})`, "data-type-icon": icon },
		iconMarkup(paths, ink),
	);
}

export { FALLBACK_ICON, glyphGroup };

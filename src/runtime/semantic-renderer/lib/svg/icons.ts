// Render the installed Remix Icon geometry into the standalone SVG.
import * as RemixIcons from "@remixicon/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { coord } from "@/runtime/semantic-renderer/lib/geometry";
import { wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";

const icons = new Map(Object.entries(RemixIcons));

/**
 * A configured icon, centered inside its type chip.
 * @param icon RemixIcon export name, validated by the policy owner.
 * @param cx Horizontal center.
 * @param cy Vertical center.
 * @param ink Type color, independently of body scope.
 * @returns Self-contained SVG geometry.
 */
function glyphGroup(icon: string, cx: number, cy: number, ink: string): string {
	const Icon = icons.get(icon) ?? RemixIcons.RiQuestionLine;
	return wrap(
		"g",
		{ transform: `translate(${coord(cx - 9)},${coord(cy - 9)})`, "data-type-icon": icon },
		renderToStaticMarkup(createElement(Icon, { size: 18, color: ink, "aria-hidden": true })),
	);
}

export { glyphGroup };

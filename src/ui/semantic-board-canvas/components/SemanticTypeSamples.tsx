// How the picture draws a kind, in small: a node kind's chip with its icon, and
// a relationship kind's line with its dash and arrowhead. The legend keys the
// picture with them, and a subject's tip says with them what the subject is.

import { useMemo, type JSX } from "react";

import { lineInk } from "@/transformers/semantic-renderer/index";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import { paletteInk } from "@/ui/semantic-board-canvas/lib/palette";

/**
 * Show the configured relationship color, dash and arrowhead.
 * @param props One applied relationship.
 * @param props.appearance The line appearance.
 * @returns The line sample.
 */
function RelationshipSample(props: { readonly appearance: AppliedAppearance }): JSX.Element {
	const { appearance } = props;
	// Drawn in the picture's own expression for it: a coloured line at its line
	// strength over the page, the neutral line as it is.
	const style = useMemo(
		() => ({ color: lineInk(paletteInk(appearance.lineColor, "--diagram-edge")) }),
		[appearance.lineColor],
	);
	const dash =
		appearance.dash === "dotted" ? "1 4" : appearance.dash === "dashed" ? "6 4" : undefined;
	return (
		<svg
			aria-hidden="true"
			width="36"
			height="20"
			viewBox="0 0 36 20"
			className="shrink-0"
			style={style}
		>
			<path
				d="M1 10H30"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeDasharray={dash}
			/>
			{appearance.arrowhead !== "none" && (
				<path
					d="m25 5 7 5-7 5"
					fill={appearance.arrowhead === "filled" ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			)}
		</svg>
	);
}

/**
 * A sample of a type chip’s independently colored border and tint.
 * @param props The type color.
 * @param props.appearance Applied type color and the renderer’s icon.
 * @returns The chip.
 */
function TypeSample(props: { readonly appearance: AppliedAppearance }): JSX.Element {
	const { appearance } = props;
	const markup = useMemo(() => ({ __html: appearance.iconSvg }), [appearance.iconSvg]);
	const style = useMemo(
		() => ({
			borderColor: paletteInk(appearance.typeColor),
			backgroundColor: `color-mix(in srgb, ${paletteInk(appearance.typeColor)} 12%, transparent)`,
		}),
		[appearance.typeColor],
	);
	return (
		<span
			aria-hidden="true"
			className="flex size-6 shrink-0 items-center justify-center rounded-sm border"
			style={style}
			dangerouslySetInnerHTML={markup}
		/>
	);
}

export { RelationshipSample, TypeSample };

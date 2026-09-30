// How the picture draws a kind, in small: a node kind's chip with its icon, and
// a relationship kind's line with its dash and arrowhead. The legend keys the
// picture with them, and a subject's tip says with them what the subject is.
// So do the marks a line and a subject carry beside their kind: how heavy a
// line is drawn, the streaks that ride it, and the pin a proposal puts on what
// it changed. A key's symbol is the picture's symbol, or it keys nothing.

import { useMemo, type JSX, type ReactNode } from "react";

import {
	lineInk,
	standingMark,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/index";
import { cn } from "@/ui/components/class-names";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import { paletteInk } from "@/ui/semantic-board-canvas/lib/palette";

/** How high every line sample is drawn, and where its line runs. */
const LINE_BOX = { height: 20, middle: 10 } as const;

/**
 * A line sample's frame: a box as wide as asked, coloured by `color`.
 * @param props Its width, its colour and its strokes.
 * @param props.width How wide the sample is.
 * @param props.color The ink its strokes take through currentColor.
 * @param props.children The strokes.
 * @returns The frame.
 */
function LineFrame(props: {
	readonly width: number;
	readonly color: string;
	readonly children: ReactNode;
}): JSX.Element {
	const style = useMemo(() => ({ color: props.color }), [props.color]);
	return (
		<svg
			aria-hidden="true"
			width={props.width}
			height={LINE_BOX.height}
			viewBox={`0 0 ${props.width} ${LINE_BOX.height}`}
			className="shrink-0"
			style={style}
		>
			{props.children}
		</svg>
	);
}

/**
 * Show the configured relationship color, dash and arrowhead.
 * @param props One applied relationship, and how long to draw it.
 * @param props.appearance The line appearance.
 * @param props.width How wide the sample is; 36 unless the place it sits in asks otherwise.
 * @returns The line sample.
 */
function RelationshipSample(props: {
	readonly appearance: AppliedAppearance;
	readonly width?: number;
}): JSX.Element {
	const { appearance } = props;
	const width = props.width ?? 36;
	// Drawn in the picture's own expression for it: a coloured line at its line
	// strength over the page, the neutral line as it is.
	const ink = lineInk(paletteInk(appearance.lineColor, "--diagram-edge"));
	const dash =
		appearance.dash === "dotted" ? "1 4" : appearance.dash === "dashed" ? "6 4" : undefined;
	return (
		<LineFrame width={width} color={ink}>
			<path
				d={`M1 ${LINE_BOX.middle}H${width - 6}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeDasharray={dash}
			/>
			{appearance.arrowhead !== "none" && (
				<path
					d={`m${width - 11} 5 7 5-7 5`}
					fill={appearance.arrowhead === "filled" ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			)}
		</LineFrame>
	);
}

/** The neutral line the two line marks are keyed on. */
const NEUTRAL_LINE = "var(--diagram-edge)";

/**
 * A heavier line than the kinds' samples: what an author's emphasis draws.
 * @param props How wide the sample is.
 * @param props.width The width.
 * @returns The sample.
 */
function EmphasisSample(props: { readonly width: number }): JSX.Element {
	return (
		<LineFrame width={props.width} color={NEUTRAL_LINE}>
			<path
				d={`M1 ${LINE_BOX.middle}H${props.width - 1}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.6"
			/>
		</LineFrame>
	);
}

/**
 * A line with a streak on it, the still shape of the shots that fly along a
 * line whose author illustrated its traffic.
 * @param props How wide the sample is.
 * @param props.width The width.
 * @returns The sample.
 */
function TrafficSample(props: { readonly width: number }): JSX.Element {
	const middle = props.width / 2;
	return (
		<LineFrame width={props.width} color={NEUTRAL_LINE}>
			<path
				d={`M1 ${LINE_BOX.middle}H${props.width - 1}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			<path
				d={`M${middle - 5} ${LINE_BOX.middle}H${middle + 5}`}
				fill="none"
				stroke="var(--foreground)"
				strokeWidth="3.5"
				strokeLinecap="round"
			/>
		</LineFrame>
	);
}

/**
 * A sample of a type chip’s independently colored border and tint.
 * @param props The type color, and the chip's size when the place it sits in sets one.
 * @param props.appearance Applied type color and the renderer’s icon.
 * @param props.className Its size, when not the tip's 24 px.
 * @returns The chip.
 */
function TypeSample(props: {
	readonly appearance: AppliedAppearance;
	readonly className?: string;
}): JSX.Element {
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
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-sm border",
				props.className,
			)}
			style={style}
			dangerouslySetInnerHTML={markup}
		/>
	);
}

/**
 * The pin a proposal puts on the corner of a subject of one standing, drawn by
 * the renderer that draws it on the picture.
 * @param props The standing.
 * @param props.standing How the subject stands.
 * @returns The pin, 12 px across.
 */
function StandingSample(props: { readonly standing: SubjectStanding }): JSX.Element {
	const markup = useMemo(() => ({ __html: standingMark(props.standing) }), [props.standing]);
	return (
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="-10 -10 20 20"
			className="shrink-0"
			dangerouslySetInnerHTML={markup}
		/>
	);
}

export { EmphasisSample, RelationshipSample, StandingSample, TrafficSample, TypeSample };

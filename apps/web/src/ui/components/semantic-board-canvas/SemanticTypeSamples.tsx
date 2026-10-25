// How the picture draws a kind, in small: a node kind's chip with its icon, and
// a relationship kind's line with its dash and arrowhead. The legend keys the
// picture with them, and a subject's tip says with them what the subject is.
// So do the marks a line and a subject carry beside their kind: how heavy a
// line is drawn, the pulses that ride it, and the pin a proposal puts on what
// it changed. A key's symbol is the picture's symbol, or it keys nothing.

import { useId, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";

import {
	HEAD_LENGTH,
	lineInk,
	OPEN_ARM,
	PULSE_BREADTH,
	pulseInk,
	lineWidth,
	standingMark,
	type SubjectStanding,
} from "@archboard/renderer/picture";
import { cn } from "@archboard/ui-kit/components";
import type { AppliedAppearance } from "@archboard/renderer/picture";
import { paletteInk } from "#ui/rules/semantic-board-canvas/board/palette.ts";

/** How high every line sample is drawn, and where its line runs. */
const LINE_BOX = { height: 20, middle: 10 } as const;

/** A line the way the picture draws one its author gave no emphasis. */
const PLAIN_WIDTH = lineWidth("normal");

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
	const ink = lineInk(appearance.lineColor);
	const dash =
		appearance.dash === "dotted" ? "1 4" : appearance.dash === "dashed" ? "6 4" : undefined;
	const tip = width - 1;
	const filled = appearance.arrowhead === "filled";
	// A filled head covers the end of its line. An open head's arms meet where its line ends.
	const end = filled ? tip - HEAD_LENGTH / 2 : tip;
	return (
		<LineFrame width={width} color={ink}>
			<path
				d={`M1 ${LINE_BOX.middle}H${end}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={PLAIN_WIDTH}
				strokeDasharray={dash}
			/>
			{appearance.arrowhead !== "none" && <ArrowHead filled={filled} tip={tip} />}
		</LineFrame>
	);
}

/**
 * An arrowhead as the picture draws it: the ten-unit drawing of its marker, in
 * a square as large as the picture's head. A filled head fills the square. An
 * open head's arms run into the tip.
 * @param props Its form and where its tip is.
 * @param props.filled Whether the head is filled.
 * @param props.tip Where its tip is, on the line.
 * @returns The head.
 */
function ArrowHead(props: { readonly filled: boolean; readonly tip: number }): JSX.Element {
	return (
		<svg
			x={props.tip - HEAD_LENGTH}
			y={LINE_BOX.middle - HEAD_LENGTH / 2}
			width={HEAD_LENGTH}
			height={HEAD_LENGTH}
			viewBox="0 0 10 10"
		>
			{props.filled ? (
				<path d="M0 0L10 5L0 10Z" fill="currentColor" />
			) : (
				<path
					d="M2 1L10 5L2 9"
					fill="none"
					stroke="currentColor"
					strokeWidth={OPEN_ARM}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)}
		</svg>
	);
}

/** The neutral line the two line marks are keyed on. */
const NEUTRAL_LINE = "var(--diagram-edge)";

/**
 * A heavier line than the kinds' samples, at the width the picture draws the
 * line its author emphasised most.
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
				strokeWidth={lineWidth("hero")}
			/>
		</LineFrame>
	);
}

/** The picture's own proportions of a pulse in small: how thick its core is, and how long its light runs. */
const PULSE = { width: PULSE_BREADTH, span: 40, glow: 3 } as const;

/** The light of a pulse on the neutral line: the line's colour with white mixed in, as the picture draws it. */
const PULSE_LIGHT: CSSProperties = { stopColor: pulseInk(undefined) };

/**
 * The light of a pulse along its length: nothing, a tail that gathers toward a
 * bright head, and a short soft front.
 */
const PULSE_STOPS = [
	[0, 0],
	[0.35, 0.05],
	[0.6, 0.2],
	[0.78, 0.5],
	[0.9, 1],
	[1, 0],
] as const;

/**
 * A line with a pulse on it, the still shape of the beams that fly along a line
 * whose author illustrated its traffic: a gradient of light that gathers toward
 * a head, in a soft glow.
 * @param props How wide the sample is.
 * @param props.width The width.
 * @returns The sample.
 */
function TrafficSample(props: { readonly width: number }): JSX.Element {
	const gradient = `pulse-${useId().replaceAll(":", "")}`;
	const front = props.width / 2 + PULSE.span / 2;
	const run = `M${front - PULSE.span} ${LINE_BOX.middle}H${front}`;
	return (
		<LineFrame width={props.width} color={NEUTRAL_LINE}>
			<defs>
				<linearGradient
					id={gradient}
					gradientUnits="userSpaceOnUse"
					x1={front - PULSE.span}
					x2={front}
					y1="0"
					y2="0"
				>
					{PULSE_STOPS.map(([offset, light]) => (
						<stop key={offset} offset={offset} style={PULSE_LIGHT} stopOpacity={light} />
					))}
				</linearGradient>
			</defs>
			<path
				d={`M1 ${LINE_BOX.middle}H${props.width - 1}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={PLAIN_WIDTH}
			/>
			<path
				d={run}
				fill="none"
				stroke={`url(#${gradient})`}
				strokeOpacity="0.25"
				strokeWidth={PULSE.width + PULSE.glow}
			/>
			<path d={run} fill="none" stroke={`url(#${gradient})`} strokeWidth={PULSE.width} />
		</LineFrame>
	);
}

/**
 * A type chip as the picture draws it: a low tile raised off the ground, its
 * face and its front edge tinted by its kind's colour, the light of
 * `--slab-sheen` falling off down its face. The shell's raised elevation
 * lights its top edge and seats it. Its `--highlight` is the light the
 * picture's chip takes on its top edge.
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
	const style = useMemo(() => chipPaint(paletteInk(appearance.typeColor)), [appearance.typeColor]);
	return (
		<span
			aria-hidden="true"
			className={cn(
				"shadow-raised flex size-6 shrink-0 items-center justify-center rounded-[21%] border-b-[1.5px]",
				props.className,
			)}
			style={style}
			dangerouslySetInnerHTML={markup}
		/>
	);
}

/** A share of a colour, in percent, on the light ground and on the dark one. */
interface Share {
	readonly light: number;
	readonly dark: number;
}

/**
 * How much of its kind's colour a chip's face and its front edge carry: the
 * shares the picture's chip takes (`typeChip` in the renderer's
 * `crates/archboard-scene/src/paint/appearance.rs`).
 */
const CHIP_FACE: Share = { light: 14, dark: 20 };
const CHIP_EDGE: Share = { light: 45, dark: 20 };

/**
 * A colour tinted by an ink, as much as each ground asks for.
 * @param base The colour.
 * @param ink The ink.
 * @param share How much of the ink, on each ground.
 * @returns The tinted colour.
 */
function tinted(base: string, ink: string, share: Share): string {
	return `light-dark(color-mix(in srgb, ${ink} ${share.light}%, ${base}), color-mix(in srgb, ${ink} ${share.dark}%, ${base}))`;
}

/**
 * How a chip of one kind's colour is painted: its face, the light on it and its front edge.
 * @param ink The kind's colour.
 * @returns The chip's style.
 */
function chipPaint(ink: string): CSSProperties {
	return {
		backgroundColor: tinted("var(--slab-face)", ink, CHIP_FACE),
		backgroundImage: "linear-gradient(var(--slab-sheen), transparent)",
		borderBottomColor: tinted("var(--slab-edge)", ink, CHIP_EDGE),
	};
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

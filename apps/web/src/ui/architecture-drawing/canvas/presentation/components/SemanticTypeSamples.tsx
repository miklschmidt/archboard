// How the picture draws a kind, in small: a node kind's chip with its icon, and
// a relationship kind's line with its dash and arrowhead. The legend keys the
// picture with them, and a subject's tip says with them what the subject is.
// So do the marks a line and a subject carry beside their kind: how heavy a
// line is drawn, the pulses that ride it, and the pin a proposal puts on what
// it changed. A key's symbol is the picture's symbol, or it keys nothing, so
// every sample but the chip is the renderer's own finished markup.

import { useId, useMemo, type CSSProperties, type JSX } from "react";

import { markSample, type MarkSample, type SubjectStanding } from "@archboard/renderer/picture";
import { cn } from "@archboard/ui-kit/components";
import { uncoloured } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import type { AppliedAppearance } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { paletteInk } from "#ui/architecture-drawing/canvas/picture/rules/palette.ts";

/**
 * One of the renderer's samples, as it finishes it.
 * @param props The sample, and how wide the place it sits in makes it.
 * @param props.sample Which sample.
 * @param props.width How wide a line sample is; the renderer's default when absent.
 * @returns The sample.
 */
function Sample(props: {
	readonly sample: MarkSample;
	readonly width?: number | undefined;
}): JSX.Element {
	const id = useId().replaceAll(":", "");
	const { sample, width } = props;
	const markup = useMemo(
		() => ({ __html: markSample(sample, { width, id }) }),
		[sample, width, id],
	);
	return (
		<span aria-hidden="true" className="inline-flex shrink-0" dangerouslySetInnerHTML={markup} />
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
	const { lineColor, dash, arrowhead } = props.appearance;
	const sample = useMemo(
		(): MarkSample => ({ kind: "line", color: lineColor, dash, arrowhead }),
		[lineColor, dash, arrowhead],
	);
	return <Sample sample={sample} width={props.width} />;
}

/** The heavier line of the most emphasis, and the pulse a line with traffic carries. */
const EMPHASIS: MarkSample = { kind: "emphasis" };
const TRAFFIC: MarkSample = { kind: "traffic" };

/**
 * A heavier line than the kinds' samples, at the width the picture draws the
 * line its author emphasised most.
 * @param props How wide the sample is.
 * @param props.width The width.
 * @returns The sample.
 */
function EmphasisSample(props: { readonly width: number }): JSX.Element {
	return <Sample sample={EMPHASIS} width={props.width} />;
}

/**
 * A line with a pulse on it, the still shape of the beams that fly along a line
 * whose author illustrated its traffic.
 * @param props How wide the sample is.
 * @param props.width The width.
 * @returns The sample.
 */
function TrafficSample(props: { readonly width: number }): JSX.Element {
	return <Sample sample={TRAFFIC} width={props.width} />;
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
	// A door draws its icon in a door's dark ink. A chip draws it in its kind's colour, as a card does.
	const markup = useMemo(() => ({ __html: uncoloured(appearance.iconSvg) }), [appearance.iconSvg]);
	const style = useMemo(() => chipPaint(paletteInk(appearance.typeColor)), [appearance.typeColor]);
	return (
		<span
			aria-hidden="true"
			className={cn(
				"shadow-raised flex size-6 shrink-0 items-center justify-center rounded-[21%] border-b-[1.5px] [&>svg]:fill-current",
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
 * How a chip of one kind's colour is painted: its icon, its face, the light on it and its front edge.
 * @param ink The kind's colour.
 * @returns The chip's style.
 */
function chipPaint(ink: string): CSSProperties {
	return {
		color: ink,
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
	const sample = useMemo(
		(): MarkSample => ({ kind: "standing", standing: props.standing }),
		[props.standing],
	);
	return <Sample sample={sample} />;
}

export { EmphasisSample, RelationshipSample, StandingSample, TrafficSample, TypeSample };

// The little picture that every wait for a drawing shows. Its motion is in app.css.

import type { JSX } from "react";

/** The cards of the little picture, by their top left corners. */
const MARK_CARDS = [
	[1, 1],
	[22, 1],
	[11.5, 11],
] as const;

/**
 * The lines of the little picture, in the order a spark draws them: each line,
 * its arrowhead, and the two ways round the card it lands on.
 */
const MARK_LINES = [
	{
		path: "M10 4H22",
		head: "M19.6 2.6L22 4L19.6 5.4Z",
		rims: [
			"M22 4V2.5A1.5 1.5 0 0 1 23.5 1H29.5A1.5 1.5 0 0 1 31 2.5V4",
			"M22 4V5.5A1.5 1.5 0 0 0 23.5 7H29.5A1.5 1.5 0 0 0 31 5.5V4",
		],
	},
	{
		path: "M26.5 7V12A2 2 0 0 1 24.5 14H20.5",
		head: "M22.9 12.6L20.5 14L22.9 15.4Z",
		rims: [
			"M20.5 14V12.5A1.5 1.5 0 0 0 19 11H13A1.5 1.5 0 0 0 11.5 12.5V14",
			"M20.5 14V15.5A1.5 1.5 0 0 1 19 17H13A1.5 1.5 0 0 1 11.5 15.5V14",
		],
	},
] as const;

/**
 * A little picture that a spark draws again and again while a drawing is awaited,
 * as the picture itself arrives (DESIGN.md, The Spark Rule).
 * @param props Its size.
 * @param props.large Twice the size of the mark in a wait notice, for the middle of a pane.
 * @returns The mark, which assistive technology skips.
 */
function DrawingMark(props: { readonly large?: boolean }): JSX.Element {
	return (
		<svg
			data-slot="drawing-mark"
			data-size={props.large === true ? "large" : undefined}
			viewBox="0 0 32 18"
			aria-hidden="true"
			focusable="false"
		>
			{MARK_CARDS.map(([x, y]) => (
				<rect key={`${x} ${y}`} data-part="card" x={x} y={y} width="9" height="6" rx="1.5" />
			))}
			<g data-part="round">
				{MARK_LINES.map((line, index) => (
					<g key={line.path} data-line={index + 1}>
						<path data-part="ink" pathLength={1} d={line.path} />
						<path data-part="head" d={line.head} />
						{line.rims.map((rim) => (
							<path key={rim} data-part="rim" pathLength={1} d={rim} />
						))}
						<path data-part="glow" pathLength={1} d={line.path} />
						<path data-part="spark" pathLength={1} d={line.path} />
					</g>
				))}
			</g>
		</svg>
	);
}

export { DrawingMark };

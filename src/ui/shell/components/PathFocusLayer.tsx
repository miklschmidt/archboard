// The path-focus dimming: a pointer-transparent layer over one stage that
// darkens everything except the rectangles of the connected elements. It is
// presentation only and never touches the board.

import { useId, type JSX } from "react";

import type { PathFocusOverlay, ViewportRectangle } from "@/ui/path-focus";

/** Inputs for the overlay layer. */
interface PathFocusLayerProps {
	overlay: PathFocusOverlay;
}

/** Inputs for one hole in the mask. */
interface HoleProps {
	rectangle: ViewportRectangle;
}

/**
 * One rectangle cut out of the dimming.
 * @param props The rectangle in stage pixels.
 * @returns A black mask rectangle.
 */
function Hole(props: HoleProps): JSX.Element {
	const { x, y, width, height } = props.rectangle;
	return <rect x={x} y={y} width={width} height={height} rx={2} fill="black" />;
}

/**
 * The cobalt ring drawn around one focused element.
 * @param props The rectangle in stage pixels.
 * @returns A stroked rectangle.
 */
function Ring(props: HoleProps): JSX.Element {
	const { x, y, width, height } = props.rectangle;
	return (
		<rect
			x={x}
			y={y}
			width={width}
			height={height}
			rx={2}
			fill="none"
			className="stroke-primary"
			strokeWidth={1.5}
		/>
	);
}

/**
 * A stable key for a rectangle, which has no identity of its own.
 * @param rectangle The rectangle.
 * @returns Its four sides joined.
 */
function rectangleKey(rectangle: ViewportRectangle): string {
	return `${rectangle.x}:${rectangle.y}:${rectangle.width}:${rectangle.height}`;
}

/**
 * The dimming layer for one stage.
 * @param props The overlay: which rectangles stay clear.
 * @returns An SVG the pointer passes straight through.
 */
function PathFocusLayer(props: PathFocusLayerProps): JSX.Element {
	const maskId = useId();
	const { rectangles } = props.overlay;
	return (
		<svg
			aria-hidden="true"
			data-slot="path-focus-overlay"
			className="pointer-events-none absolute inset-0 size-full"
		>
			<mask id={maskId}>
				<rect width="100%" height="100%" fill="white" />
				{rectangles.map((rectangle) => (
					<Hole key={rectangleKey(rectangle)} rectangle={rectangle} />
				))}
			</mask>
			<rect
				width="100%"
				height="100%"
				mask={`url(#${maskId})`}
				className="fill-background/70 dark:fill-background/75"
			/>
			{rectangles.map((rectangle) => (
				<Ring key={rectangleKey(rectangle)} rectangle={rectangle} />
			))}
		</svg>
	);
}

export { PathFocusLayer, type PathFocusLayerProps };

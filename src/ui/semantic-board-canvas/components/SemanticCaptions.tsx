import { useMemo, type CSSProperties, type JSX } from "react";

import type { Camera } from "@/ui/semantic-board-canvas/lib/camera";
import { pictureCaptions, type PictureCaption } from "@/ui/semantic-board-canvas/lib/captions";

/** The smallest drawn name, in screen pixels, a reader reads without the overlay. */
const READABLE = 12;
/** How far a caption sits in from its region's corner, in screen pixels. */
const INSET = 4;
/** How each kind of name is set: a group's in its colour and boldest, a card's quietest. */
const WEIGHT: Readonly<Record<PictureCaption["kind"], string>> = {
	group: "truncate text-[14px] font-semibold",
	container: "truncate text-[13px] font-medium text-foreground",
	// A card's name may take a second line: a card is narrow on screen long before it is short.
	card: "line-clamp-2 break-words text-[11.5px] font-medium text-foreground",
};
/** The narrowest a region can be on screen and still carry a caption. */
const NARROWEST = 48;

/**
 * The names of a picture's cards, containers and group regions, at a size
 * that stays readable however far the camera is out. Each one shows only
 * while the picture's own name for it is too small to read, and sits on it,
 * so the page reads like a map: every region and card named at a glance, the
 * rest read by zooming in.
 * @param props The picture and the camera.
 * @param props.svg The picture.
 * @param props.view Where the camera is.
 * @param props.easing Whether the surface eases its moves, which the captions follow.
 * @returns The captions layer.
 */
function SemanticCaptions(props: {
	readonly svg: string;
	readonly view: Camera;
	readonly easing: boolean;
}): JSX.Element {
	const captions = useMemo(() => pictureCaptions(props.svg), [props.svg]);
	return (
		<div
			data-slot="semantic-board-captions"
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			{captions.map((caption) => (
				<Caption key={caption.id} caption={caption} view={props.view} easing={props.easing} />
			))}
		</div>
	);
}

/**
 * One region's name, placed on its region's corner.
 * @param props The caption and the camera.
 * @param props.caption The caption.
 * @param props.view Where the camera is.
 * @param props.easing Whether it eases its moves.
 * @returns The caption.
 */
function Caption(props: {
	readonly caption: PictureCaption;
	readonly view: Camera;
	readonly easing: boolean;
}): JSX.Element {
	const { caption, view } = props;
	const room = caption.box.width * view.scale - 2 * INSET;
	const shown = view.scale * caption.size < READABLE && room >= NARROWEST;
	const style = useMemo<CSSProperties>(
		() => ({
			transform: `translate(${view.x + caption.box.x * view.scale + INSET}px, ${view.y + caption.box.y * view.scale + INSET}px)`,
			maxWidth: Math.max(0, room),
			...(caption.color === undefined
				? {}
				: {
						color: `color-mix(in oklab, var(--semantic-${caption.color}) 70%, var(--foreground))`,
					}),
		}),
		[view.x, view.y, view.scale, caption, room],
	);
	const motion = props.easing
		? "transition-[transform,opacity] duration-100 ease-out"
		: "transition-opacity duration-100";
	const weight = WEIGHT[caption.kind];
	return (
		<span
			data-slot="semantic-board-caption"
			data-kind={caption.kind}
			data-shown={shown}
			className={`bg-background/85 absolute top-0 left-0 rounded-sm px-1.5 py-0.5 leading-tight ${weight} ${motion} ${shown ? "opacity-100" : "opacity-0"}`}
			style={style}
		>
			{caption.text}
		</span>
	);
}

export { SemanticCaptions };

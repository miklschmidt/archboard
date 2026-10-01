// The gold signs on the bottom edge of every card that opens a deeper board,
// each saying which board it opens.
//
// They are a layer over the picture, drawn from its atlas, which holds the box
// of every subject. The layer has the surface's own transform, so the signs
// move and scale with the camera and stand on their cards whatever the zoom.
// The picture itself is the renderer's and is not changed.

import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, JSX, MouseEvent, PointerEvent } from "react";

import type { SemanticNode } from "@/shared/semantic-board/index";
import type { SemanticAtlas, SemanticBox } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { useSemanticBoardChanges } from "@/ui/semantic-board-canvas/hooks/use-semantic-board-changes";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { drillTargetName } from "@/ui/semantic-board-canvas/lib/drill-target";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";

/** How tall a sign is at a scale where the picture is read at its own size, in the picture's own units. */
const SIGN_HEIGHT = 20;

/** The text of a sign at that scale, in the picture's own units. */
const SIGN_TEXT = 11;

/**
 * How far a sign reaches up over its card's bottom edge, in the picture's own
 * units: past the card's rounded corners, so the two read as one piece.
 */
const SIGN_LAP = 6;

/**
 * How much bigger a sign is drawn than the picture is, so that it stays legible
 * where the camera is drawn back to fit a whole board: the sign is a way
 * through to another board, and a sign too small to read is no sign.
 * @param scale How magnified the picture is.
 * @returns A factor of at least one.
 */
function signUnit(scale: number): number {
	return Math.min(2, Math.max(1, 0.8 / scale));
}

/** Inputs for one sign. */
interface SignProps {
	/** The card the sign stands on. */
	readonly node: SemanticNode;
	/** Where the card is. */
	readonly box: SemanticBox;
	/**
	 * Open the board the card leads to.
	 * @param id The card's id.
	 */
	readonly onOpen: (id: string) => void;
	/** The factor the sign is drawn larger by. */
	readonly unit: number;
}

/**
 * Keep a press on a sign from becoming a pan or a pick of the picture under it.
 * @param event The pointer event.
 */
function keepToSign(event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>): void {
	event.stopPropagation();
}

/**
 * One sign: it names the board its card opens, and opens it.
 * @param props The card, where it is and how to open it.
 * @returns The sign.
 */
function Sign(props: SignProps): JSX.Element | null {
	const { node, box, onOpen } = props;
	const target = node.drillDown;
	const document = useQuery({
		...semanticBoardDocumentQuery(target?.board ?? ""),
		enabled: target !== undefined,
	});
	const name = target === undefined ? "" : drillTargetName(target, document.data);
	useSemanticBoardChanges(target?.board ?? "", name);
	if (target === undefined) {
		return null;
	}
	// As wide as its card, and wider while the card is too narrow for the name at
	// the size the sign is drawn: it then grows out of the card's middle.
	const place: CSSProperties = {
		left: box.x + box.width / 2,
		top: box.y + box.height - SIGN_LAP,
		minWidth: box.width,
		width: "max-content",
		maxWidth: box.width * 2.4,
		transform: "translateX(-50%)",
		height: SIGN_HEIGHT * props.unit + SIGN_LAP,
		fontSize: SIGN_TEXT * props.unit,
	};
	return (
		<button
			type="button"
			data-slot="drill-sign"
			data-sign-for={node.id}
			title={`Open ${name}`}
			aria-label={`Open ${name}`}
			style={place}
			onPointerDown={keepToSign}
			onPointerUp={keepToSign}
			onClick={(event) => {
				keepToSign(event);
				onOpen(node.id);
			}}
			onDoubleClick={keepToSign}
			className="gold-sign pointer-events-auto absolute flex cursor-pointer items-end justify-between gap-1.5 rounded-b-[6px] px-[0.9em] leading-none font-bold hover:brightness-105"
			// The text sits in the part of the sign below the card's edge.
		>
			<span
				className="min-w-0 truncate"
				style={{ paddingBottom: `${0.55 * props.unit * SIGN_TEXT}px` }}
			>
				{name}
			</span>
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true"
				className="size-[1.35em] shrink-0"
				style={{ marginBottom: `${0.4 * props.unit * SIGN_TEXT}px` }}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M4 12h15M13 6l6 6-6 6" />
			</svg>
		</button>
	);
}

/** Inputs for the layer. */
interface DrillSignsProps {
	/** Where every subject of the picture ended up. */
	readonly atlas: SemanticAtlas;
	/** What the board says about the variant the picture draws. */
	readonly reading: VariantReading | null;
	/** Names the picture and the board version it is, so a new picture's signs arrive afresh. */
	readonly arrival: string;
	/** How magnified the picture is. */
	readonly scale: number;
	/** The surface's own classes and transform, so the layer moves with the camera. */
	readonly className: string;
	readonly style: CSSProperties;
	/**
	 * Open the board a card leads to.
	 * @param id The card's id.
	 */
	readonly onOpen: (id: string) => void;
}

/**
 * The layer of signs over the picture.
 * @param props The atlas, what the board says, the surface's transform and what a sign does.
 * @returns The layer, or nothing when no card opens a deeper board.
 */
function DrillSigns(props: DrillSignsProps): JSX.Element | null {
	const { atlas, reading } = props;
	const cards = (reading?.variant?.content.nodes ?? []).flatMap((node) => {
		const box = atlas.nodes[node.id];
		return node.drillDown === undefined || box === undefined ? [] : [{ node, box }];
	});
	if (cards.length === 0) {
		return null;
	}
	return (
		<div
			key={props.arrival}
			data-slot="semantic-drill-signs"
			style={props.style}
			className={`${props.className} pointer-events-none animate-[sign-arrive_260ms_ease-out_220ms_backwards] motion-reduce:animate-none`}
		>
			{cards.map(({ node, box }) => (
				<Sign
					key={node.id}
					node={node}
					box={box}
					onOpen={props.onOpen}
					unit={signUnit(props.scale)}
				/>
			))}
		</div>
	);
}

export { DrillSigns, type DrillSignsProps };

// The foot of a presented walkthrough's box: where the voice is in it.
//
// It is a pill, as high as the voice box that floats over a picture when nothing is presented, and
// it is there for as long as the shell has a voice to offer. So the box keeps one height whether
// voice is off, starting, speaking or over, and the picture does not move with it. While voice is off
// it holds the one key that starts it for this walkthrough, Narrate, and the key is a circle where
// the orb will be lit, so the orb takes the key's place and the pill does not change shape. While a
// voice is live and the shell has a place for it here, what the shell lays over the picture is drawn
// inside the pill instead, and it is told where it is drawn (use-overlay-place) so it draws itself
// to fit; the key then gives way to it (app.css, `semantic-presentation-foot`). The pill is as wide
// as the words above it. Keyboard focus is not left on a key that gives way: pressing Narrate hands
// it to the pill, from where Tab goes on to the voice box's keys.

import { RiMicLine } from "@remixicon/react";
import { useCallback, useRef, type CSSProperties, type JSX, type ReactNode } from "react";

import { VOICE_MS } from "@archboard/timing";
import { cn } from "@archboard/ui-kit/class-names";
import { OverlayPlaceContext } from "#ui/hooks/semantic-board-canvas/use-overlay-place.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";

/** The paces the stylesheet crossfades the key and the voice box by (app.css, `semantic-presentation-narrate`). */
const FOOT_STYLE: CSSProperties = {
	"--voice-box-in-ms": `${VOICE_MS.boxIn}ms`,
	"--voice-box-out-ms": `${VOICE_MS.boxOut}ms`,
};

/** What the key says while a narration can start. */
const NARRATE_HINT = "Hear this walkthrough read aloud.";

/** The circle where the orb will be lit: the plate the orb stands on, with the microphone on it. */
const SEAT = cn(
	"border-border bg-card text-muted-foreground shadow-raised m-1.5 grid size-16 shrink-0 place-items-center",
	"dark:border-input dark:bg-input/30 rounded-full border transition-[border-color,color,box-shadow]",
	"group-hover/narrate:border-primary-mark group-hover/narrate:text-primary-mark",
	"group-active/narrate:shadow-pressed",
);

/** Inputs for the key that has the walkthrough narrated. */
interface NarrateKeyProps {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** What the shell offers. */
	readonly narration: WalkthroughNarration;
	/** Called once a narration has been asked for. */
	readonly onAsked: () => void;
}

/**
 * The key that has the walkthrough narrated, from its first step. It stays where it is while a
 * narration cannot start, so nothing around it moves: it is dimmed, and says why where it says what it
 * does.
 * @param props The walkthrough, the narration and what to do once one is asked for.
 * @returns The key, which fills the pill.
 */
function NarrateKey(props: NarrateKeyProps): JSX.Element {
	const { walkthrough, narration, onAsked } = props;
	const { held, start } = narration;
	// A narration starts on the first step whatever the reader had reached; the server opens it
	// once voice is starting, so the voice is handed the step it arrived on.
	const narrate = useCallback((): void => {
		start(walkthrough);
		onAsked();
	}, [start, walkthrough, onAsked]);
	const dimmed = held !== null;
	return (
		<button
			type="button"
			data-slot="semantic-presentation-narrate"
			aria-disabled={dimmed ? true : undefined}
			onClick={dimmed ? undefined : narrate}
			className={cn(
				"group/narrate focus-visible:ring-ring absolute inset-0 flex items-center gap-3 rounded-full pr-6 text-left outline-none focus-visible:ring-2",
				dimmed ? "cursor-default opacity-60" : "cursor-pointer",
			)}
		>
			<span aria-hidden="true" className={cn(SEAT, dimmed && "group-hover/narrate:border-border")}>
				<RiMicLine className="size-5" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="text-control font-medium">Narrate</span>
				<span className="text-body text-muted-foreground truncate">{held ?? NARRATE_HINT}</span>
			</span>
		</button>
	);
}

/** Inputs for the foot. */
interface PresentationFootProps {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** Narrating the walkthrough aloud, when the shell can. */
	readonly narration?: WalkthroughNarration | undefined;
	/** What the shell lays over the picture, such as a voice and its subtitles; drawn here, in the pill. */
	readonly overlay?: ReactNode;
	/** What places the pill in the box. */
	readonly className?: string;
}

/** What names the pill while it holds the key that narrates. */
const NARRATION_GROUP = { role: "group", "aria-label": "Narration" } as const;

/**
 * What the shell lays over the picture, drawn in the pill and told that it is. It takes no pointer
 * input of its own, so that a press reaches the key under it while there is nothing to press.
 * @param props What is laid.
 * @param props.overlay What the shell lays over the picture, or nothing.
 * @returns The layer, or null where nothing is laid.
 */
function LaidInPill(props: { readonly overlay: ReactNode }): JSX.Element | null {
	if (props.overlay === null || props.overlay === undefined) return null;
	return (
		<div className="pointer-events-none absolute inset-0 flex">
			<OverlayPlaceContext.Provider value="foot">{props.overlay}</OverlayPlaceContext.Provider>
		</div>
	);
}

/**
 * The foot of the box.
 * @param props The walkthrough, the narration, what the shell lays over the picture and what places the pill.
 * @returns The pill, or null where the shell has no voice to offer.
 */
function PresentationFoot(props: PresentationFootProps): JSX.Element | null {
	const { narration, overlay } = props;
	const foot = useRef<HTMLDivElement>(null);
	// The key that was pressed is about to give way to the voice box, so it hands over keyboard focus.
	const handOver = useCallback((): void => {
		foot.current?.focus({ preventScroll: true });
	}, []);
	if (narration === undefined && (overlay === null || overlay === undefined)) return null;
	return (
		<div
			ref={foot}
			tabIndex={-1}
			{...(narration === undefined ? undefined : NARRATION_GROUP)}
			data-slot="semantic-presentation-foot"
			style={FOOT_STYLE}
			className={cn(
				"border-border bg-sidebar shadow-well focus-visible:ring-ring relative isolate flex h-[78px] shrink-0 rounded-full border outline-none focus-visible:ring-2",
				props.className,
			)}
		>
			{narration !== undefined && (
				<NarrateKey walkthrough={props.walkthrough} narration={narration} onAsked={handOver} />
			)}
			<LaidInPill overlay={overlay} />
		</div>
	);
}

export { PresentationFoot, type PresentationFootProps };

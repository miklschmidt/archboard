// The foot of a presented walkthrough's box: where the voice is in it.
//
// It is a pill, as high as the voice box that floats over a picture when nothing is presented, and
// it is there for as long as the shell has a voice to offer. So the box keeps one height whether
// voice is off, starting, speaking or over, and the picture does not move with it. While voice is off
// it holds the one key that starts it for this walkthrough, Narrate, and the key is a circle where
// the orb will be lit, so the orb takes the key's place and the pill does not change shape. While a
// voice is live and the shell has a place for it here, what the shell lays over the picture is drawn
// inside the pill instead, and it is told where it is drawn (use-overlay-place) so it draws itself
// to fit; the key then gives way to it (app.css, `semantic-presentation-foot`).

import { RiMicLine } from "@remixicon/react";
import { useCallback, type CSSProperties, type JSX, type ReactNode } from "react";

import { VOICE_BOX_IN_MS, VOICE_BOX_OUT_MS } from "@/shared/timing/voice";
import { cn } from "@/ui/components/class-names";
import { OverlayPlaceContext } from "@/ui/semantic-board-canvas/hooks/use-overlay-place";
import type { WalkthroughNarration } from "@/ui/semantic-board-canvas/lib/narration";

/** The paces the stylesheet crossfades the key and the voice box by (app.css, `semantic-presentation-narrate`). */
const FOOT_STYLE: CSSProperties = {
	"--voice-box-in-ms": `${VOICE_BOX_IN_MS}ms`,
	"--voice-box-out-ms": `${VOICE_BOX_OUT_MS}ms`,
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
}

/**
 * The key that has the walkthrough narrated, from its first step. It stays where it is while a
 * narration cannot start, so nothing around it moves: it is dimmed, and says why where it says what it
 * does.
 * @param props The walkthrough and the narration.
 * @returns The key, which fills the pill.
 */
function NarrateKey(props: NarrateKeyProps): JSX.Element {
	const { walkthrough, narration } = props;
	const { held, start } = narration;
	// A narration starts on the first step whatever the reader had reached; the server opens it
	// once voice is starting, so the voice is handed the step it arrived on.
	const narrate = useCallback((): void => {
		start(walkthrough);
	}, [start, walkthrough]);
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
}

/**
 * The foot of the box.
 * @param props The walkthrough, the narration and what the shell lays over the picture.
 * @returns The pill, or null where the shell has no voice to offer.
 */
function PresentationFoot(props: PresentationFootProps): JSX.Element | null {
	const { narration, overlay } = props;
	const laid = overlay !== null && overlay !== undefined;
	if (narration === undefined && !laid) return null;
	return (
		<div
			data-slot="semantic-presentation-foot"
			style={FOOT_STYLE}
			className="border-border bg-sidebar shadow-well relative isolate flex h-[78px] shrink-0 rounded-full border"
		>
			{narration !== undefined && (
				<NarrateKey walkthrough={props.walkthrough} narration={narration} />
			)}
			{laid && (
				<div className="pointer-events-none absolute inset-0 flex">
					<OverlayPlaceContext.Provider value="foot">{overlay}</OverlayPlaceContext.Provider>
				</div>
			)}
		</div>
	);
}

export { PresentationFoot, type PresentationFootProps };

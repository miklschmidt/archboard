// The foot of a presented walkthrough's column: the key that has the walkthrough narrated.
//
// It is there for as long as the shell has a voice to offer. It is a pill as wide as the column,
// sunk into it, with a gold circle at its start where the microphone is. While a narration cannot
// start, as while a voice is on, the key stays where it is, dimmed, and says why. The voice itself,
// its orb and its words, stays where the shell lays it: low over the picture, in the middle of it
// (SemanticStagePresentation, `overlayOver`).

import { RiMicLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/** What the key says while a narration can start. */
const NARRATE_HINT = "Hear this walkthrough read aloud.";

/**
 * The circle with the microphone on it. It is the gold of the primary action, as the site's
 * Narrate key is, and it lifts and sinks with the key that holds it.
 */
const SEAT =
	"primary-finish pointer-events-none m-1.5 grid size-16 shrink-0 place-items-center rounded-full";

/** How the circle answers the pointer on a key that can narrate. */
const LIFT = cn(
	"group-hover/narrate:shadow-primary-hover group-hover/narrate:-translate-y-px",
	"group-active/narrate:shadow-primary-pressed group-active/narrate:translate-y-px",
);

/** Inputs for the key that has the walkthrough narrated. */
interface PresentationFootProps {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** Narrating the walkthrough aloud, when the shell can. */
	readonly narration?: WalkthroughNarration | undefined;
}

/**
 * The key that has the walkthrough narrated, from its first step. It stays where it is while a
 * narration cannot start, so nothing around it moves: it is dimmed, and says why where it says what
 * it does.
 * @param props The walkthrough and the narration.
 * @param props.walkthrough The walkthrough's id.
 * @param props.narration What the shell offers.
 * @returns The key.
 */
function NarrateKey(props: {
	readonly walkthrough: string;
	readonly narration: WalkthroughNarration;
}): JSX.Element {
	const { walkthrough } = props;
	const { held, start } = props.narration;
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
				"group/narrate bg-tray-sink shadow-well focus-visible:ring-ring flex shrink-0 items-center gap-3 rounded-full pr-6 text-left outline-none focus-visible:ring-2",
				dimmed ? "cursor-default *:opacity-60" : "cursor-pointer",
			)}
		>
			<span aria-hidden="true" className={cn(SEAT, !dimmed && LIFT)}>
				<RiMicLine className="size-5" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="text-control font-medium">Narrate</span>
				<span className="text-body text-muted-foreground truncate">{held ?? NARRATE_HINT}</span>
			</span>
		</button>
	);
}

/**
 * The foot of the column.
 * @param props The walkthrough and the narration.
 * @returns The key, or null where the shell has no voice to offer.
 */
function PresentationFoot(props: PresentationFootProps): JSX.Element | null {
	if (props.narration === undefined) return null;
	return <NarrateKey walkthrough={props.walkthrough} narration={props.narration} />;
}

export { PresentationFoot };

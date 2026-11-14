// The foot of a presented walkthrough's column: the key that has the walkthrough narrated, and
// that hangs the voice up while the orb is in the voice box.
//
// It is there for as long as the shell has a voice to offer. It is a pill as wide as the column,
// sunk into it, with a gold circle at its start where the microphone is. The gold circle is a home
// of the shell's one voice orb (OrbSlot): while voice is off the orb waits there, dark. Pressing
// the key asks the orb's stage to launch from it, so the orb that voice lights leaves the circle,
// lit, and flies to the voice box low over the picture (SemanticStagePresentation, `overlayOver`),
// or to the agent dock while subtitles are off. While voice is on the key stays where it is, and
// it draws its gold disc and microphone only while the orb is in it (app.css, `narrate-seat`): the
// key the orb left keeps the room it had.
//
// While the lit orb is wanted in the voice box, the key is the red hang-up key: a red disc with a
// handset comes into the seat the orb left, and the words say Hang up. A press ends the voice. As
// the voice ends, the dock wishes the orb back into the seat, so the red disc and its words go
// while the orb flies home, and the gold disc is back once it lands. While the orb is in the dock,
// or the voice starts or ends, the key is held: its words are dimmed and say why it cannot narrate.

import { RiMicLine, RiPhoneFill } from "@remixicon/react";
import { useCallback, type CSSProperties, type JSX, type MouseEvent } from "react";

import { VOICE_MS } from "@archboard/workbench/voice";
import { cn } from "@archboard/ui-kit/components";
import { OrbSlot, useNarrateKey } from "@archboard/workbench/voice";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/** What the key says while a narration can start. */
const NARRATE_HINT = "Hear this walkthrough read aloud.";

/** What the key says while it hangs the voice up. */
const HANG_UP_HINT = "End the voice.";

/** The room of the gold circle: the seat the orb waits in, and the socket that holds it. */
const SEAT = "pointer-events-none relative m-1.5 size-16 shrink-0";

/**
 * The circle with the microphone on it. It is the gold of the primary action, as the site's
 * Narrate key is, and it lifts and sinks with the key that holds it.
 */
const DISC = "primary-finish absolute inset-0 grid place-items-center rounded-full";

/** The red circle with the handset, laid down for hanging up, while the orb is in the voice box. */
const HANG_UP_DISC = "absolute inset-0 grid place-items-center rounded-full";

/** How fast the gold disc goes once the orb leaves it (app.css, `narrate-seat`). */
const SEAT_STYLE: CSSProperties = { "--voice-seat-out-ms": `${VOICE_MS.seatOut}ms` };

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
 * The key that has the walkthrough narrated, from its first step, and that hangs the voice up
 * while the orb is in the voice box. It stays where it is while a narration cannot start, so
 * nothing around it moves: its words are dimmed, and say why where they say what it does.
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
	const { launch, hangingUp, end } = useNarrateKey();
	// A narration starts on the first step whatever the reader had reached; the server opens it
	// once voice is starting, so the voice is handed the step it arrived on. The orb that voice
	// lights is launched out of this key.
	const narrate = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => {
			launch(event.currentTarget);
			start(walkthrough);
		},
		[launch, start, walkthrough],
	);
	const press = hangingUp ? end : held === null ? narrate : undefined;
	return (
		<button
			type="button"
			data-slot="semantic-presentation-narrate"
			data-hang-up={hangingUp}
			aria-disabled={press === undefined ? true : undefined}
			onClick={press}
			className="group/narrate bg-tray-sink shadow-well focus-visible:ring-ring flex shrink-0 cursor-pointer items-center gap-3 rounded-full pr-6 text-left outline-none focus-visible:ring-2 aria-disabled:cursor-default"
		>
			<span aria-hidden="true" data-slot="narrate-seat" style={SEAT_STYLE} className={SEAT}>
				<span data-part="disc" className={cn(DISC, held === null && LIFT)}>
					<RiMicLine className="size-5" />
				</span>
				<span data-part="hang-up" className={HANG_UP_DISC}>
					<RiPhoneFill className="size-5 rotate-[135deg]" />
				</span>
				<OrbSlot home="narrate" className="absolute inset-0" />
			</span>
			<NarrateWords held={held} hangingUp={hangingUp} />
		</button>
	);
}

/**
 * What the key says: Narrate, and what it does, or why it cannot now, dimmed; or Hang up while
 * it ends the voice. The two sets of words stand in one cell and change places as the discs do.
 * @param props Why a narration cannot start, and whether the key hangs up.
 * @param props.held The words, or null while one can.
 * @param props.hangingUp Whether the key ends the voice.
 * @returns The words.
 */
function NarrateWords(props: {
	readonly held: string | null;
	readonly hangingUp: boolean;
}): JSX.Element {
	const { held, hangingUp } = props;
	return (
		<span className="grid min-w-0 [&>*]:col-start-1 [&>*]:row-start-1">
			<span
				data-part="narrate-words"
				aria-hidden={hangingUp ? true : undefined}
				className={cn("flex min-w-0 flex-col", held !== null && "opacity-60")}
			>
				<span className="text-control font-medium">Narrate</span>
				<span className="text-body text-muted-foreground truncate">{held ?? NARRATE_HINT}</span>
			</span>
			<span
				data-part="hang-up-words"
				aria-hidden={hangingUp ? undefined : true}
				className="flex min-w-0 flex-col"
			>
				<span className="text-control font-medium">Hang up</span>
				<span className="text-body text-muted-foreground truncate">{HANG_UP_HINT}</span>
			</span>
		</span>
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

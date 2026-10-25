// The control over subtitles: on or off, beside the voice controls it belongs with. There is
// one in the dock's voice line and one in the voice box, and pressing either moves the voice to
// the other's surface, which takes the pressed one away or makes it inert. A person who pressed
// it with focus on it is not left on the page: focus goes to the one that took its place.

import { RiClosedCaptioningFill, RiClosedCaptioningLine } from "@remixicon/react";
import { cn } from "cn";
import { useCallback, useRef, type JSX } from "react";
import { flushSync } from "react-dom";

import { buttonVariants, Tooltip } from "@archboard/ui-kit/components";
import { useSubtitlesWanted } from "#ui/hooks/subtitles/use-subtitle-preference.ts";
import { subtitlePreference, type SubtitlePreference } from "#ui/state/subtitles/preference.ts";

/** What every subtitles control is told apart by. */
const TOGGLE = '[data-slot="voice-subtitles-toggle"]';

/**
 * Whether the control that was pressed still has focus where it is: a control that replaced
 * nothing, because the voice box stays where it is, as in a fullscreen presentation. One that was
 * taken away or made inert by a surface that is leaving did not keep it.
 * @param pressed The control that was pressed, or null once it is gone from the page.
 * @returns True when it has kept focus.
 */
function holdsFocus(pressed: HTMLElement | null): boolean {
	return pressed !== null && document.activeElement === pressed && !pressed.closest("[inert]");
}

/**
 * The subtitles control that can take the place of the pressed one: another that is on the
 * page and is not inert.
 * @param pressed The control that was pressed, or null once it is gone from the page.
 * @returns The control, or undefined when there is none.
 */
function twinOf(pressed: HTMLElement | null): HTMLElement | undefined {
	return [...document.querySelectorAll<HTMLElement>(TOGGLE)].find(
		(toggle) => toggle !== pressed && !toggle.closest("[inert]"),
	);
}

/**
 * Give keyboard focus to the subtitles control that took the pressed one's place, when the
 * pressed one has lost it.
 * @param pressed The control that was pressed, or null once it is gone from the page.
 */
function followFocus(pressed: HTMLElement | null): void {
	if (!holdsFocus(pressed)) twinOf(pressed)?.focus();
}

/** Inputs for the toggle. */
interface SubtitlesToggleProps {
	/** The preference it changes; the page's own unless a test supplies one. */
	readonly preference?: SubtitlePreference;
	/**
	 * Whether it is a key of the voice box, drawn as the dock's keys are. Pressing it acts, so it
	 * does not show that subtitles are on by changing its glyph, as an icon among icons does.
	 */
	readonly keyed?: boolean;
	/** What shapes the control where it is not an icon among icons, as at the end of the voice box. */
	readonly className?: string;
	/** Which side its tooltip opens on. */
	readonly tipSide?: "top" | "left";
}

/**
 * The control's glyph: closed captions, filled while subtitles are on in an icon among icons.
 * @param props Whether to draw it filled.
 * @param props.filled Whether to draw it filled.
 * @returns The glyph.
 */
function Glyph(props: { readonly filled: boolean }): JSX.Element {
	return props.filled ? (
		<RiClosedCaptioningFill aria-hidden="true" />
	) : (
		<RiClosedCaptioningLine aria-hidden="true" />
	);
}

/** How the control looks. */
interface Face {
	readonly variant: "ghost" | "outline";
	/** The ink of the glyph. */
	readonly tone: string;
	/** Whether the glyph is filled. */
	readonly filled: boolean;
}

/**
 * How the control looks. An icon among icons shows that subtitles are on by a filled glyph and
 * the ink; a key of the voice box does not, because pressing it acts.
 * @param wanted Whether subtitles are on.
 * @param keyed Whether it is a key of the voice box.
 * @returns The face.
 */
function faceOf(wanted: boolean, keyed: boolean): Face {
	const filled = wanted && !keyed;
	return {
		variant: keyed ? "outline" : "ghost",
		tone: filled ? "text-foreground" : "text-muted-foreground",
		filled,
	};
}

/**
 * The subtitles toggle, a pressed button while subtitles are on.
 * @param props The preference, when not the page's own, and whether it is a key of the voice box.
 * @returns An icon button with a tooltip.
 */
function SubtitlesToggle(props: SubtitlesToggleProps): JSX.Element {
	const preference = props.preference ?? subtitlePreference;
	const wanted = useSubtitlesWanted(preference);
	const face = faceOf(wanted, props.keyed === true);
	const label = wanted ? "Hide subtitles" : "Show subtitles";
	const trigger = useRef<HTMLButtonElement>(null);
	const toggle = useCallback((): void => {
		const focused = document.activeElement === trigger.current;
		// Settle the surfaces now, so the control that takes this one's place is there to be given focus.
		flushSync(() => {
			preference.change(!preference.wanted());
		});
		if (focused) followFocus(trigger.current);
	}, [preference]);
	return (
		<Tooltip>
			<Tooltip.Trigger
				ref={trigger}
				data-slot="voice-subtitles-toggle"
				className={cn(
					buttonVariants({ variant: face.variant, size: "icon-xs" }),
					"relative rounded-sm after:absolute after:-inset-1",
					face.tone,
					props.className,
				)}
				aria-label={label}
				aria-pressed={wanted}
				onClick={toggle}
			>
				<Glyph filled={face.filled} />
				<span className="sr-only">{label}</span>
			</Tooltip.Trigger>
			<Tooltip.Content side={props.tipSide ?? "top"}>{label}</Tooltip.Content>
		</Tooltip>
	);
}

export { SubtitlesToggle, type SubtitlesToggleProps };

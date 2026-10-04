// The control over subtitles: on or off, beside the voice controls it belongs with. There is
// one in the dock's voice line and one in the voice box, and pressing either moves the voice to
// the other's surface, which takes the pressed one away or makes it inert. A person who pressed
// it with focus on it is not left on the page: focus goes to the one that took its place.

import { RiClosedCaptioningFill, RiClosedCaptioningLine } from "@remixicon/react";
import { cn } from "cn";
import { useCallback, useRef, type JSX } from "react";
import { flushSync } from "react-dom";

import { buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import { useSubtitlesWanted } from "@/ui/voice-subtitles/hooks/use-subtitle-preference";
import { subtitlePreference, type SubtitlePreference } from "@/ui/voice-subtitles/lib/preference";

/** What every subtitles control is told apart by. */
const TOGGLE = '[data-slot="voice-subtitles-toggle"]';

/**
 * Whether the control that was pressed still has focus where it is: a control that does replaced
 * nothing, as in a presentation's bar. One that was taken away or made inert by a surface that is
 * leaving did not keep it.
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
}

/**
 * The subtitles toggle, a pressed button while subtitles are on.
 * @param props The preference, when not the page's own.
 * @returns An icon button with a tooltip.
 */
function SubtitlesToggle(props: SubtitlesToggleProps): JSX.Element {
	const preference = props.preference ?? subtitlePreference;
	const wanted = useSubtitlesWanted(preference);
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
			<TooltipTrigger
				ref={trigger}
				data-slot="voice-subtitles-toggle"
				className={cn(
					buttonVariants({ variant: "ghost", size: "icon-xs" }),
					"relative rounded-sm after:absolute after:-inset-1",
					wanted ? "text-foreground" : "text-muted-foreground",
				)}
				aria-label={label}
				aria-pressed={wanted}
				onClick={toggle}
			>
				{wanted ? (
					<RiClosedCaptioningFill aria-hidden="true" />
				) : (
					<RiClosedCaptioningLine aria-hidden="true" />
				)}
				<span className="sr-only">{label}</span>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}

export { SubtitlesToggle, type SubtitlesToggleProps };

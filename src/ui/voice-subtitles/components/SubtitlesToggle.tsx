// The one control over subtitles: on or off, beside the voice controls it belongs with.

import { RiClosedCaptioningFill, RiClosedCaptioningLine } from "@remixicon/react";
import { cn } from "cn";
import { useCallback, type JSX } from "react";

import { buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import { useSubtitlesWanted } from "@/ui/voice-subtitles/hooks/use-subtitle-preference";
import { subtitlePreference, type SubtitlePreference } from "@/ui/voice-subtitles/lib/preference";

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
	const toggle = useCallback((): void => {
		preference.change(!preference.wanted());
	}, [preference]);
	return (
		<Tooltip>
			<TooltipTrigger
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

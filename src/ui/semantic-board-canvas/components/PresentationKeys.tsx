// The keys of a presented walkthrough's box: the previous step, the next one, and leaving. They
// are one row of the box's own keys, at the end of the step's heading, and a recording draws none of
// them, because nobody can press anything in the video.

import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine } from "@remixicon/react";
import type { JSX } from "react";

import { Button } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";

/** A key's tooltip: what it does, and the key that does it where there is one. */
interface KeyTipProps {
	readonly children: JSX.Element;
	readonly label: string;
}

/**
 * A key with its tooltip.
 * @param props The key and what it does.
 * @returns The key with its tooltip.
 */
function KeyTip(props: KeyTipProps): JSX.Element {
	return (
		<Tooltip>
			<TooltipTrigger render={props.children} />
			<TooltipContent>{props.label}</TooltipContent>
		</Tooltip>
	);
}

/** Inputs for the keys. */
interface PresentationKeysProps {
	/** Whether a step comes before the one shown. */
	readonly hasPrevious: boolean;
	/** Whether a step comes after the one shown. */
	readonly hasNext: boolean;
	/** Show the previous step. */
	readonly onPrevious: () => void;
	/** Show the next step. */
	readonly onNext: () => void;
	/** Leave the presentation. */
	readonly onLeave: () => void;
}

/**
 * The previous, next and leave keys.
 * @param props Whether there is a step either way, and what each key does.
 * @returns The row of keys.
 */
function PresentationKeys(props: PresentationKeysProps): JSX.Element {
	return (
		<div
			data-slot="semantic-presentation-keys"
			className="flex items-start gap-1.5 in-data-recording:hidden"
		>
			<KeyTip label="Previous step">
				<Button
					type="button"
					variant="outline"
					size="icon"
					data-slot="semantic-presentation-previous"
					aria-label="Previous step"
					disabled={!props.hasPrevious}
					onClick={props.onPrevious}
				>
					<RiArrowLeftSLine />
				</Button>
			</KeyTip>
			<KeyTip label="Next step">
				<Button
					type="button"
					variant="outline"
					size="icon"
					data-slot="semantic-presentation-next"
					aria-label="Next step"
					disabled={!props.hasNext}
					onClick={props.onNext}
				>
					<RiArrowRightSLine />
				</Button>
			</KeyTip>
			<KeyTip label="Leave the walkthrough">
				<Button
					type="button"
					variant="outline"
					data-slot="semantic-presentation-leave"
					aria-label="Leave the walkthrough"
					onClick={props.onLeave}
				>
					<RiCloseLine />
					<span className="text-technical font-mono">Esc</span>
				</Button>
			</KeyTip>
		</div>
	);
}

export { PresentationKeys, type PresentationKeysProps };

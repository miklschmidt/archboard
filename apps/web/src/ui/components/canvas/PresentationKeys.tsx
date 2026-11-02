// The keys of a presented walkthrough's box: the previous step, the next one, and leaving. They
// are one row of the box's own keys, beside the words, and a recording draws none of them, because
// nobody can press anything in the video.
//
// A key that has nowhere to go, the previous one on the first step and the next one on the last, is
// dimmed and does nothing, but it stays a key: a disabled button cannot hold keyboard focus, and
// the reader who pressed Next onto the last step would be left on nothing.

import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine } from "@remixicon/react";
import type { JSX } from "react";

import { Button, cn, Tooltip } from "@archboard/ui-kit/components";

/** What a key that has nowhere to go looks like: dimmed, flat, and out of the pointer's way. */
const SPENT =
	"aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:shadow-none";

/** A key's tooltip: what it does. */
interface KeyTipProps {
	readonly children: JSX.Element;
	readonly label: string;
}

/**
 * A control with its tooltip.
 * @param props The control and what it does.
 * @returns The control with its tooltip.
 */
function KeyTip(props: KeyTipProps): JSX.Element {
	return (
		<Tooltip>
			<Tooltip.Trigger render={props.children} />
			<Tooltip.Content>{props.label}</Tooltip.Content>
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
	/** What places the row in the box. */
	readonly className?: string;
}

/**
 * The previous, next and leave keys.
 * @param props Whether there is a step either way, what each key does and what places the row.
 * @returns The row of keys.
 */
function PresentationKeys(props: PresentationKeysProps): JSX.Element {
	return (
		<div
			data-slot="semantic-presentation-keys"
			className={cn("flex items-start gap-1.5 in-data-recording:hidden", props.className)}
		>
			<KeyTip label="Previous step">
				<Button
					type="button"
					variant="outline"
					size="icon"
					data-slot="semantic-presentation-previous"
					aria-label="Previous step"
					aria-disabled={props.hasPrevious ? undefined : true}
					className={SPENT}
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
					aria-disabled={props.hasNext ? undefined : true}
					className={SPENT}
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

export { KeyTip, PresentationKeys, type PresentationKeysProps };

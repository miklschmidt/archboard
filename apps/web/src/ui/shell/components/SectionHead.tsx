// The head of a section in either side column, which folds the section: its label at the start
// and the chevron at the end. The left column's sections and the right panel's sections fold
// alike, so the two columns read as one system.

import { RiArrowRightSLine, type RemixiconComponentType } from "@remixicon/react";
import type { JSX, ReactNode } from "react";

import { cn } from "@archboard/ui-kit/components";
import { SectionLabel } from "#ui/shell/components/SectionLabel.tsx";

/** Inputs for the head of a section. */
interface SectionHeadProps {
	/** Where the head stands in the outline of the page. */
	readonly level: 2 | 3 | 4;
	readonly icon?: RemixiconComponentType | undefined;
	readonly title: string;
	readonly count?: number | undefined;
	/** What the head says after the count, which belongs to the button's name. */
	readonly summary?: ReactNode;
	/** Keys of the head, such as `Open in About`, which stand before the chevron and fold nothing. */
	readonly action?: ReactNode;
	readonly folded: boolean;
	readonly onFold: () => void;
	/** The id of the body that the head folds. */
	readonly controls: string;
	/** The head's height and inset, which each column sets. */
	readonly className: string;
}

/**
 * The head of a section: one button that folds the section, with the section's label at its start
 * and the chevron that turns at its end. The button reaches over the whole head, so a click
 * anywhere on it folds the section, and a key of the head stands above it and keeps its own click.
 * @param props The section's label, its keys and its fold.
 * @returns The head.
 */
function SectionHead(props: SectionHeadProps): JSX.Element {
	const Heading = `h${props.level}` as const;
	return (
		<div className={cn("group/head relative flex items-center gap-2", props.className)}>
			<Heading className="m-0 flex min-w-0">
				<button
					type="button"
					aria-expanded={!props.folded}
					aria-controls={props.folded ? undefined : props.controls}
					onClick={props.onFold}
					className="focus-visible:after:ring-ring flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:ring-1 focus-visible:after:ring-inset"
				>
					<SectionLabel icon={props.icon} title={props.title} count={props.count} />
					{props.summary}
				</button>
			</Heading>
			{props.action !== undefined && (
				<div className="relative ml-auto flex shrink-0 items-center gap-2">{props.action}</div>
			)}
			{/* The glyph leaves room inside its box, 3.75px at its right while it points down and 5.25px
			    while it points right, so the box reaches past the head's end by that much, and the ink
			    of the chevron ends where the words and numbers of the rows end. */}
			<RiArrowRightSLine
				aria-hidden="true"
				className={cn(
					"text-muted-foreground group-hover/head:text-foreground -mr-[3.75px] size-4 shrink-0 transition-[rotate,translate] motion-reduce:transition-none",
					props.action === undefined && "ml-auto",
					props.folded ? "translate-x-[1.5px]" : "rotate-90",
				)}
			/>
		</div>
	);
}

export { SectionHead };

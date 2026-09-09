// A section's title row inside the agent settings dialog.

import type { JSX, ReactNode } from "react";

/** Inputs for a section heading. */
interface SectionHeadingProps {
	title: string;
	/** What sits beside the title, usually a state badge. */
	children?: ReactNode;
}

/**
 * A section's title with its state beside it.
 * @param props The title and its companions.
 * @returns The heading row.
 */
function SectionHeading(props: SectionHeadingProps): JSX.Element {
	return (
		<h3 className="text-control flex items-center gap-2 font-semibold">
			{props.title}
			{props.children}
		</h3>
	);
}

export { SectionHeading, type SectionHeadingProps };

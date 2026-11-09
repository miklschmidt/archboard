// The label of a section in either side column: its name in full ink and semibold, and how many
// things it lists beside it. The left column's sections and the right panel's sections set it
// alike, so the two columns read as one system.

import type { JSX } from "react";

/**
 * A section's name, and its count beside it.
 * @param props The name and the count.
 * @param props.title What the section lists.
 * @param props.count How many it lists, when it says so.
 * @returns The label.
 */
function SectionLabel(props: {
	readonly title: string;
	readonly count?: number | undefined;
}): JSX.Element {
	return (
		<span className="text-body text-foreground flex min-w-0 items-baseline gap-1.5 font-semibold">
			<span className="truncate">{props.title}</span>
			{props.count !== undefined && (
				<span
					data-slot="section-count"
					className="text-technical text-muted-foreground font-mono font-normal"
				>
					{props.count}
				</span>
			)}
		</span>
	);
}

export { SectionLabel };

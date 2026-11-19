// The label of a section in either side column: its icon in muted ink, its name in full ink and
// semibold, and how many things it lists beside it. The left column's sections and the right
// panel's sections set it alike, so the two columns read as one system.

import type { RemixiconComponentType } from "@remixicon/react";
import type { JSX } from "react";

/**
 * A section's icon, name, and count beside it.
 * @param props The icon, the name and the count.
 * @param props.icon What kind of thing the section lists, drawn before its name.
 * @param props.title What the section lists.
 * @param props.count How many it lists, when it says so.
 * @returns The label.
 */
function SectionLabel(props: {
	readonly icon?: RemixiconComponentType | undefined;
	readonly title: string;
	readonly count?: number | undefined;
}): JSX.Element {
	const { icon: Icon } = props;
	return (
		<span className="text-control text-foreground flex min-w-0 items-center gap-1.5 font-semibold">
			{Icon !== undefined && (
				<Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
			)}
			<span title={props.title} className="truncate">
				{props.title}
			</span>
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

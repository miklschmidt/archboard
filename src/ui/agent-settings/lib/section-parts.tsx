// Pieces the sections share: a heading row and a state badge.

import type { StateSummary } from "@/ui/agent-settings/lib/presentation";
import { Badge } from "@/ui/components/badge";

/** Inputs for a section heading. */
interface SectionHeadingProps {
	title: string;
	/** What sits beside the title, usually a state badge. */
	children?: React.ReactNode;
}

/**
 * A section's title with its state beside it.
 * @param props The title and its companions.
 * @returns The heading row.
 */
function SectionHeading(props: SectionHeadingProps): React.JSX.Element {
	return (
		<h3 className="text-control flex items-center gap-2 font-semibold">
			{props.title}
			{props.children}
		</h3>
	);
}

/** Inputs for a state badge. */
interface StateBadgeProps {
	summary: StateSummary;
}

/**
 * A state as a badge, with its detail in muted text beside it.
 * @param props The summary.
 * @returns The badge and detail.
 */
function StateBadge(props: StateBadgeProps): React.JSX.Element {
	const { summary } = props;
	return (
		<>
			<Badge variant={summary.tone}>{summary.label}</Badge>
			{summary.detail !== null && (
				<span className="text-muted-foreground text-body truncate font-normal">
					{summary.detail}
				</span>
			)}
		</>
	);
}

export { SectionHeading, StateBadge };

// One agent settings section's state, as a badge with its detail beside it.

import type { JSX } from "react";

import type { StateSummary } from "@/ui/agent-settings/lib/presentation";
import { Badge } from "@/ui/components/badge";

/** Inputs for a state badge. */
interface StateBadgeProps {
	summary: StateSummary;
}

/**
 * A state as a badge, with its detail in muted text beside it.
 * @param props The summary.
 * @returns The badge and detail.
 */
function StateBadge(props: StateBadgeProps): JSX.Element {
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

export { StateBadge, type StateBadgeProps };

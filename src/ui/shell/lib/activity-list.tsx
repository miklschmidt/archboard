// The recent `doing` lines, oldest first: what an agent or a person said they
// were doing to the board, with the time in the mono face. The workbench shows
// this in its session column; the dock shows it when no workbench is attached.

import { RiCheckLine } from "@remixicon/react";

import { StatusDot } from "@/ui/shell/lib/status-dot";
import { clockTime } from "@/ui/shell/lib/time";
import type { DoingEntry } from "@/ui/types";

/** How many `doing` lines the list shows. */
const DOING_LINES = 6;

/**
 * The last few `doing` lines, oldest first.
 * @param entries Every line the pane holds.
 * @returns At most `DOING_LINES` entries.
 */
function recentDoing(entries: readonly DoingEntry[]): DoingEntry[] {
	return entries.slice(-DOING_LINES);
}

/** Inputs for the list. */
interface ActivityListProps {
	entries: readonly DoingEntry[];
	className?: string | undefined;
}

/**
 * The list: a check for what is done, a lime dot for the latest, the time
 * and who said it in the mono face, then the words.
 * @param props The entries.
 * @returns A list, or nothing when nobody has said anything.
 */
function ActivityList(props: ActivityListProps): React.JSX.Element | null {
	const entries = recentDoing(props.entries);
	if (entries.length === 0) {
		return null;
	}
	const last = entries.length - 1;
	return (
		<ol
			aria-label="Recent activity"
			className={`text-body flex flex-col gap-1.5 ${props.className ?? ""}`}
		>
			{entries.map((entry, index) => (
				<li key={`${entry.by}:${entry.at}`} className="flex items-start gap-2">
					{index === last ? (
						<StatusDot tone="live" className="mx-[3px] mt-[5px]" />
					) : (
						<RiCheckLine
							aria-hidden="true"
							className="text-muted-foreground mt-0.5 size-3 shrink-0"
						/>
					)}
					<span className="line-clamp-2 min-w-0 flex-1 break-words">{entry.doing}</span>
					<time
						dateTime={entry.at}
						className="text-muted-foreground text-technical shrink-0 pt-px font-mono"
					>
						{clockTime(entry.at)}
					</time>
				</li>
			))}
		</ol>
	);
}

export { ActivityList, recentDoing, type ActivityListProps };

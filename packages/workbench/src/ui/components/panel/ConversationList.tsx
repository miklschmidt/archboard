// The tab session's workhorses, one per checkout, and the one whose
// conversation the dock shows (ADR 0050). Picking one shows its conversation in
// every pane of the tab. It is there only while the tab has two or more: with
// one there is nothing to pick. Each says in words, never in colour alone,
// whether it is running or waits for the person.

import { useCallback, useMemo, type JSX } from "react";

import type { BrowserWorkhorses } from "@archboard/codex-realtime-voice/contract";
import { ToggleGroup, ToggleGroupItem } from "@archboard/ui-kit/controls";

/** One workhorse as the list draws it. */
type Workhorse = BrowserWorkhorses["entries"][number];

/** Inputs for the list. */
interface ConversationListProps {
	readonly workhorses: BrowserWorkhorses | undefined;
	readonly onPick: (checkout: string) => void;
}

/**
 * The workhorses to pick from, or nothing while there is one or none.
 * @param props The tab's workhorses and what a pick does.
 * @returns The list, or null.
 */
function ConversationList(props: ConversationListProps): JSX.Element | null {
	const { workhorses, onPick } = props;
	const handleChange = useCallback(
		(picked: readonly unknown[]) => {
			// A press on the shown one would leave none picked: the shown conversation stays.
			const [checkout] = picked;
			if (typeof checkout === "string") onPick(checkout);
		},
		[onPick],
	);
	const shown = workhorses?.shown;
	const value = useMemo(() => (shown === undefined ? [] : [shown]), [shown]);
	if (workhorses === undefined || workhorses.entries.length < 2) return null;
	return (
		<div data-part="conversations">
			<ToggleGroup
				aria-label="Conversations"
				orientation="vertical"
				spacing={0}
				size="sm"
				value={value}
				onValueChange={handleChange}
				className="w-full"
			>
				{workhorses.entries.map((entry) => (
					<ToggleGroupItem
						key={entry.checkout}
						value={entry.checkout}
						title={entry.checkout}
						className="h-auto justify-start py-1 text-left"
					>
						<WorkhorseLabel workhorse={entry} />
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/**
 * One workhorse: its repository, then what tells it apart and what it waits on. The directory of
 * its checkout tells two checkouts of one repository apart; it is left out where it is the name.
 * @param props The workhorse.
 * @param props.workhorse The workhorse, as the server lists it.
 * @returns Its words.
 */
function WorkhorseLabel(props: { readonly workhorse: Workhorse }): JSX.Element {
	const { workhorse } = props;
	const place = directoryName(workhorse.checkout);
	const name = workhorse.repository ?? place;
	const detail = [name === place ? null : place, stateOf(workhorse)].filter(
		(part) => part !== null,
	);
	return (
		<span className="flex min-w-0 flex-col">
			<span className="truncate">{name}</span>
			{detail.length > 0 && (
				<span className="text-muted-foreground text-technical truncate">{detail.join(" · ")}</span>
			)}
		</span>
	);
}

/**
 * What a workhorse waits on, or that it is running.
 * @param workhorse The workhorse.
 * @returns The words, or null while it is idle.
 */
function stateOf(workhorse: Workhorse): string | null {
	if (workhorse.waitingForApproval) return "waits for your approval";
	if (workhorse.waitingForUser) return "waits for your answer";
	return workhorse.running ? "running" : null;
}

/**
 * The last part of a checkout's path, which tells two checkouts of one repository apart.
 * @param checkout The checkout.
 * @returns Its directory's name.
 */
function directoryName(checkout: string): string {
	return checkout.split(/[\\/]/u).findLast((part) => part !== "") ?? checkout;
}

export { ConversationList, type ConversationListProps };

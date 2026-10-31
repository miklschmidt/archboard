import { Fragment, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Badge, Tabs } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";

/** What the left column lists. */
type Destination = "modules" | "flows" | "walkthroughs" | "history" | "measures" | "changes";

/** Inputs for the destinations. */
interface ColumnDestinationsProps {
	readonly destination: Destination;
	readonly onDestination: (destination: Destination) => void;
	/** The destinations the reading has. */
	readonly offered: readonly Destination[];
	/** How many flows the model has. */
	readonly flows?: number;
	/** How many walkthroughs the model has. */
	readonly walkthroughs?: number;
	/** What the Changes tab says of the walk, while a proposal is read. */
	readonly changes?: string | undefined;
	/** The controls of the walk, which stand at the end of the Changes tab's row. */
	readonly walker?: ReactNode;
	/** The lists, each in a {@link ColumnList}. */
	readonly children: ReactNode;
}

/** One tab of the destinations. */
interface DestinationEntry {
	readonly value: Destination;
	readonly label: string;
	readonly count: string;
}

/** How many tabs the column holds on one row. */
const TABS_ON_A_ROW = 5;

/**
 * What a tab says of how many things it holds.
 * @param count How many.
 * @returns The count, or nothing when there are none.
 */
function countOf(count: number): string {
	return count > 0 ? String(count) : "";
}

/**
 * Put a reader's Find in the left column while its pane has focus.
 * @param props The field.
 * @param props.children The field.
 * @returns The field in the column, or nothing while another pane has focus.
 */
function ColumnFind(props: { readonly children: ReactNode }): JSX.Element | null {
	const slot = usePaneChrome().column?.find ?? null;
	return slot === null ? null : <>{createPortal(props.children, slot)}</>;
}

/**
 * The tabs a reading offers.
 * @param props The destinations and what the tabs say of them.
 * @returns The tabs.
 */
function destinationEntries(props: ColumnDestinationsProps): readonly DestinationEntry[] {
	const { offered, flows = 0, walkthroughs = 0, changes = "" } = props;
	const all: readonly DestinationEntry[] = [
		{ value: "modules", label: "Modules", count: "" },
		{ value: "flows", label: "Flows", count: countOf(flows) },
		{ value: "walkthroughs", label: "Walkthroughs", count: countOf(walkthroughs) },
		{ value: "history", label: "History", count: "" },
		{ value: "measures", label: "Measures", count: "" },
		{ value: "changes", label: "Changes", count: changes },
	];
	return all.filter((entry) => offered.includes(entry.value));
}

/**
 * Put a reader's destinations in the left column while its pane has focus: tabs on the top edge of
 * a well, with the count of the whole model on Flows and Walkthroughs, so a list here never changes
 * under a reader. A proposal adds Changes on a row of its own, and the walk stands at the end of it.
 * @param props The destination on screen and the lists.
 * @returns The destinations, or nothing while another pane has focus.
 */
function ColumnDestinations(props: ColumnDestinationsProps): JSX.Element | null {
	const { destination, onDestination } = props;
	const slot = usePaneChrome().column?.destinations ?? null;
	if (slot === null) return null;
	return (
		<>
			{createPortal(
				<Tabs
					data-slot="model-destinations"
					value={destination}
					onValueChange={onDestination}
					className="min-h-0 flex-1 gap-0 px-2 pb-2"
				>
					<DestinationTabs entries={destinationEntries(props)} walker={props.walker} />
					<div data-slot="column-well" className="column-well flex-1">
						{props.children}
					</div>
				</Tabs>,
				slot,
			)}
		</>
	);
}

/**
 * The tabs, and at the end of the last row the controls of the walk.
 * @param props The tabs and the controls.
 * @param props.entries The tabs.
 * @param props.walker The controls of the walk.
 * @returns The rows.
 */
function DestinationTabs(props: {
	readonly entries: readonly DestinationEntry[];
	readonly walker: ReactNode;
}): JSX.Element {
	const { entries, walker } = props;
	return (
		<div className="relative shrink-0">
			<Tabs.List variant="edge">
				{entries.map((entry, index) => (
					<Fragment key={entry.value}>
						{index === TABS_ON_A_ROW && <TabRowBreak />}
						<DestinationTab entry={entry} />
					</Fragment>
				))}
			</Tabs.List>
			{walker !== undefined && (
				<div className="absolute right-0 bottom-1 flex items-center">{walker}</div>
			)}
		</div>
	);
}

/**
 * The rule that sends the next tab to a row of its own.
 * @returns The rule.
 */
function TabRowBreak(): JSX.Element {
	return <span aria-hidden="true" className="border-border w-full border-t" />;
}

/**
 * One tab of the destinations.
 * @param props The tab.
 * @param props.entry The tab.
 * @returns The tab.
 */
function DestinationTab(props: { readonly entry: DestinationEntry }): JSX.Element {
	const { value, label, count } = props.entry;
	return (
		<Tabs.Trigger value={value} data-destination={value}>
			{label}
			{count !== "" && (
				<Badge variant="count" size="technical" data-slot="destination-count">
					{count}
				</Badge>
			)}
		</Tabs.Trigger>
	);
}

/**
 * What one destination lists.
 * @param props The destination and its list.
 * @param props.value The destination.
 * @param props.children The list.
 * @returns The panel, which draws its list only while it is open.
 */
function ColumnList(props: {
	readonly value: Destination;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		// A panel that leaves stays mounted for a frame, and must not share the column then.
		<Tabs.Content
			value={props.value}
			className="min-h-0 flex-1 overflow-y-auto data-ending-style:hidden"
		>
			{props.children}
		</Tabs.Content>
	);
}

/** The parts a reading puts in the left column. */
const ModelColumn = {
	Find: ColumnFind,
	Destinations: ColumnDestinations,
	List: ColumnList,
};

export { ModelColumn, type Destination };

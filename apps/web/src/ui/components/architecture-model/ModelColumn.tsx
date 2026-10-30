import { useMemo, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Tabs } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";

/** What the left column lists. */
type Destination = "modules" | "flows" | "walkthroughs" | "history";

/** Inputs for the destinations. */
interface ColumnDestinationsProps {
	readonly destination: Destination;
	readonly onDestination: (destination: Destination) => void;
	/** The destinations the reading has. */
	readonly offered: readonly Destination[];
	/** How many flows the open scope has. */
	readonly flows?: number;
	/** How many walkthroughs the open scope has. */
	readonly walkthroughs?: number;
	/** The lists, each in a {@link ColumnList}. */
	readonly children: ReactNode;
}

/** One tab of the destinations. */
interface DestinationEntry {
	readonly value: Destination;
	readonly label: string;
	readonly count: number;
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
 * Put a reader's destinations in the left column while its pane has focus: tabs with the
 * count of the open scope on Flows and Walkthroughs.
 * @param props The destination on screen and the lists.
 * @returns The destinations, or nothing while another pane has focus.
 */
function ColumnDestinations(props: ColumnDestinationsProps): JSX.Element | null {
	const { destination, onDestination, offered, flows = 0, walkthroughs = 0 } = props;
	const slot = usePaneChrome().column?.destinations ?? null;
	const entries = useMemo(() => {
		const all: readonly DestinationEntry[] = [
			{ value: "modules", label: "Modules", count: 0 },
			{ value: "flows", label: "Flows", count: flows },
			{ value: "walkthroughs", label: "Walkthroughs", count: walkthroughs },
			{ value: "history", label: "History", count: 0 },
		];
		return all.filter((entry) => offered.includes(entry.value));
	}, [offered, flows, walkthroughs]);
	if (slot === null) return null;
	return (
		<>
			{createPortal(
				<Tabs
					data-slot="model-destinations"
					value={destination}
					onValueChange={onDestination}
					className="min-h-0 flex-1 gap-0"
				>
					<Tabs.List variant="underline" className="h-band shrink-0 px-2">
						{entries.map((entry) => (
							<Tabs.Trigger
								key={entry.value}
								value={entry.value}
								data-destination={entry.value}
								className="group-data-[variant=underline]/tabs-list:px-1"
							>
								{entry.label}
								{entry.count > 0 && (
									<span
										data-slot="destination-count"
										className="text-technical text-muted-foreground font-mono"
									>
										{entry.count}
									</span>
								)}
							</Tabs.Trigger>
						))}
					</Tabs.List>
					{props.children}
				</Tabs>,
				slot,
			)}
		</>
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

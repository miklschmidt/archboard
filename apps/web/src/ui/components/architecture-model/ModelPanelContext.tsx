import { useCallback, useMemo, type JSX, type MouseEvent, type ReactNode } from "react";
import type { Model, projectModel } from "@archboard/board/content";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import { flowCollections } from "#ui/rules/architecture-model/flow-reading.ts";
import { contextOf } from "#ui/rules/architecture-model/relevance.ts";

type Projection = ReturnType<typeof projectModel>;

/** These lists stand under what the panel explains, so each shows fewer rows than its own lists. */
const FEW_ROWS = 4;

/** Inputs for what touches the subject of the panel. */
interface ModelPanelContextProps {
	readonly model: Model;
	readonly projection: Projection;
	/** What the panel explains: nothing for the open module. */
	readonly selected: ReadonlySet<string>;
	/** The flow on screen, or null. */
	readonly flow: string | null;
	readonly onFlow: (id: string, beside: boolean) => void;
	readonly onWalkthrough: (id: string) => void;
}

/**
 * The flows and the walkthroughs that touch what a reader looks at, each of which opens from here.
 * @param props The reading and what a row opens.
 * @returns The lists, or nothing for a list with nothing in it.
 */
function ModelPanelContext(props: ModelPanelContextProps): JSX.Element {
	const { model, projection, selected } = props;
	const { depicted, opened, reference } = projection;
	const { flows, walkthroughs } = useMemo(
		() => contextOf(model, depicted, opened, selected),
		[model, depicted, opened, selected],
	);
	const collections = useMemo(() => flowCollections(model, reference), [model, reference]);
	return (
		<>
			<ContextList title="Flows" slot="model-panel-flows" entries={flows}>
				{(entry) => (
					<ContextRow
						key={entry.id}
						id={entry.id}
						name={entry.name}
						detail={collections.get(entry.id)}
						current={entry.id === props.flow}
						onOpen={props.onFlow}
					/>
				)}
			</ContextList>
			<ContextList title="Walkthroughs" slot="model-panel-walkthroughs" entries={walkthroughs}>
				{(entry) => (
					<ContextRow
						key={entry.id}
						id={entry.id}
						name={entry.name}
						detail={stepsOf(entry)}
						current={false}
						onOpen={props.onWalkthrough}
					/>
				)}
			</ContextList>
		</>
	);
}

/**
 * How long a walkthrough is.
 * @param walkthrough The walkthrough.
 * @returns Its number of steps, in words.
 */
function stepsOf(walkthrough: Model["walkthroughs"][number]): string {
	const { length } = walkthrough.beats;
	return length === 1 ? "1 step" : `${length} steps`;
}

/**
 * One list, which a reading with nothing to list leaves out.
 * @param props The list.
 * @param props.title What it lists.
 * @param props.slot Where a test finds it.
 * @param props.entries What it lists.
 * @param props.children One row.
 * @returns The list, or nothing.
 */
function ContextList<Entry>(props: {
	readonly title: string;
	readonly slot: string;
	readonly entries: readonly Entry[];
	readonly children: (entry: Entry) => ReactNode;
}): JSX.Element | null {
	const { entries } = props;
	if (entries.length === 0) return null;
	return (
		<ModelPanel.Section title={props.title} count={entries.length} slot={props.slot}>
			<ModelPanel.Rows items={entries} limit={FEW_ROWS}>
				{props.children}
			</ModelPanel.Rows>
		</ModelPanel.Section>
	);
}

/**
 * One row, which opens what it names. Alt opens it in the other pane, as in the left column.
 * @param props What it names and what it does.
 * @param props.id What it opens.
 * @param props.name Its name.
 * @param props.detail What the row says of it.
 * @param props.current Whether it is on screen.
 * @param props.onOpen Open it.
 * @returns A row of the panel.
 */
function ContextRow(props: {
	readonly id: string;
	readonly name: string;
	readonly detail: string | undefined;
	readonly current: boolean;
	readonly onOpen: (id: string, beside: boolean) => void;
}): JSX.Element {
	const { id, onOpen } = props;
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => onOpen(id, event.altKey),
		[id, onOpen],
	);
	return (
		<ModelPanel.Row
			data-context-row={id}
			aria-current={props.current ? "location" : undefined}
			onClick={open}
			name={props.name}
			detail={props.detail}
		/>
	);
}

export { ModelPanelContext };

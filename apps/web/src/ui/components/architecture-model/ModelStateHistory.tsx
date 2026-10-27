import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";
import { AuthoredReference } from "#ui/components/architecture-model/AuthoredReference.tsx";
import { ModelCorrections } from "#ui/components/architecture-model/ModelCorrections.tsx";

type State = NonNullable<Model["selectedState"]>;
interface HistoryProps {
	state: Model["selectedState"];
	comparison: Model["comparison"];
	paneId: string;
	states: Readonly<NonNullable<Model["states"]>>;
}

/**
 * Read the explicit decision and lineage without deriving history from archive order.
 * @param props The selected public state metadata and its pane.
 * @returns The decision and an optional history disclosure.
 */
function ModelStateHistory(props: HistoryProps): JSX.Element {
	const { state } = props;
	const location = useModelLocation(props.paneId);
	const trails = correctionTrails(props);
	const reason = state?.reason;
	const visible = hasHistory(state) || Boolean(trails.against?.length);
	return (
		<>
			{reason && (
				<p data-slot="model-state-reason" className="text-body whitespace-pre-wrap">
					{reason}
				</p>
			)}
			{visible && (
				<details data-slot="model-state-history" className="text-body">
					<summary className="text-muted-foreground cursor-pointer">{historyLabel(state)}</summary>
					<div className="mt-3 max-h-64 max-w-prose space-y-4 overflow-y-auto">
						<StateFacts
							state={state}
							states={props.states}
							onState={location.selectState}
							onCheckpoint={location.selectCheckpoint}
						/>
						<ModelCorrections corrections={trails.selected} onRead={location.selectCheckpoint} />
						<ModelCorrections
							corrections={trails.against}
							onRead={location.selectCheckpoint}
							comparison
						/>
					</div>
				</details>
			)}
		</>
	);
}

/**
 * Omit an empty disclosure when the source records no history facts.
 * @param state The selected state metadata.
 * @returns Whether at least one authored or retained fact exists.
 */
function hasHistory(state: HistoryProps["state"]): boolean {
	if (state === null) return false;
	return [
		state.createdAt,
		state.adoptedAt,
		state.shelvedAt,
		state.predecessor,
		state.previousCurrent,
		state.baseline,
		state.documents?.length,
		state.corrections?.length,
	].some(Boolean);
}

/**
 * A collapsed disclosure still identifies corrected facts.
 * @param state The selected retained metadata.
 * @returns Its history label with the recorded correction count.
 */
function historyLabel(state: HistoryProps["state"]): string {
	const count = state?.corrections?.length ?? 0;
	if (count === 0) return "Decision and history";
	return `Decision and history · ${count} ${count === 1 ? "correction" : "corrections"}`;
}

/**
 * Keep the selected audit and comparison audit distinct, including an empty selected model.
 * @param props The complete state and comparison metadata.
 * @returns Both authoritative correction trails without inventing entries.
 */
function correctionTrails(props: Pick<HistoryProps, "state" | "comparison">) {
	return { selected: props.state?.corrections, against: props.comparison?.corrections?.against };
}

/**
 * An empty selected model has no lifecycle facts, but its comparison can still have corrections.
 * @param props The selected metadata and existing lineage actions.
 * @param props.state The selected state, or no implemented architecture.
 * @param props.states The named state catalogue.
 * @param props.onState Open a logical state.
 * @param props.onCheckpoint Open exact retained facts.
 * @returns Recorded lifecycle facts only when a selected state exists.
 */
function StateFacts(
	props: Pick<HistoryProps, "state" | "states"> & {
		onState: ReturnType<typeof useModelLocation>["selectState"];
		onCheckpoint: ReturnType<typeof useModelLocation>["selectCheckpoint"];
	},
): JSX.Element | null {
	const { state } = props;
	if (state === null) return null;
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
			<StateDates state={state} />
			<StateLineage state={state} states={props.states} onSelect={props.onState} />
			{state.baseline && (
				<HistoryLink label="Baseline" id={state.baseline} onSelect={props.onCheckpoint} exact />
			)}
			<StateDocuments state={state} />
		</dl>
	);
}

const DATES = [
	["createdAt", "Proposed"],
	["adoptedAt", "Adopted"],
	["shelvedAt", "Shelved"],
] as const;

/**
 * Keep machine-readable timestamps while formatting dates for the reader.
 * @param props The selected state.
 * @param props.state Its explicit lifecycle dates.
 * @returns Only recorded dates.
 */
function StateDates({ state }: { state: State }): JSX.Element {
	return (
		<>
			{DATES.map(([field, label]) => {
				const value = state[field];
				return value === undefined ? null : (
					<StateDate key={field} field={field} label={label} value={value} />
				);
			})}
		</>
	);
}

/**
 * Present one retained date as a definition.
 * @param props The recorded value and its purpose.
 * @param props.field The protocol field.
 * @param props.label Its readable label.
 * @param props.value The ISO timestamp.
 * @returns One date row.
 */
function StateDate(props: { field: string; label: string; value: string }): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground">{props.label}</dt>
			<dd>
				<time data-state-date={props.field} dateTime={props.value}>
					{checkpointTime(props.value)}
				</time>
			</dd>
		</>
	);
}

/**
 * Combine identical predecessor and prior-current destinations into one deliberate action.
 * @param props The state lineage and router action.
 * @param props.state The selected metadata.
 * @param props.states The catalogue that names each ancestor.
 * @param props.onSelect Opens a logical state.
 * @returns The distinct recorded ancestors.
 */
function StateLineage({
	state,
	states,
	onSelect,
}: Pick<HistoryProps, "states"> & { state: State; onSelect: (id: string) => void }): JSX.Element {
	const predecessor = state.predecessor;
	const previous = state.previousCurrent;
	return (
		<>
			{predecessor && (
				<HistoryLink
					label={
						predecessor === previous ? "Predecessor and previous implementation" : "Predecessor"
					}
					id={predecessor}
					name={stateName(states, predecessor)}
					onSelect={onSelect}
				/>
			)}
			{previous && previous !== predecessor && (
				<HistoryLink
					label="Previous implementation"
					id={previous}
					name={stateName(states, previous)}
					onSelect={onSelect}
				/>
			)}
		</>
	);
}

/**
 * Use the existing router for either a logical state or an exact baseline.
 * @param props The destination and the matching router action.
 * @param props.label Its role in the lineage.
 * @param props.id Its stable identity.
 * @param props.name Its authored state name, when available.
 * @param props.onSelect Opens the requested reading.
 * @param props.exact Whether the destination is a retained checkpoint.
 * @returns One accessible history action.
 */
function HistoryLink(props: {
	label: string;
	id: string;
	name?: string;
	onSelect: (id: string) => void;
	exact?: boolean;
}): JSX.Element {
	const { id, onSelect } = props;
	const open = useCallback(() => onSelect(id), [id, onSelect]);
	return (
		<>
			<dt className="text-muted-foreground">{props.label}</dt>
			<dd>
				<Button
					variant="ghost"
					size="sm"
					data-state-link={props.exact ? undefined : id}
					data-checkpoint-link={props.exact ? id : undefined}
					onClick={open}
				>
					<code>{props.exact ? id.slice(0, 8) : (props.name ?? id)}</code>
				</Button>
			</dd>
		</>
	);
}

/**
 * Preserve authored document evidence alongside the decision.
 * @param props The selected state's evidence.
 * @param props.state Its document references.
 * @returns Each distinct reference without another read.
 */
function StateDocuments({ state }: { state: State }): JSX.Element | null {
	const documents = new Map(
		state.documents?.map((reference) => [JSON.stringify(reference), reference]),
	);
	if (documents.size === 0) return null;
	return (
		<>
			<dt className="text-muted-foreground">Documents</dt>
			<dd>
				<ul data-slot="model-state-documents" className="space-y-3">
					{[...documents].map(([key, reference]) => (
						<li key={key}>
							<AuthoredReference reference={reference} />
						</li>
					))}
				</ul>
			</dd>
		</>
	);
}

/**
 * Name an ancestor without replacing an unavailable identity.
 * @param states The public catalogue.
 * @param id The exact logical destination.
 * @returns Its authored name or its unresolved identity.
 */
function stateName(states: HistoryProps["states"], id: string): string {
	return states.find((entry) => entry.id === id)?.name ?? id;
}

export { ModelStateHistory };

import { useCallback, useMemo, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import { Button } from "@archboard/ui-kit/components";
import { PartHistory } from "#ui/architecture-drawing/canvas/presentation/components/PartHistory.tsx";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { modelHistoryQuery } from "#ui/architecture-drawing/model-reader/access/clients/history.ts";

interface HistoryProps {
	vault: string;
	model: Pick<
		Model,
		| "manifest"
		| "revision"
		| "selectedState"
		| "checkpoint"
		| "modules"
		| "policy"
		| "migrationPreview"
	>;
	module: Model["modules"][number];
	onSelect: (id: string) => void;
}

/**
 * A bound canonical module shows its source history without starting a code check.
 * @param props The module, its coherent architecture, and the selection action.
 * @returns Its local Git evidence, or nothing for an unbound or original-only module.
 */
function ModelHistory(props: HistoryProps): JSX.Element | null {
	if (props.module.binding === undefined || props.model.migrationPreview !== undefined) return null;
	return <HistoryReading key={props.module.id} {...props} />;
}

/**
 * Preserve explicit loading, unavailable source, and retry states beside the authored module.
 * @param props The exact module and its architecture reading.
 * @returns Existing commit and coupling views over canonical history evidence.
 */
function HistoryReading(props: HistoryProps): JSX.Element {
	const query = useQuery(modelHistoryQuery(props.vault, props.model));
	const { refetch } = query;
	const read = useCallback((): void => {
		void refetch();
	}, [refetch]);
	const look = useMemo(() => kindLookOf(props.model.policy, new Map()), [props.model.policy]);
	return (
		<div data-slot="semantic-inspector-history" className="flex max-w-[72ch] flex-col gap-4">
			{!query.isPending && (
				<ReadAgain failed={query.error !== null} busy={query.isFetching} onRead={read} />
			)}
			{query.isFetching && (
				<output className="text-body text-muted-foreground">Reading Git history…</output>
			)}
			{query.error !== null && (
				<p role="alert" className="text-body">
					{query.error.message}
				</p>
			)}
			{query.data !== undefined && query.error === null && (
				<PartHistory
					answer={query.data}
					subject={props.module.id}
					nodes={props.model.modules}
					look={look}
					onPick={props.onSelect}
				/>
			)}
		</div>
	);
}

/**
 * The action that reads the history again, which a read needs only once it has answered.
 * @param props What the last read did and what the action does.
 * @param props.failed Whether the last read failed.
 * @param props.busy Whether a read runs.
 * @param props.onRead Read.
 * @returns The action.
 */
function ReadAgain(props: {
	readonly failed: boolean;
	readonly busy: boolean;
	readonly onRead: () => void;
}): JSX.Element {
	return (
		<Button
			variant="outline"
			className="self-start"
			onClick={props.onRead}
			disabled={props.busy}
			data-slot="module-read-history"
		>
			{props.failed ? "Read again" : "Refresh"}
		</Button>
	);
}

export { ModelHistory };

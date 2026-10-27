import { useCallback, useMemo, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import { Button } from "@archboard/ui-kit/components";
import { PartHistory } from "#ui/components/semantic-board-canvas/PartHistory.tsx";
import { SidebarRegion } from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { kindLookOf } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import { modelHistoryQuery } from "#ui/clients/architecture-model/history.ts";

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
 * A bound canonical module exposes source history without starting a code check.
 * @param props The module, its coherent architecture, and the selection action.
 * @returns Its local Git evidence, or no history action for an unbound or original-only module.
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
	const refresh = useCallback((): void => {
		void refetch();
	}, [refetch]);
	const look = useMemo(() => kindLookOf(props.model.policy, new Map()), [props.model.policy]);
	return (
		<SidebarRegion slot="semantic-inspector-history">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-title font-semibold">Local code history</h3>
				<Button onClick={refresh} disabled={query.isFetching}>
					Refresh
				</Button>
			</div>
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
		</SidebarRegion>
	);
}

export { ModelHistory };

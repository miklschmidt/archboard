import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { useCallback, useState, type JSX, type ReactNode } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { RiRefreshLine } from "@remixicon/react";
import type { ArchitectureModelRead, ArchitectureCheckpointList } from "@archboard/board/model";
import { Button } from "@archboard/ui-kit/components";
import {
	PaneHeaderRow,
	PaneHeaderStart,
	PaneHeaderEnd,
} from "#ui/components/semantic-board-canvas/PaneHeaderFrame.tsx";
import {
	ArchitectureReadError,
	architectureModelQuery,
	architectureModelKeys,
	architectureCheckpointsQuery,
	hasNoCanonicalModel,
	hasNoCheckpoints,
} from "#ui/clients/architecture-model/queries.ts";
import { semanticBoardListQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { ModelReading } from "#ui/components/architecture-model/ModelReading.tsx";
import { ModelReadingSelector } from "#ui/components/architecture-model/ModelReadingSelector.tsx";
import { CheckpointEvidence } from "#ui/components/architecture-model/CheckpointEvidence.tsx";
import { ModelPublication } from "#ui/components/architecture-model/ModelPublication.tsx";
import { ModelClaims } from "#ui/components/architecture-model/ModelClaims.tsx";

import { useArchitectureFeed } from "#ui/hooks/architecture-model/use-architecture-feed.ts";

type ModelQuery = UseQueryResult<Extract<ArchitectureModelRead, { success: true }>>;

interface ModelStageProps {
	vault: string;
	paneId: string;
	reducedMotion: boolean;
	children: ReactNode;
}

/**
 * A canonical model occupies a pane that holds no legacy board.
 * @param props The vault and the existing empty-board fallback.
 * @returns A model reader, or the existing board surface.
 */
function ArchitectureModelStage(props: ModelStageProps): JSX.Element {
	const boards = useQuery(semanticBoardListQuery(props.vault));
	if (boards.data?.boards.length !== 0) return <>{props.children}</>;
	return <CanonicalModelReader {...props} />;
}

/**
 * The query is the sole owner of model content in the browser.
 * @param props The vault and legacy fallback.
 * @returns One coherent reading with explicit recovery.
 */
function CanonicalModelReader(props: ModelStageProps): JSX.Element {
	const [checkpoint, selectCheckpoint] = useState<string | null>(null);
	const feed = useArchitectureFeed(props.vault);
	const query = useQuery(architectureModelQuery(props.vault, checkpoint));
	const history = useQuery(architectureCheckpointsQuery(props.vault));
	const { data } = query;
	const client = useQueryClient();
	const { vault } = props;
	const current = checkpoint === null;
	const stale = currentIsStale(query, current, feed);
	const refresh = useCallback((): void => {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
	}, [client, vault]);
	if (hasNoReadings(query, history, checkpoint)) return <>{props.children}</>;
	return (
		<section
			data-slot="architecture-model-stage"
			data-state={readingState(query, stale)}
			data-stale={stale}
			data-connection={feed.connection}
			data-reading={checkpoint ?? "current"}
			aria-busy={query.isFetching}
			aria-label="Architecture"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader name={modelName(data)} refresh={refresh} refreshing={query.isFetching}>
				<ModelReadingSelector
					checkpoint={checkpoint}
					onSelect={selectCheckpoint}
					history={history}
				/>
			</ModelHeader>
			{checkpoint !== null && (
				<ModelPublication key={checkpoint} vault={vault} checkpoint={checkpoint} />
			)}
			{checkpoint === null && <ModelClaims vault={props.vault} model={data} />}
			<ModelResponse
				paneId={props.paneId}
				reducedMotion={props.reducedMotion}
				query={query}
				current={current}
				stale={stale}
				failure={current ? feed.failure : null}
			/>
		</section>
	);
}

/**
 * A cached current reading stays visible only with its availability stated.
 * @param query The selected read and its last coherent result.
 * @param current Whether this is a current reading.
 * @param feed The current update stream's availability.
 * @returns Whether the visible cached model lacks fresh confirmation.
 */
function currentIsStale(
	query: ModelQuery,
	current: boolean,
	feed: ReturnType<typeof useArchitectureFeed>,
): boolean {
	if (!current) return false;
	if (query.data === undefined) return false;
	return query.isError || feed.connection !== "live" || feed.failure !== null || feed.refreshing;
}

/**
 * Historical failures never substitute another reading or silently reuse an unavailable checkpoint.
 * @param query The selected read.
 * @param current Whether stale current content can remain visible.
 * @returns The coherent content that this surface can show.
 */
function visibleModel(query: ModelQuery, current: boolean): ModelQuery["data"] {
	if (!current && query.isError) return undefined;
	return query.data;
}

/**
 * Keep saved readings reachable even when current inputs disappear.
 * @param query The explicitly selected reading.
 * @param history Retained metadata, independent of current inputs.
 * @param checkpoint The selected identity, or null for current.
 * @returns True only when both current and retained architecture are absent.
 */
function hasNoReadings(
	query: ModelQuery,
	history: UseQueryResult<ArchitectureCheckpointList>,
	checkpoint: string | null,
): boolean {
	return (
		checkpoint === null &&
		query.data === undefined &&
		query.isError &&
		history.isSuccess &&
		hasNoCanonicalModel(query.error) &&
		hasNoCheckpoints(history.data)
	);
}

/**
 * Name only the coherent model that the server returned.
 * @param model The current query result.
 * @returns Its name or the neutral loading name.
 */
function modelName(model: ArchitectureModelRead | undefined): string {
	return model?.success ? model.manifest.name : "Architecture";
}

/**
 * The visible read state includes domain refusals and transport failures.
 * @param query The shared query snapshot.
 * @param stale Whether the cached current reading lacks fresh confirmation.
 * @returns The visible state.
 */
function readingState(query: ModelQuery, stale: boolean): "loading" | "error" | "stale" | "ready" {
	if (query.isPending || query.isFetching) return "loading";
	if (query.isError) return "error";
	return stale ? "stale" : "ready";
}

interface ModelResponseProps {
	paneId: string;
	reducedMotion: boolean;
	query: ModelQuery;
	current: boolean;
	stale: boolean;
	failure: Extract<ArchitectureModelRead, { success: false }> | null;
}

/**
 * Render the result without mixing a failed read with cached module content.
 * @param props The query snapshot.
 * @returns The authored model or its unavailable state.
 */
function ModelResponse(props: ModelResponseProps): JSX.Element {
	const { query, stale } = props;
	if (query.isPending)
		return <output className="text-body text-muted-foreground p-10">Reading architecture…</output>;
	const problem = readingProblem(query.error, props.failure);
	const model = visibleModel(query, props.current);
	return (
		<>
			{stale && (
				<output
					data-slot="model-stale"
					className="border-border bg-status-subtle text-status-foreground text-body border-b px-4 py-2"
				>
					Showing the last coherent reading. Current architecture is not confirmed. Refresh to
					retry.
				</output>
			)}
			{problem !== null && <ModelError {...problem} compact={stale} />}
			{model !== undefined && (
				<>
					<CheckpointEvidence model={model} />
					<ModelReading
						key={model.manifest.id}
						model={model}
						paneId={props.paneId}
						reducedMotion={props.reducedMotion}
					/>
				</>
			)}
		</>
	);
}

/**
 * Present a refusal from either the selected read or the current update stream.
 * @param error The selected request failure.
 * @param observed The current stream's refusal.
 * @returns The visible problem, without discarding cached coherent content.
 */
function readingProblem(
	error: Error | null,
	observed: ModelResponseProps["failure"],
): ModelErrorProps | null {
	const failure = error instanceof ArchitectureReadError ? error.failure : observed;
	if (failure !== null)
		return { code: failure.code, message: failure.error, diagnostics: failure.diagnostics };
	return error === null ? null : { code: failureCode(error), message: error.message };
}

/**
 * Read a structured request refusal without depending on its error class.
 * @param error The failed request.
 * @returns Its public refusal code or the transport fallback.
 */
function failureCode(error: Error): string {
	return "code" in error && typeof error.code === "string" ? error.code : "READ_FAILED";
}

interface ModelErrorProps {
	compact?: boolean;
	code: string;
	message: string;
	diagnostics?: Extract<ArchitectureModelRead, { success: false }>["diagnostics"];
}

/**
 * Keep the server's diagnostic and recovery instruction together.
 * @param props The refusal and its optional domain diagnostics.
 * @returns A recoverable error beside the header's Refresh action.
 */
function ModelError(props: ModelErrorProps): JSX.Element {
	const diagnostics = new Map(props.diagnostics?.map((entry) => [JSON.stringify(entry), entry]));
	return (
		<div
			role="alert"
			data-slot="model-error"
			data-code={props.code}
			className={
				props.compact
					? "text-body border-border max-h-40 shrink-0 space-y-2 overflow-auto border-b px-4 py-3"
					: "text-body max-w-prose space-y-4 p-10"
			}
		>
			<h3 className="text-title font-semibold">Architecture unavailable</h3>
			<p>{props.message}</p>
			{[...diagnostics].map(([key, diagnostic]) => (
				<div key={key} className="space-y-1">
					{diagnostic.file && <code className="text-control break-all">{diagnostic.file}</code>}
					<p>{diagnostic.message}</p>
					<p className="text-muted-foreground">{diagnostic.recovery}</p>
				</div>
			))}
		</div>
	);
}

interface ModelHeaderProps {
	name: string;
	refresh: () => void;
	refreshing: boolean;
	children: ReactNode;
}

/**
 * The model uses the same header frame and pane controls as a board.
 * @param props The model name and explicit read action.
 * @returns The pane header.
 */
function ModelHeader(props: ModelHeaderProps): JSX.Element {
	const { controls } = usePaneChrome();
	return (
		<PaneHeaderRow>
			<PaneHeaderStart>
				<h2 className="text-control truncate font-semibold">{props.name}</h2>
				{props.children}
			</PaneHeaderStart>
			<PaneHeaderEnd>
				<Button
					variant="ghost"
					size="sm"
					data-slot="model-refresh"
					onClick={props.refresh}
					disabled={props.refreshing}
				>
					<RiRefreshLine aria-hidden="true" className="size-4" />
					{props.refreshing ? "Reading…" : "Refresh"}
				</Button>
				{controls}
			</PaneHeaderEnd>
		</PaneHeaderRow>
	);
}

export { ArchitectureModelStage };

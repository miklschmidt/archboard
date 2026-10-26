import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { useCallback, type JSX, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RiRefreshLine } from "@remixicon/react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { Button } from "@archboard/ui-kit/components";
import {
	PaneHeaderRow,
	PaneHeaderStart,
	PaneHeaderEnd,
} from "#ui/components/semantic-board-canvas/PaneHeaderFrame.tsx";
import {
	architectureModelQuery,
	hasNoCanonicalModel,
} from "#ui/clients/architecture-model/queries.ts";
import { semanticBoardListQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { ModelReading } from "#ui/components/architecture-model/ModelReading.tsx";

interface ModelStageProps {
	vault: string;
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
	const query = useQuery(architectureModelQuery(props.vault));
	const { refetch, data, isError } = query;
	const refresh = useCallback((): void => {
		void refetch();
	}, [refetch]);
	if (data !== undefined && hasNoCanonicalModel(data) && !isError) return <>{props.children}</>;
	return (
		<section
			data-slot="architecture-model-stage"
			data-state={readingState(query)}
			aria-label="Architecture"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader name={modelName(data)} refresh={refresh} refreshing={query.isFetching} />
			<ModelResponse query={query} />
		</section>
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
 * @returns The visible state.
 */
function readingState(query: UseQueryResult<ArchitectureModelRead>): "loading" | "error" | "ready" {
	if (query.isPending) return "loading";
	if (query.isError) return "error";
	return query.data.success ? "ready" : "error";
}

interface ModelResponseProps {
	query: UseQueryResult<ArchitectureModelRead>;
}

/**
 * Render the result without mixing a failed read with cached module content.
 * @param props The query snapshot.
 * @returns The authored model or its unavailable state.
 */
function ModelResponse(props: ModelResponseProps): JSX.Element {
	const { query } = props;
	if (query.isPending)
		return <output className="text-body text-muted-foreground p-10">Reading architecture…</output>;
	if (query.isError) return <ModelError code="READ_FAILED" message={query.error.message} />;
	if (!query.data.success)
		return (
			<ModelError
				code={query.data.code}
				message={query.data.error}
				diagnostics={query.data.diagnostics}
			/>
		);
	return <ModelReading key={query.data.manifest.id} model={query.data} />;
}

interface ModelErrorProps {
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
			className="text-body max-w-prose space-y-4 p-10"
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

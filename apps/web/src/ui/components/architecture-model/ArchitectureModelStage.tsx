import {
	ModelHeader,
	ModelError,
	type ModelErrorProps,
} from "#ui/components/architecture-model/ModelFrame.tsx";
import { ModelPreviewReader } from "#ui/components/architecture-model/ModelPreviewReader.tsx";
import { ModelBookmarks } from "#ui/components/architecture-model/ModelBookmarks.tsx";
import { ModelLegacyAddresses } from "#ui/components/architecture-model/ModelLegacyAddresses.tsx";
import { ModelOriginalDestination } from "#ui/components/architecture-model/ModelOriginalDestination.tsx";
import { importedReadings } from "#ui/rules/architecture-model/imported-readings.ts";
import { stateCatalogue } from "#ui/rules/architecture-model/state-catalogue.ts";
import { useCallback, useEffect, type ComponentProps, type JSX, type ReactNode } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { ArchitectureModelRead, ArchitectureCheckpointList } from "@archboard/board/model";
import {
	ArchitectureReadError,
	architectureModelQuery,
	architectureModelKeys,
	architectureCheckpointsQuery,
	hasNoCanonicalModel,
	hasNoCheckpoints,
} from "#ui/clients/architecture-model/queries.ts";
import { ModelStateDetails } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import { ModelWalkthroughReader } from "#ui/components/architecture-model/ModelWalkthroughReader.tsx";
import { ModelReading } from "#ui/components/architecture-model/ModelReading.tsx";
import { ModelReadingSelector } from "#ui/components/architecture-model/ModelReadingSelector.tsx";
import { ModelComparisonSelector } from "#ui/components/architecture-model/ModelComparisonSelector.tsx";
import { CheckpointEvidence } from "#ui/components/architecture-model/CheckpointEvidence.tsx";
import { ModelPublication } from "#ui/components/architecture-model/ModelPublication.tsx";
import { ModelClaims } from "#ui/components/architecture-model/ModelClaims.tsx";

import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { useModelVault } from "#ui/hooks/architecture-model/use-model-vault.ts";

import { useArchitectureFeed } from "#ui/hooks/architecture-model/use-architecture-feed.ts";

type ModelQuery = UseQueryResult<Extract<ArchitectureModelRead, { success: true }>>;

interface ModelStageProps
	extends
		Pick<ComponentProps<typeof ModelReading>, "onCodeTargetNotice">,
		Pick<ComponentProps<typeof ModelWalkthroughReader>, "driven" | "narration" | "overlay"> {
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
	const reading = useModelVault(props.vault, props.paneId);
	if (reading.vault !== null) return <LocatedModelStage {...props} vault={reading.vault} />;
	return (
		<section
			data-slot="architecture-model-stage"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader
				name="Architecture"
				refresh={reading.refresh}
				refreshing={reading.query.isFetching}
			>
				{null}
			</ModelHeader>
			{reading.query.isPending ? (
				<output className="text-body p-8">Locating repository…</output>
			) : (
				<ModelError
					code="REFERENCE_UNAVAILABLE"
					message={
						reading.query.error?.message ??
						reading.error ??
						"Repository information is unavailable. Refresh to retry."
					}
				/>
			)}
		</section>
	);
}

/**
 * Explicit canonical intent stays canonical even when the target still holds legacy boards.
 * @param props The resolved repository and requested pane.
 * @returns Its canonical reader or the existing empty-board surface.
 */
function LocatedModelStage(props: ModelStageProps): JSX.Element {
	const { preview } = useModelLocation(props.paneId);
	if (preview !== null) return <ModelPreviewReader key={props.vault} {...props} />;
	return <CanonicalModelReader key={props.vault} {...props} />;
}

/**
 * The query is the sole owner of model content in the browser.
 * @param props The vault and legacy fallback.
 * @returns One coherent reading with explicit recovery.
 */
function CanonicalModelReader(props: ModelStageProps): JSX.Element {
	const {
		board,
		bookmark,
		legacyAddress,
		selectBookmark,
		selectLegacyAddress,
		checkpoint,
		state,
		against,
		subject,
		selectState,
		compareAgainst,
		selectCheckpoint,
		model: requestedModel,
		identify,
	} = useModelLocation(props.paneId);
	const feed = useArchitectureFeed(props.vault);
	const query = useQuery(
		architectureModelQuery(props.vault, checkpoint, {
			state,
			against,
			bookmark,
			legacyAddress: legacyAddress ?? (requestedModel === null ? board : null),
		}),
	);
	const catalogue = useQuery(architectureModelQuery(props.vault));
	const history = useQuery(architectureCheckpointsQuery(props.vault));
	const { data } = query;
	const resolvedId = data?.manifest.id;
	const original = data?.migrationPreview !== undefined;
	useEffect(() => {
		if (resolvedId !== undefined && !original) identify(resolvedId);
	}, [identify, resolvedId, original]);
	const client = useQueryClient();
	const { vault } = props;
	const current = checkpoint === null;
	const stale = currentIsStale(query, current, feed);
	const refresh = useCallback((): void => {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
	}, [client, vault]);
	if (requestedModel === null && legacyAuthority(query, feed)) return <>{props.children}</>;
	if (requestedModel === null && board === null && hasNoReadings(query, history, checkpoint))
		return <>{props.children}</>;
	if (differentModel(resolvedId, requestedModel)) {
		return (
			<ModelIdentityFailure id={requestedModel} refresh={refresh} refreshing={query.isFetching} />
		);
	}
	if (data?.migrationPreview !== undefined)
		return <ModelOriginalDestination model={data} paneId={props.paneId} />;
	return (
		<section
			data-slot="architecture-model-stage"
			data-state={readingState(query, stale)}
			data-stale={stale}
			data-connection={feed.connection}
			data-reading={readingIdentity(checkpoint, state)}
			aria-busy={query.isFetching}
			aria-label="Architecture"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader name={modelName(data)} refresh={refresh} refreshing={query.isFetching}>
				<ModelReadingSelector
					checkpoint={checkpoint}
					state={state}
					selected={data?.selectedState}
					catalogue={catalogue}
					onState={selectState}
					onSelect={selectCheckpoint}
					history={history}
				/>
				<ModelComparisonSelector
					against={against}
					onSelect={compareAgainst}
					catalogue={catalogue}
					history={history}
				/>
				<ModelBookmarks
					catalogue={importedReadings(data)}
					selected={bookmark}
					pending={query.isPending}
					onSelect={selectBookmark}
				/>
				<ModelLegacyAddresses
					catalogue={importedReadings(data)}
					selected={legacyAddress}
					pending={query.isPending}
					onSelect={selectLegacyAddress}
				/>
			</ModelHeader>
			<ModelControls vault={vault} checkpoint={checkpoint} model={data} />
			<ModelResponse
				subject={subject}
				paneId={props.paneId}
				vault={props.vault}
				reducedMotion={props.reducedMotion}
				query={query}
				states={stateCatalogue(catalogue.data)}
				current={current}
				stale={stale}
				failure={feed.failure}
				onCodeTargetNotice={props.onCodeTargetNotice}
				driven={props.driven}
				narration={props.narration}
				overlay={props.overlay}
			/>
		</section>
	);
}

/**
 * Compare the requested identity with the coherent model that arrived.
 * @param actual The returned model identity, when available.
 * @param requested The explicit address identity, when present.
 * @returns Whether the address names another model.
 */
function differentModel(actual: string | undefined, requested: string | null): requested is string {
	return actual !== undefined && requested !== null && actual !== requested;
}

/**
 * Current ownership and exact-history publication have separate controls.
 * @param props The selected reading and its coherent content.
 * @param props.vault The addressed vault.
 * @param props.checkpoint The exact checkpoint, or current.
 * @param props.model The current query result.
 * @returns Only the controls that belong to this reading.
 */
function ModelControls(props: {
	vault: string;
	checkpoint: string | null;
	model: ModelQuery["data"];
}): JSX.Element {
	return props.checkpoint === null ? (
		<ModelClaims vault={props.vault} model={props.model} />
	) : (
		<ModelPublication key={props.checkpoint} vault={props.vault} checkpoint={props.checkpoint} />
	);
}

/**
 * An address cannot silently open another model from the selected vault.
 * @param props The unavailable identity and its explicit refresh action.
 * @param props.id The requested model identity.
 * @param props.refresh Retry the read.
 * @param props.refreshing Whether a read is pending.
 * @returns The requested identity with no substitute content or actions.
 */
function ModelIdentityFailure(props: {
	id: string;
	refresh: () => void;
	refreshing: boolean;
}): JSX.Element {
	return (
		<section
			data-slot="architecture-model-stage"
			data-state="error"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader name="Architecture" refresh={props.refresh} refreshing={props.refreshing}>
				{null}
			</ModelHeader>
			<ModelError
				code="MODEL_NOT_FOUND"
				message={`The selected vault does not contain model ${props.id}. Open the model in its repository.`}
			/>
		</section>
	);
}

/**
 * Preserve the requested state or checkpoint even when its content is unavailable.
 * @param checkpoint The exact retained reading.
 * @param state The explicit mutable state.
 * @returns The addressed reading identity, or current inputs.
 */
function readingIdentity(checkpoint: string | null, state: string | null): string {
	return checkpoint ?? state ?? "current";
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
 * Only the public reader can authorize the legacy surface.
 * @param query The requested reading and its exact refusal.
 * @param feed The latest ordered authority status.
 * @returns Whether live legacy content remains authoritative.
 */
function legacyAuthority(query: ModelQuery, feed: ReturnType<typeof useArchitectureFeed>): boolean {
	return (
		query.isError &&
		!query.isFetching &&
		query.error instanceof ArchitectureReadError &&
		query.error.failure.code === "LEGACY_AUTHORITY" &&
		(feed.failure === null || feed.failure.code === "LEGACY_AUTHORITY")
	);
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

interface ModelResponseProps extends Pick<
	ModelStageProps,
	"vault" | "paneId" | "reducedMotion" | "onCodeTargetNotice" | "driven" | "narration" | "overlay"
> {
	subject: string | null;
	query: ModelQuery;
	states: ReturnType<typeof stateCatalogue>;
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
	const problem = readingProblem(query.error, props.current ? props.failure : null);
	const model = visibleModel(query, props.current);
	const bookmarkProblems = importedReadings(model)?.bookmark?.diagnostics;
	if (bookmarkProblems !== undefined && bookmarkProblems.length > 0)
		return (
			<ModelError
				code="BOOKMARK_UNAVAILABLE"
				message="This bookmark cannot be drawn. Select another reading or update the bookmark."
				diagnostics={bookmarkProblems}
			/>
		);
	return (
		<>
			{stale && (
				<output
					data-slot="model-stale"
					className="border-border bg-status-subtle text-status-foreground text-body border-b px-4 py-2"
				>
					Showing the last coherent reading. The selected architecture is not confirmed. Refresh to
					retry.
				</output>
			)}
			{problem !== null && <ModelError {...problem} compact={stale} />}
			{model !== undefined && (
				<>
					<ModelStateDetails model={model} paneId={props.paneId} states={props.states} />
					<CheckpointEvidence model={model} />
					<ModelWalkthroughReader
						key={readingSessionKey(model, props.subject)}
						vault={props.vault}
						model={model}
						paneId={props.paneId}
						reducedMotion={props.reducedMotion}
						driven={props.driven}
						narration={props.narration}
						overlay={props.overlay}
					>
						<ModelReading
							subject={props.subject}
							vault={props.vault}
							model={model}
							paneId={props.paneId}
							reducedMotion={props.reducedMotion}
							onCodeTargetNotice={props.onCodeTargetNotice}
						/>
					</ModelWalkthroughReader>
				</>
			)}
		</>
	);
}

/**
 * Changing architecture selection closes its presentation while live updates preserve it.
 * @param model The selected architecture.
 * @param subject The explicit navigation destination.
 * @returns The identity of this reader session.
 */
function readingSessionKey(
	model: Extract<ArchitectureModelRead, { success: true }>,
	subject: string | null,
): string {
	return JSON.stringify([
		model.manifest.id,
		model.selectedState?.id,
		model.checkpoint?.id,
		subject,
	]);
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

export { ArchitectureModelStage };

import {
	ModelHeader,
	ModelError,
	type ModelErrorProps,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelFrame.tsx";
import {
	isUnread,
	ModelUnanswered,
	SlowRead,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelUnanswered.tsx";
import { ModelPane } from "#ui/architecture-drawing/model-reader/reading/components/ModelPane.tsx";
import { ModelPreviewReader } from "#ui/architecture-drawing/model-reader/reading/components/ModelPreviewReader.tsx";
import { ModelOriginalDestination } from "#ui/architecture-drawing/model-reader/reading/components/ModelOriginalDestination.tsx";
import { ModelBookmarkReading } from "#ui/architecture-drawing/model-reader/reading/components/ModelBookmarkReading.tsx";
import { stateCatalogue } from "#ui/architecture-drawing/model-reader/reading/rules/state-catalogue.ts";
import {
	useCallback,
	useEffect,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";
import {
	keepPreviousData,
	useQuery,
	useQueryClient,
	type UseQueryResult,
} from "@tanstack/react-query";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { shownRepository } from "@archboard/ui-kit/components";
import {
	ArchitectureReadError,
	architectureModelQuery,
	architectureModelKeys,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { ModelComparisonSelector } from "#ui/architecture-drawing/model-reader/reading/components/ModelComparisonSelector.tsx";
import { ModelStateDetails } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateDetails.tsx";
import { ModelWalkthroughReader } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthroughReader.tsx";
import { ModelReading } from "#ui/architecture-drawing/model-reader/reading/components/ModelReading.tsx";
import { ModelFailedRecords } from "#ui/architecture-drawing/model-reader/reading/components/ModelRecords.tsx";
import { CheckpointEvidence } from "#ui/architecture-drawing/model-reader/reading/components/CheckpointEvidence.tsx";
import { ModelPublication } from "#ui/architecture-drawing/model-reader/reading/components/ModelPublication.tsx";

import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { useModelVault } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-vault.ts";

import { useArchitectureFeed } from "#ui/architecture-drawing/model-reader/access/hooks/use-architecture-feed.ts";
import { retryFailedDrawings } from "#ui/architecture-drawing/model-reader/access/clients/drawing.ts";
import { comparisonIntent } from "#ui/architecture-drawing/model-reader/rules/comparison-intent.ts";
import { useTroubleReport } from "#ui/architecture-drawing/model-reader/reading/hooks/use-trouble-report.ts";
import {
	readingIsStale,
	readingTrouble,
	UNANSWERED_READ_CODE,
	type ReadingTrouble,
} from "#ui/architecture-drawing/model-reader/reading/rules/reading-freshness.ts";

type ModelQuery = UseQueryResult<Extract<ArchitectureModelRead, { success: true }>>;

interface ModelStageProps
	extends
		Pick<ComponentProps<typeof ModelReading>, "onCodeTargetNotice">,
		Pick<
			ComponentProps<typeof ModelWalkthroughReader>,
			"driven" | "narration" | "overlay" | "onPresentationEnd"
		> {
	vault: string;
	paneId: string;
	reducedMotion: boolean;
	/** Which time the pane has been pointed at a reading from outside. */
	arrival?: number | undefined;
	/** The repository of this reading, when the listing names it. */
	repository?: string | null | undefined;
	/** What is wrong with the reading on screen, or null once nothing is, for the shell to say. */
	onTrouble?: ((trouble: ReadingTrouble | null) => void) | undefined;
}

/**
 * A canonical model occupies a pane that holds no legacy board.
 * @param props The vault and the existing empty-model fallback.
 * @returns A model reader, or the existing legacy board surface.
 */
function ArchitectureModelStage(props: ModelStageProps): JSX.Element {
	const reading = useModelVault(props.vault, props.paneId);
	const { repository } = reading;
	if (reading.vault !== null)
		return <LocatedModelStage {...props} vault={reading.vault} repository={repository} />;
	return (
		<section
			data-slot="architecture-model-stage"
			className="bg-background flex min-h-0 flex-1 flex-col"
		>
			<ModelHeader
				name={headerName(undefined, repository)}
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
 * @returns Its canonical reader or the existing empty-model surface.
 */
function LocatedModelStage(props: ModelStageProps): JSX.Element {
	const { preview, subject } = useModelLocation(props.paneId);
	return (
		<ModelPane key={props.vault} subject={subject} arrival={props.arrival}>
			{preview !== null ? <ModelPreviewReader {...props} /> : <CanonicalModelReader {...props} />}
		</ModelPane>
	);
}

/**
 * The feed keeps a healthy reading live, so only a reading it cannot recover offers Refresh.
 * @param query The reading.
 * @param feed The live feed.
 * @param refresh Read again.
 * @returns The action, or nothing for a healthy reading.
 */
function offeredRefresh(
	query: ModelQuery,
	feed: ReturnType<typeof useArchitectureFeed>,
	refresh: () => void,
): (() => void) | undefined {
	const healthy = !query.isError && feed.connection === "live" && feed.failure === null;
	return healthy ? undefined : refresh;
}

/**
 * The query is the sole owner of model content in the browser.
 * @param props The vault and legacy fallback.
 * @returns One coherent reading with explicit recovery.
 */
function CanonicalModelReader(props: ModelStageProps): JSX.Element {
	const {
		bookmark,
		legacyAddress,
		checkpoint,
		ref,
		state,
		against,
		model: requestedModel,
		identify,
	} = useModelLocation(props.paneId);
	const feed = useArchitectureFeed(props.vault);
	const query = useQuery({
		...architectureModelQuery(props.vault, checkpoint, {
			ref,
			state,
			...comparisonIntent(against),
			bookmark,
			legacyAddress,
		}),
		placeholderData: keepPreviousData,
	});
	const catalogue = useQuery(architectureModelQuery(props.vault));
	const { data } = query;
	// The reading kept on screen while another loads answers no question about the address.
	const answered = query.isPlaceholderData ? undefined : data;
	const resolvedId = modelIdentity(answered);
	const original = isOriginalModel(answered);
	useEffect(() => {
		if (resolvedId !== undefined && !original) identify(resolvedId);
	}, [identify, resolvedId, original]);
	const client = useQueryClient();
	const { vault } = props;
	const current = followsLive(checkpoint, ref);
	const lost = feed.connection === "unavailable";
	const unread = isUnread(query.error);
	const stale = readingIsStale(query, current, feed);
	const refresh = useCallback((): void => {
		void client.invalidateQueries({ queryKey: architectureModelKeys.vault(vault) });
		void retryFailedDrawings(client);
	}, [client, vault]);
	if (differentModel(resolvedId, requestedModel)) {
		return (
			<ModelIdentityFailure id={requestedModel} refresh={refresh} refreshing={query.isFetching} />
		);
	}
	if (isOriginalModel(answered))
		return <ModelOriginalDestination model={answered} paneId={props.paneId} />;
	const header = (
		<>
			<ModelHeader
				name={headerName(data, props.repository)}
				refresh={unread ? undefined : offeredRefresh(query, feed, refresh)}
				refreshing={query.isFetching}
			/>
			<CheckpointPublication vault={vault} checkpoint={checkpoint} />
		</>
	);
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
			<ModelResponse
				header={header}
				paneId={props.paneId}
				vault={props.vault}
				reducedMotion={props.reducedMotion}
				query={query}
				destination={props.repository ?? requestedModel}
				states={stateCatalogue(catalogue.data)}
				catalogue={catalogue.data}
				current={current}
				stale={stale}
				lost={lost}
				failure={feed.failure}
				refresh={refresh}
				onCodeTargetNotice={props.onCodeTargetNotice}
				onTrouble={props.onTrouble}
				arrival={props.arrival}
				driven={props.driven}
				onPresentationEnd={props.onPresentationEnd}
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
 * Keep exact original responses distinct from current canonical authority.
 * @param model The selected query result.
 * @returns Whether the response carries retained original coverage.
 */
function isOriginalModel(model: ModelQuery["data"]): model is NonNullable<ModelQuery["data"]> & {
	migrationPreview: NonNullable<NonNullable<ModelQuery["data"]>["migrationPreview"]>;
} {
	return model?.migrationPreview !== undefined;
}

/**
 * Read the identity only from coherent returned content.
 * @param model The selected query result.
 * @returns Its identity, when available.
 */
function modelIdentity(model: ModelQuery["data"]): string | undefined {
	return model?.manifest.id;
}

/**
 * An exact checkpoint has its publication controls in the header. The live reading has none.
 * @param props The reading.
 * @param props.vault The addressed vault.
 * @param props.checkpoint The exact checkpoint, or null for the live reading.
 * @returns The controls, or nothing.
 */
function CheckpointPublication(props: {
	vault: string;
	checkpoint: string | null;
}): JSX.Element | null {
	const { vault, checkpoint } = props;
	return checkpoint === null ? null : (
		<ModelPublication key={checkpoint} vault={vault} checkpoint={checkpoint} />
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
 * A failed destination keeps the reading it was to replace. A retained reading that the server
 * refuses is gone, but a server that stopped answering says nothing about it.
 * @param query The selected read.
 * @param current Whether stale current content can remain visible.
 * @returns The coherent content that this surface can show.
 */
function useVisibleModel(query: ModelQuery, current: boolean): ModelQuery["data"] {
	const [kept, keep] = useState(query.data);
	if (query.data !== undefined && query.data !== kept) keep(query.data);
	if (query.data === undefined) return kept;
	return !current && query.error instanceof ArchitectureReadError ? undefined : query.data;
}

/**
 * Whether the model on screen answers the address.
 * @param query The selected read.
 * @returns That it is the answer, or that the read of the address failed.
 */
function readingAnswer(query: ModelQuery) {
	const answered = query.data !== undefined;
	return { settled: answered && !query.isPlaceholderData, failed: query.isError && !answered };
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
 * What the header names: before a model answers, or where none will, its repository.
 * @param model The current query result.
 * @param repository The repository of the reading, when the listing names it.
 * @returns The name.
 */
function headerName(
	model: ArchitectureModelRead | undefined,
	repository: string | null | undefined,
): string {
	if (model?.success === true || !repository) return modelName(model);
	return shownRepository(repository).name;
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
	| "vault"
	| "paneId"
	| "reducedMotion"
	| "onCodeTargetNotice"
	| "onTrouble"
	| "arrival"
	| "driven"
	| "narration"
	| "overlay"
	| "onPresentationEnd"
> {
	query: ModelQuery;
	/** What the reader waits for, in words. */
	destination: string | null | undefined;
	states: ReturnType<typeof stateCatalogue>;
	/** The current catalogue: only it knows the drafts, and whether the model has a Current. */
	catalogue: ModelQuery["data"];
	current: boolean;
	stale: boolean;
	/** Whether the update stream lost the server. */
	lost: boolean;
	failure: Extract<ArchitectureModelRead, { success: false }> | null;
	refresh: () => void;
	header: ReactNode;
}

/**
 * Render the result without mixing a failed read with cached module content.
 * @param props The query snapshot.
 * @returns The authored model or its unavailable state.
 */
function ModelResponse(props: ModelResponseProps): JSX.Element {
	const { query } = props;
	const model = useVisibleModel(query, props.current);
	const problem = readingProblem(query.error, props.current ? props.failure : null);
	const { paneId, states, vault, catalogue } = props;
	const trouble = readingTrouble({
		stale: props.stale,
		lost: props.lost,
		shown: model !== undefined,
		problem,
	});
	useTroubleReport(trouble, props.onTrouble);
	const overview = useCallback(
		(shown: NonNullable<typeof model>): JSX.Element => (
			<>
				<ModelStateDetails model={shown} paneId={paneId} states={states} />
				<CheckpointEvidence model={shown} />
			</>
		),
		[paneId, states],
	);
	const comparison = useCallback(
		(shown: NonNullable<typeof model>): JSX.Element => (
			<ModelComparisonSelector model={shown} catalogue={catalogue} vault={vault} paneId={paneId} />
		),
		[paneId, vault, catalogue],
	);
	// One frame for every answer: its header keeps an open menu while a read fails, retries or arrives.
	return (
		<ModelWalkthroughReader
			vault={props.vault}
			model={model}
			paneId={props.paneId}
			reducedMotion={props.reducedMotion}
			arrival={props.arrival}
			driven={props.driven}
			onPresentationEnd={props.onPresentationEnd}
			narration={props.narration}
			overlay={props.overlay}
			chrome={props.header}
		>
			<SlowRead pending={query.isPending} destination={props.destination} />
			{model === undefined && <ModelUnanswered error={query.error} problem={problem} />}
			{problem !== null && !isUnread(query.error) && (
				<ModelFailedRecords
					vault={props.vault}
					paneId={props.paneId}
					failed={model === undefined}
				/>
			)}
			{model !== undefined && (
				<ModelBookmarkReading model={model}>
					<ModelReading
						overview={overview}
						comparison={comparison}
						overlay={props.overlay}
						vault={props.vault}
						model={model}
						{...readingAnswer(query)}
						paneId={props.paneId}
						reducedMotion={props.reducedMotion}
						onCodeTargetNotice={props.onCodeTargetNotice}
					/>
				</ModelBookmarkReading>
			)}
		</ModelWalkthroughReader>
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
	return "code" in error && typeof error.code === "string" ? error.code : UNANSWERED_READ_CODE;
}

/**
 * Whether the addressed reading follows live changes. A checkpoint and a branch reading do not.
 * @param checkpoint The addressed checkpoint, or null.
 * @param ref The addressed source ref, or null.
 * @returns Whether it follows them.
 */
function followsLive(checkpoint: string | null, ref: string | null): boolean {
	return checkpoint === null && ref === null;
}

export { ArchitectureModelStage };

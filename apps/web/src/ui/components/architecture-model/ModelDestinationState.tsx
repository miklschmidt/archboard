import { useCallback, type JSX } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Button } from "@archboard/ui-kit/components";
import { ModelError, ModelFailureActions } from "#ui/components/architecture-model/ModelFrame.tsx";
import { ModelState } from "#ui/components/architecture-model/ModelState.tsx";
import {
	retainedModuleQuery,
	type RetainedModule,
} from "#ui/clients/architecture-model/queries.ts";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { useSlowWait } from "#ui/hooks/architecture-model/use-slow-wait.ts";
import { AFTER } from "#ui/rules/architecture-model/comparison-intent.ts";
import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";
import {
	destinationName,
	sceneFit,
	type SceneRequest,
} from "#ui/rules/architecture-model/scene.ts";

interface DestinationProps {
	paneId: string;
	/** The destination the address asks for. */
	request: SceneRequest;
}

/**
 * What the destination has to say over the picture, which it never moves.
 * @param props The destination and how its drawing is going.
 * @param props.failure A drawing that failed.
 * @param props.onRetry Draw it again.
 * @param props.waiting Whether the reader waits for it.
 * @returns A failure, the name of a slow destination, or nothing.
 */
function ModelDestinationNotice(
	props: DestinationProps & { failure: Error | null; onRetry: () => void; waiting: boolean },
): JSX.Element | null {
	const { request, failure } = props;
	// The stage names a read that failed, and the model here is only the last one that succeeded.
	if (request.failed === true) return null;
	if (failure === null) return <SlowDestination {...props} />;
	return <DrawingFailure {...props} failure={failure} />;
}

/**
 * Keep the last picture and say what became of the next one.
 * @param props The destination and the failure.
 * @param props.failure The failed drawing.
 * @param props.onRetry Draw it again.
 * @returns The failure and what the reader can do next.
 */
function DrawingFailure(
	props: DestinationProps & { failure: Error; onRetry: () => void },
): JSX.Element {
	const { request, failure, paneId } = props;
	const { compareAgainst } = useModelLocation(paneId);
	const showPlain = useCallback((): void => compareAgainst(AFTER), [compareAgainst]);
	return (
		<ModelError
			compact
			code="DRAW_FAILED"
			title={`${destinationName(request)} could not be drawn`}
			message={failure.message}
		>
			<p className="text-muted-foreground">The picture below is the last reading that drew.</p>
			<ModelFailureActions
				onRetry={props.onRetry}
				onPlain={request.model.comparison === undefined ? undefined : showPlain}
			/>
		</ModelError>
	);
}

/**
 * Name the destination of a wait that lasts, and say nothing of one that does not.
 * @param props The destination and whether the reader waits for it.
 * @returns The message, or nothing.
 */
function SlowDestination(props: DestinationProps & { waiting: boolean }): JSX.Element | null {
	const { request, waiting } = props;
	const slow = useSlowWait(waiting ? sceneFit(request) : null);
	if (!slow) return null;
	return (
		<ModelState.Waiting>
			{request.settled ? "Drawing" : "Reading"} {destinationName(request)}…
		</ModelState.Waiting>
	);
}

/**
 * Never replace a missing destination with another reading.
 * @param props The destination, and where its retained history lives.
 * @param props.vault The reading vault.
 * @returns What the destination lacks, and the way on.
 */
function ModelUnavailableReading(props: DestinationProps & { vault: string }): JSX.Element {
	const { request, paneId, vault } = props;
	const { reading, model } = request;
	const { scope, grammar } = reading;
	if (grammar === "architecture" && scope !== null && model.manifest.retiredIds?.includes(scope))
		return <RemovedModule vault={vault} paneId={paneId} request={request} scope={scope} />;
	if (grammar === "architecture")
		return (
			<section data-slot="model-missing-scope" className={COVER}>
				<p>
					This reading has no module {scope}. Open {model.manifest.name} to keep reading.
				</p>
				<OpenRoot paneId={paneId} request={request} />
			</section>
		);
	const { slot, message } = unavailableBehavior(request);
	return (
		<output data-slot={slot} className={COVER}>
			{message}
		</output>
	);
}

/** A reading with no picture covers the surface, so the last picture never stands in for it. */
const COVER = "text-body bg-background absolute inset-0 z-10 space-y-3 p-8";

/**
 * A retired identity is a fact about the model, so the reader hears that before anything else.
 * @param props The destination and its retired scope.
 * @param props.vault The reading vault.
 * @param props.scope The removed module.
 * @returns That it was removed, its retained reading, and the way on.
 */
function RemovedModule(props: DestinationProps & { vault: string; scope: string }): JSX.Element {
	const { vault, scope, paneId, request } = props;
	const retained = useQuery(retainedModuleQuery(vault, scope));
	const { openRetained } = useModelLocation(paneId);
	const found = retained.data ?? null;
	const open = useCallback((): void => {
		if (found !== null) openRetained(found.checkpoint, scope);
	}, [found, openRetained, scope]);
	const retry = useCallback((): void => void retained.refetch(), [retained]);
	return (
		<section data-slot="model-removed-module" data-module-id={scope} className={COVER}>
			<h3 className="text-title font-semibold">
				{found?.name ?? `Module ${scope}`} was removed from this architecture
			</h3>
			<p>{retainedStatement(retained)}</p>
			<div className="flex items-center gap-2">
				{found !== null && (
					<Button size="sm" data-slot="model-open-retained" onClick={open}>
						Open retained reading
					</Button>
				)}
				{retained.isError && (
					<Button size="sm" data-slot="model-retry" onClick={retry}>
						Retry
					</Button>
				)}
				<OpenRoot paneId={paneId} request={request} />
			</div>
		</section>
	);
}

/**
 * Say where the search for a retained reading stands.
 * @param retained The search.
 * @returns What it found, or what the reader can do without it.
 */
function retainedStatement(retained: UseQueryResult<RetainedModule>): string {
	if (retained.isPending) return "Searching the retained readings for it…";
	if (retained.isError)
		return `Archboard could not search the retained readings. ${retained.error.message}`;
	if (retained.data === null) return "No retained reading holds it.";
	return `Its newest retained reading is from ${checkpointTime(retained.data.createdAt)}.`;
}

/**
 * The way out of a reading with nothing to show.
 * @param props The destination.
 * @returns The action that opens the roots of the model.
 */
function OpenRoot(props: DestinationProps): JSX.Element {
	const { open } = useModelLocation(props.paneId);
	const { id, name } = props.request.model.manifest;
	const openRoot = useCallback((): void => open(id, null), [open, id]);
	return (
		<Button variant="outline" size="sm" data-slot="model-open-root" onClick={openRoot}>
			Open {name}
		</Button>
	);
}

/**
 * Name what a behavioral reading lacks.
 * @param request The destination.
 * @returns Its state and recovery instruction.
 */
function unavailableBehavior(request: SceneRequest): { slot: string; message: string } {
	const { reading, projection } = request;
	if (projection.flow !== null)
		return {
			slot: "model-mode-unavailable",
			message: `The requested diagram mode is unavailable: ${reading.grammar}. Choose a supported mode.`,
		};
	return reading.flow === null
		? { slot: "model-flow-required", message: "Choose an authored flow to read its behavior." }
		: {
				slot: "model-flow-missing",
				message: `The selected flow is unavailable: ${reading.flow}. Choose another flow or restore its architecture.`,
			};
}

export { ModelDestinationNotice, ModelUnavailableReading };

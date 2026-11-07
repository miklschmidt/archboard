import { ModelWalkthroughContext } from "#ui/architecture-drawing/model-reader/state/presentation.ts";
import {
	useMemo,
	useCallback,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/model/content";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { modelWalkthroughQuery } from "#ui/architecture-drawing/model-reader/access/clients/walkthroughs.ts";
import { ModelWalkthrough } from "#ui/architecture-drawing/model-reader/reading/components/ModelWalkthrough.tsx";

type PlaybackRequest = Parameters<typeof modelWalkthroughQuery>[1];
interface ReaderProps extends Pick<
	ComponentProps<typeof ModelWalkthrough>,
	"driven" | "narration" | "overlay"
> {
	vault: string;
	model: Model | undefined;
	paneId: string;
	reducedMotion: boolean;
	children: ReactNode;
	chrome?: ReactNode;
	/** Which time the pane has been pointed at a reading from outside: each arrival decides playback. */
	arrival?: number | undefined;
	onPresentationEnd?: (() => void) | undefined;
}

/**
 * Preserve the ordinary reader while one captured presentation is open. The
 * header stays in one place for every answer, so an open menu outlives a read.
 * @param props The live source, when it is known, and its ordinary reading.
 * @returns A narrative choice and one captured reading at a time.
 */
function ModelWalkthroughReader(props: ReaderProps): JSX.Element {
	const { checkpoint, state: requestedState, preview } = useModelLocation(props.paneId);
	const { model, arrival, driven } = props;
	const state = walkthroughState(model, requestedState);
	const source = JSON.stringify([checkpoint, state, preview]);
	/**
	 * What an arrival from outside asks of playback.
	 * @returns The presentation it asks for, or null for the ordinary reading.
	 */
	const requested = (): PlaybackRequest | null =>
		driven == null
			? null
			: {
					id: crypto.randomUUID(),
					walkthrough: driven.walkthrough,
					checkpoint,
					state,
					preview,
				};
	const [session, setSession] = useState(() => ({ source, arrival, request: requested() }));
	// An arrival starts what it asks for. A new source closes only playback, and the
	// ordinary reader retains its selection.
	if (session.arrival !== arrival) setSession({ source, arrival, request: requested() });
	else if (session.source !== source) setSession({ source, arrival, request: null });
	const { request } = session;
	const select = useCallback(
		(walkthrough: string, beat = 0): void => {
			setSession({
				source,
				arrival,
				request: { id: crypto.randomUUID(), walkthrough, checkpoint, state, preview, beat },
			});
		},
		[source, arrival, checkpoint, state, preview],
	);
	const { onPresentationEnd } = props;
	const leave = useCallback((): void => {
		setSession({ source, arrival, request: null });
		onPresentationEnd?.();
	}, [source, arrival, onPresentationEnd]);
	const context = usePlayback(request, select, leave, props.narration);
	return (
		<ModelWalkthroughContext value={context}>
			{props.chrome}
			{/* The reading hides itself, so the left column it owns stays while this plays. */}
			<div className={context.active ? "hidden" : "contents"}>{props.children}</div>
			{request !== null && model !== undefined && (
				<CapturedWalkthrough
					key={request.id}
					{...props}
					model={model}
					request={request}
					onLeave={leave}
					onRestart={select}
				/>
			)}
		</ModelWalkthroughContext>
	);
}

/**
 * What a reading hears of the playback.
 * @param request The presentation that plays, or null.
 * @param select Start a walkthrough.
 * @param leave End the presentation.
 * @param narration The way to narrate a walkthrough aloud, when the shell can.
 * @returns The context of the playback.
 */
function usePlayback(
	request: PlaybackRequest | null,
	select: (walkthrough: string, beat?: number) => void,
	leave: () => void,
	narration: ReaderProps["narration"],
) {
	const active = request !== null;
	const current = request?.walkthrough ?? null;
	return useMemo(
		() => ({
			select,
			/** Leaving is safe at any time, so a reading need not ask whether anything plays. */
			leave: (): void => {
				if (active) leave();
			},
			active,
			current,
			narration,
		}),
		[select, leave, active, current, narration],
	);
}

/**
 * Live updates offer a new capture without replacing the picture in progress.
 * @param props The deliberate request and live source revision.
 * @returns Loading, recovery, or a captured presentation.
 */
function CapturedWalkthrough(
	props: ReaderProps & {
		model: Model;
		request: PlaybackRequest;
		onLeave: () => void;
		onRestart: (id: string) => void;
	},
): JSX.Element {
	const query = useQuery(modelWalkthroughQuery(props.vault, props.request));
	const { onRestart, request } = props;
	const restart = useCallback(
		() => onRestart(request.walkthrough),
		[onRestart, request.walkthrough],
	);
	if (query.isPending) return <output className="text-body p-8">Opening walkthrough…</output>;
	if (query.isError)
		return (
			<PlaybackFailure message={query.error.message} onRetry={restart} onLeave={props.onLeave} />
		);
	if (query.data.playback === undefined)
		return (
			<PlaybackFailure
				message="This reading has no resolved walkthrough. Choose another narrative."
				onRetry={restart}
				onLeave={props.onLeave}
			/>
		);
	const changed = props.model.revision.digest !== query.data.playback.sourceRevision.digest;
	return (
		<>
			{changed && (
				<div className="border-border text-body flex shrink-0 items-center justify-between border-b px-4 py-2">
					<p>This presentation keeps its captured revision. A newer reading is available.</p>
					<Button data-slot="model-walkthrough-restart" onClick={restart}>
						Restart with latest
					</Button>
				</div>
			)}
			<ModelWalkthrough
				vault={props.vault}
				model={query.data}
				reducedMotion={props.reducedMotion}
				onLeave={props.onLeave}
				driven={props.driven ?? undefined}
				beat={props.request.beat}
				narration={props.narration}
				overlay={props.overlay}
			/>
		</>
	);
}

/**
 * Keep recovery visible when a narrative or its retained history cannot be read.
 * @param props The refusal and deliberate recovery actions.
 * @param props.message The public reader refusal.
 * @param props.onRetry Resolve this request again.
 * @param props.onLeave Return to the ordinary architecture.
 * @returns A recoverable presentation error.
 */
function PlaybackFailure(props: {
	message: string;
	onRetry: () => void;
	onLeave: () => void;
}): JSX.Element {
	return (
		<div className="text-body space-y-4 p-8" role="alert" data-slot="model-walkthrough-error">
			<p>{props.message}</p>
			<Button onClick={props.onRetry}>Retry</Button>
			<Button onClick={props.onLeave}>Return to architecture</Button>
		</div>
	);
}

export { ModelWalkthroughReader };

/**
 * Preserve original coverage when an alias selected it without a state URL field.
 * @param model The exact reading offered by the preview.
 * @param requested The ordinary current or proposal selector.
 * @returns The original state identity, or unchanged canonical selection.
 */
function walkthroughState(model: Model | undefined, requested: string | null): string | null {
	return model?.migrationPreview?.selected?.legacy ?? requested;
}

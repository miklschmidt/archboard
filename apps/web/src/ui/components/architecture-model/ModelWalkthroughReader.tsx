import { ModelWalkthroughContext } from "#ui/state/architecture-model/presentation.ts";
import {
	Activity,
	useMemo,
	useCallback,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { modelWalkthroughQuery } from "#ui/clients/architecture-model/walkthroughs.ts";
import { ModelWalkthrough } from "#ui/components/architecture-model/ModelWalkthrough.tsx";

type PlaybackRequest = Parameters<typeof modelWalkthroughQuery>[1];
interface ReaderProps extends Pick<
	ComponentProps<typeof ModelWalkthrough>,
	"driven" | "narration" | "overlay"
> {
	vault: string;
	model: Model;
	paneId: string;
	reducedMotion: boolean;
	children: ReactNode;
}

/**
 * Preserve the ordinary reader while one captured presentation is open.
 * @param props The live source and its ordinary reading.
 * @returns A narrative choice and one captured reading at a time.
 */
function ModelWalkthroughReader(props: ReaderProps): JSX.Element {
	const { checkpoint, state: requestedState, preview } = useModelLocation(props.paneId);
	const state = walkthroughState(props.model, requestedState);
	const source = JSON.stringify([checkpoint, state, preview]);
	const [session, setSession] = useState(() => {
		const asked = props.driven;
		const request: PlaybackRequest | null =
			asked == null
				? null
				: {
						id: crypto.randomUUID(),
						walkthrough: asked.walkthrough,
						checkpoint,
						state,
						preview,
					};
		return { source, request };
	});
	// A new source closes only playback. The ordinary reader retains its selection.
	if (session.source !== source) setSession({ source, request: null });
	const { request } = session;
	const select = useCallback(
		(walkthrough: string): void => {
			setSession({
				source,
				request: { id: crypto.randomUUID(), walkthrough, checkpoint, state, preview },
			});
		},
		[source, checkpoint, state, preview],
	);
	const leave = useCallback((): void => setSession({ source, request: null }), [source]);
	const active = request !== null;
	const context = useMemo(() => ({ select, active }), [select, active]);
	return (
		<ModelWalkthroughContext value={context}>
			<Activity mode={request === null ? "visible" : "hidden"}>{props.children}</Activity>
			{request !== null && (
				<CapturedWalkthrough
					key={request.id}
					{...props}
					request={request}
					onLeave={leave}
					onRestart={select}
				/>
			)}
		</ModelWalkthroughContext>
	);
}

/**
 * Live updates offer a new capture without replacing the picture in progress.
 * @param props The deliberate request and live source revision.
 * @returns Loading, recovery, or a captured presentation.
 */
function CapturedWalkthrough(
	props: ReaderProps & {
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
function walkthroughState(model: Model, requested: string | null): string | null {
	return model.migrationPreview?.selected?.legacy ?? requested;
}

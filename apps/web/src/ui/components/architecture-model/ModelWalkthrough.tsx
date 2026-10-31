import {
	lazy,
	Suspense,
	useCallback,
	useMemo,
	useState,
	type ComponentProps,
	type JSX,
} from "react";
import {
	SemanticPresentation,
	type SemanticPresentationProps,
} from "#ui/components/semantic-board-canvas/SemanticPresentation.tsx";
import { projectModel, type Model } from "@archboard/board/content";
import { useAcceptedScene } from "#ui/hooks/architecture-model/use-accepted-scene.ts";
import { useBoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { drawableGrammar } from "#ui/rules/architecture-model/scene.ts";
import { projectFlow } from "#ui/rules/architecture-model/flow-reading.ts";
import { useModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelExplanation } from "#ui/hooks/architecture-model/use-model-explanation.ts";
import type { DrivenPlace } from "#ui/hooks/semantic-board-canvas/use-walkthrough.ts";
import { useWalkthroughBeat } from "#ui/hooks/architecture-model/use-walkthrough-beat.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});
const NO_MISSING_SUBJECTS: readonly string[] = Object.freeze([]);
type Playback = NonNullable<Model["playback"]>;
type Reading = Playback["walkthrough"]["beats"][number]["reading"];
type Picture = Parameters<NonNullable<ComponentProps<typeof ModelDiagram>["onPresentation"]>>[0];

interface WalkthroughProps {
	vault: string;
	model: Model;
	reducedMotion: boolean;
	onLeave: () => void;
	driven?: DrivenPlace | null | undefined;
	/** The step a presentation opens at, counted from zero. */
	beat?: number | undefined;
	onReading?: (reading: PaneReading | null) => void;
	overlay?: SemanticPresentationProps["overlay"];
	narration?: SemanticPresentationProps["narration"];
}

/**
 * Present complete authored readings through the existing diagram and caption owners.
 * @param props The captured architecture and its resolved narrative.
 * @returns A single beat without changing the ordinary reading address.
 */
function ModelWalkthrough(props: WalkthroughProps): JSX.Element {
	const playback = props.model.playback;
	if (playback === undefined)
		return (
			<output role="alert">The walkthrough is unavailable. Reopen its retained reading.</output>
		);
	return <NarrativePresentation {...props} playback={playback} />;
}

/**
 * Share manual, recorded, and replayed positions through the existing walkthrough owner.
 * @param props The resolved playback and immutable model.
 * @returns The authored beat or its explicit recovery.
 */
function NarrativePresentation(props: WalkthroughProps & { playback: Playback }): JSX.Element {
	const { model, playback } = props;
	const [reserve, setReserve] = useState(0);
	const [picture, setPicture] = useState<Picture>(null);
	const { caption, position, reading, key, unavailable } = useWalkthroughBeat(
		model,
		playback,
		props.driven,
		props.beat,
	);
	const index = position.beatIndex;
	const available = unavailable === null;
	const projection = useMemo(() => projectionOf(model, reading), [model, reading]);
	const selection = useModelSelection(projection, reading.selection, key);
	const location = useMemo(
		() => ({
			state: null,
			checkpoint: model.checkpoint?.id ?? null,
			against: null,
			subject: null,
			scope: reading.scope ?? null,
			focus: reading.focus,
			filters: { hideKinds: reading.filters.relationships, showGroups: [], everyLine: false },
			grammar: reading.grammar,
			flow: reading.flow ?? null,
		}),
		[reading, model.checkpoint?.id],
	);
	const request = useMemo(
		() => ({
			model,
			projection,
			reading: location,
			grammar: available ? drawableGrammar(reading.grammar, projection) : null,
			settled: true,
			presentation: { key, subjects: reading.selection },
		}),
		[model, projection, location, available, reading, key],
	);
	const accepted = useAcceptedScene(request, selection.ids);
	const presentation = useMemo(
		() =>
			index < 0
				? null
				: {
						walkthrough: playback.walkthrough.id,
						beat: index,
						of: caption.beats.length,
						arrived: picture?.key === key && picture.arrived,
						answering: position.answering,
					},
		[index, playback.walkthrough.id, caption.beats.length, picture, key, position.answering],
	);
	const reporting = useMemo(
		() => ({ ready: picture?.key === key || !available, presentation, onReading: props.onReading }),
		[picture, key, available, presentation, props.onReading],
	);
	useModelExplanation(props.vault, model, location, accepted.selected, reporting);
	const ignore = useCallback((): void => {}, []);
	return (
		<div
			data-slot="model-walkthrough"
			data-revision={model.revision.digest}
			data-scope={reading.scope ?? ""}
			data-grammar={reading.grammar}
			className="relative flex min-h-0 flex-1 flex-col"
		>
			<BeatStage
				accepted={accepted}
				selection={selection}
				reducedMotion={props.reducedMotion}
				reserve={index < 0 ? 0 : reserve}
				onPresentation={setPicture}
				onOpen={ignore}
			/>
			{!available && <UnavailableBeat status={unavailable} />}
			{index >= 0 && (
				<SemanticPresentation
					walkthrough={caption}
					index={index}
					missing={NO_MISSING_SUBJECTS}
					onGo={position.goTo}
					onLeave={props.onLeave}
					reserve={setReserve}
					overlay={props.overlay}
					narration={drawnNarration(props.narration, presentation, available)}
				/>
			)}
		</div>
	);
}

/**
 * One surface and one camera for a whole presentation, so each beat glides from the last.
 * @param props The accepted beat and what the diagram reports.
 * @param props.accepted The beat on screen and the beat on its way.
 * @param props.selection The beat's selection.
 * @param props.reducedMotion Whether the person asked for no motion.
 * @param props.reserve The height the caption keeps clear.
 * @param props.onPresentation Told whether the beat has arrived.
 * @param props.onOpen Ignored: a presentation stays on its beats.
 * @returns The diagram, once a beat is drawn, and any failure to draw one.
 */
function BeatStage(
	props: Pick<ComponentProps<typeof ModelDiagram>, "onPresentation" | "onOpen"> & {
		accepted: ReturnType<typeof useAcceptedScene>;
		selection: ReturnType<typeof useModelSelection>;
		reducedMotion: boolean;
		reserve: number;
	},
): JSX.Element {
	const { accepted, selection, reducedMotion } = props;
	const { scene, failure } = accepted;
	const camera = useBoardCamera(reducedMotion);
	return (
		<>
			<Suspense fallback={null}>
				{scene !== null && (
					<ModelDiagram
						scene={scene}
						camera={camera}
						pending={accepted.pending}
						leaving={null}
						selected={accepted.selected}
						onSelect={selection.select}
						onSelectMany={selection.selectMany}
						onOpen={props.onOpen}
						reducedMotion={reducedMotion}
						reserve={props.reserve}
						onPresentation={props.onPresentation}
					/>
				)}
			</Suspense>
			{failure !== null && (
				<output role="alert" className="text-body absolute inset-x-0 top-0 z-10 p-8">
					{failure.message}
				</output>
			)}
		</>
	);
}

/**
 * Project one complete beat through the existing architecture and flow readers.
 * @param model The immutable captured architecture.
 * @param reading The authored reading instructions.
 * @returns The diagram content for that beat.
 */
function projectionOf(model: Model, reading: Reading) {
	const structural = projectModel(
		model,
		reading.scope ?? null,
		reading.focus.length === 0 ? null : reading.focus,
		{ hideKinds: reading.filters.relationships },
		undefined,
		reading.visibility,
	);
	const flow = structural.depicted.flows.find((entry) => entry.id === reading.flow);
	return reading.grammar === "architecture" || flow === undefined
		? structural
		: projectFlow(structural, flow);
}

/**
 * Keep a missing beat explicit without drawing another reading in its place.
 * @param props The unavailable beat diagnostics.
 * @param props.status The resolved beat status.
 * @returns Recovery instructions while the stepping controls remain available.
 */
function UnavailableBeat({ status }: { status: Playback["beats"][number] }): JSX.Element {
	const diagnostics = new Map(status.diagnostics.map((entry) => [JSON.stringify(entry), entry]));
	return (
		<div
			role="alert"
			data-slot="model-walkthrough-unavailable"
			className="text-body bg-background absolute inset-0 z-10 space-y-4 p-8"
		>
			<h3 className="text-title font-semibold">This step is unavailable</h3>
			{[...diagnostics].map(([key, diagnostic]) => (
				<p key={key}>
					{diagnostic.message} {diagnostic.recovery}
				</p>
			))}
		</div>
	);
}

export { ModelWalkthrough };

/**
 * Offer narration only when the pane can publish its captured architecture.
 * @param narration The existing voice action and availability.
 * @param presentation The reported beat and its arrival.
 * @param available Whether the authored beat can be drawn.
 * @returns The same action with a visible drawing hold when needed.
 */
function drawnNarration(
	narration: WalkthroughProps["narration"],
	presentation: PaneReading["presentation"],
	available: boolean,
): WalkthroughProps["narration"] {
	if (narration === undefined || (presentation?.arrived === true && available)) return narration;
	return { ...narration, held: "Wait for this step to finish drawing." };
}

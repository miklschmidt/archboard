import { lazy, Suspense, useCallback, useMemo, useState, type JSX } from "react";
import {
	SemanticPresentation,
	type SemanticPresentationProps,
} from "#ui/components/semantic-board-canvas/SemanticPresentation.tsx";
import { projectModel, type Model } from "#ui/rules/architecture-model/projection.ts";
import { projectFlow } from "#ui/rules/architecture-model/flow-reading.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});
const LOADING_DIAGRAM = (
	<output className="text-body text-muted-foreground p-8">Drawing walkthrough…</output>
);

const NO_MISSING_SUBJECTS: readonly string[] = Object.freeze([]);

interface WalkthroughProps {
	model: Model;
	reducedMotion: boolean;
	onLeave: () => void;
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
 * Beat position and caption clearance are presentation state, independent of architecture content.
 * @param props The resolved playback and immutable model.
 * @returns The authored beat or its explicit recovery, with the existing stepping controls.
 */
function NarrativePresentation(
	props: WalkthroughProps & { playback: NonNullable<Model["playback"]> },
): JSX.Element {
	const { model, playback } = props;
	const [index, setIndex] = useState(0);
	const [reserve, setReserve] = useState(0);
	const beat = playback.walkthrough.beats[index]!;
	const reading = beat.reading;
	const selected = useMemo(() => new Set(reading.selection), [reading.selection]);
	const projection = useMemo(() => {
		const structural = projectModel(
			model,
			reading.scope ?? null,
			reading.focus.length === 0 ? null : reading.focus,
			{
				hideKinds: reading.filters.relationships,
				hideGroups: reading.filters.groups,
			},
		);
		const flow = structural.depicted.flows.find((entry) => entry.id === reading.flow);
		return reading.grammar === "architecture" || flow === undefined
			? structural
			: projectFlow(structural, flow);
	}, [model, reading]);
	const caption = useMemo(
		(): SemanticPresentationProps["walkthrough"] => ({
			id: playback.walkthrough.id,
			name: playback.walkthrough.name,
			beats: playback.walkthrough.beats.map((entry) => ({
				id: entry.id,
				heading: entry.title,
				body: entry.narrative,
				subjects: entry.reading.selection,
			})),
		}),
		[playback.walkthrough],
	);
	const ignore = useCallback((): void => {}, []);
	const go = useCallback(
		(next: number): void =>
			setIndex(Math.max(0, Math.min(playback.walkthrough.beats.length - 1, next))),
		[playback.walkthrough.beats.length],
	);
	const status = playback.beats[index]!;
	const diagnostics = new Map(status.diagnostics.map((entry) => [JSON.stringify(entry), entry]));
	return (
		<div
			data-slot="model-walkthrough"
			data-revision={model.revision.digest}
			data-scope={reading.scope ?? ""}
			data-grammar={reading.grammar}
			className="relative flex min-h-0 flex-1 flex-col"
		>
			{status.status === "ready" ? (
				<Suspense fallback={LOADING_DIAGRAM}>
					<ModelDiagram
						model={model}
						grammar={reading.grammar}
						projection={projection}
						selected={selected}
						onSelect={ignore}
						onSelectMany={ignore}
						onOpen={ignore}
						reducedMotion={props.reducedMotion}
						reserve={reserve}
						presentation={beat.id}
					/>
				</Suspense>
			) : (
				<div
					role="alert"
					data-slot="model-walkthrough-unavailable"
					className="text-body max-w-prose space-y-4 p-8"
				>
					<h3 className="text-title font-semibold">This step is unavailable</h3>
					{[...diagnostics].map(([key, diagnostic]) => (
						<p key={key}>
							{diagnostic.message} {diagnostic.recovery}
						</p>
					))}
				</div>
			)}
			<SemanticPresentation
				walkthrough={caption}
				index={index}
				missing={NO_MISSING_SUBJECTS}
				onGo={go}
				onLeave={props.onLeave}
				reserve={setReserve}
			/>
		</div>
	);
}

export { ModelWalkthrough };

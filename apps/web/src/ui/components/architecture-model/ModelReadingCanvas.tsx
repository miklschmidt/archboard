import {
	lazy,
	Suspense,
	type ComponentProps,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";
import { StageSpinner } from "#ui/components/semantic-board-canvas/SemanticStageStates.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import type {
	AcceptedScene,
	Projection,
	SceneRequest,
} from "#ui/rules/architecture-model/scene.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});

type DiagramProps = ComponentProps<typeof ModelDiagram>;

interface ModelReadingCanvasProps extends Pick<
	DiagramProps,
	"camera" | "pending" | "leaving" | "cut" | "floating" | "reducedMotion" | "onOpen" | "onAttention"
> {
	overlay?: ReactNode;
	/** The reading that is on screen, once one is. */
	scene: AcceptedScene | null;
	/** The destination the address asks for. */
	request: SceneRequest;
	/** A drawing that failed. */
	failure: Error | null;
	area: RefObject<HTMLDivElement | null>;
	warnings: ReadonlySet<string>;
	selection: ModelSelection;
}

/**
 * One diagram stays mounted under every answer, so the surface and the camera wait
 * for the reader to come back from an unavailable reading, which has no picture.
 * @param props The accepted scene and the requested destination.
 * @returns The diagram, and what the destination has to say about itself.
 */
function ModelReadingCanvas(props: ModelReadingCanvasProps): JSX.Element {
	const { scene, request, selection, area } = props;
	return (
		<>
			{request.grammar === "architecture" && (
				<FocusAvailability missing={request.projection.missingFocus} />
			)}
			<div ref={area} className="relative flex min-h-0 min-w-0 flex-1">
				<Suspense fallback={null}>
					{scene !== null && (
						<ModelDiagram
							scene={scene}
							camera={props.camera}
							area={area}
							pending={props.pending}
							leaving={props.leaving}
							cut={props.cut}
							floating={props.floating}
							warnings={props.warnings}
							selected={selection.ids}
							onSelect={selection.select}
							onSelectMany={selection.selectMany}
							onOpen={props.onOpen}
							onAttention={props.onAttention}
							reducedMotion={props.reducedMotion}
						/>
					)}
				</Suspense>
				<DestinationState request={request} failure={props.failure} first={scene === null} />
				<div
					data-slot="model-stage-overlay"
					className="pointer-events-none absolute inset-x-0 bottom-6 z-25 flex justify-center px-8"
				>
					{props.overlay}
				</div>
			</div>
		</>
	);
}

/**
 * What the destination has to say over the picture.
 * @param props The destination and how its drawing went.
 * @param props.request The destination.
 * @param props.failure A drawing that failed.
 * @param props.first Whether no picture exists yet.
 * @returns A failure, an unavailable reading, the first wait, or nothing.
 */
function DestinationState(props: {
	request: SceneRequest;
	failure: Error | null;
	first: boolean;
}): JSX.Element | null {
	const { request, failure } = props;
	if (request.grammar === null)
		return <UnavailableReading reading={request.reading} projection={request.projection} />;
	if (failure !== null)
		return (
			<output
				role="alert"
				className="text-body bg-background border-border absolute inset-x-0 top-0 z-10 border-b px-8 py-4"
			>
				{failure.message}
			</output>
		);
	return props.first ? <FirstDrawing request={request} /> : null;
}

/**
 * What the pane shows before its first picture exists.
 * @param props The destination.
 * @param props.request The destination.
 * @returns A spinner that waits before it appears, and the destination for a screen reader.
 */
function FirstDrawing({ request }: { request: SceneRequest }): JSX.Element {
	return (
		<>
			<p aria-live="polite" className="sr-only">
				Drawing {request.projection.trail.at(-1)?.name ?? request.model.manifest.name}…
			</p>
			<StageSpinner className="pointer-events-none absolute inset-0" />
		</>
	);
}

/**
 * Never replace a missing destination with another reading.
 * @param props The requested reading and its projection.
 * @param props.reading The address fields.
 * @param props.projection The requested reading's content.
 * @returns The recovery instruction for that destination.
 */
function UnavailableReading({
	reading,
	projection,
}: {
	reading: SceneRequest["reading"];
	projection: Projection;
}): JSX.Element {
	const { slot, message } = unavailableMessage(reading, projection);
	return (
		<output data-slot={slot} className="text-body bg-background absolute inset-0 z-10 p-8">
			{message}
		</output>
	);
}

/**
 * Name what a reading lacks.
 * @param reading The address fields.
 * @param projection The requested reading's content.
 * @returns Its state and recovery instruction.
 */
function unavailableMessage(
	reading: SceneRequest["reading"],
	projection: Projection,
): { slot: string; message: string } {
	if (reading.grammar === "architecture")
		return {
			slot: "model-missing-scope",
			message: `The requested module is absent from this reading: ${reading.scope}. Open the repository from the path above.`,
		};
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

/**
 * Missing focus targets never select replacement architecture.
 * @param props The requested identities absent from this reading.
 * @param props.missing Unavailable canonical identities.
 * @returns An explicit partial-reading notice, or no notice.
 */
function FocusAvailability(props: { missing: readonly string[] }): JSX.Element | null {
	if (props.missing.length === 0) return null;
	return (
		<output data-slot="model-focus-missing" className="text-body border-border border-b px-6 py-3">
			{props.missing.length} focused subjects are unavailable. Change focus or restore the missing
			architecture.
		</output>
	);
}

export { ModelReadingCanvas };

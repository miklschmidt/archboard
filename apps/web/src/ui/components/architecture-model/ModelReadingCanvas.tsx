import {
	lazy,
	Suspense,
	type ComponentProps,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";
import {
	ModelDestinationNotice,
	ModelUnavailableReading,
} from "#ui/components/architecture-model/ModelDestinationState.tsx";
import { StageSpinner } from "#ui/architecture-drawing/canvas/presentation/components/SemanticStageStates.tsx";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import type { AcceptedScene, SceneRequest } from "#ui/rules/architecture-model/scene.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});

type DiagramProps = ComponentProps<typeof ModelDiagram>;

interface ModelReadingCanvasProps
	extends
		Pick<
			DiagramProps,
			| "camera"
			| "pending"
			| "leaving"
			| "cut"
			| "reducedMotion"
			| "onOpen"
			| "onToggle"
			| "onAttention"
			| "onWholeScope"
			| "onOpenState"
		>,
		Pick<ComponentProps<typeof ModelDestinationNotice>, "paneId" | "failure" | "onRetry"> {
	overlay?: ReactNode;
	/** What the stage has to say over the picture. */
	notices: ReactNode;
	/** Whether the base of the comparison is still on its way. */
	comparing: boolean;
	vault: string;
	/** The reading that is on screen, once one is. */
	scene: AcceptedScene | null;
	/** The destination the address asks for. */
	request: SceneRequest;
	area: RefObject<HTMLDivElement | null>;
	warnings: ReadonlySet<string>;
	selection: ModelSelection;
	/** What stands beside the picture: the right panel. */
	children?: ReactNode;
}

/**
 * One diagram stays mounted under every answer, so the surface and the camera wait
 * for the reader to come back from an unavailable reading, which has no picture.
 * @param props The accepted scene and the requested destination.
 * @returns The diagram, and what the destination has to say about itself.
 */
function ModelReadingCanvas(props: ModelReadingCanvasProps): JSX.Element {
	const { scene, request, selection, area } = props;
	const waiting = props.pending || props.comparing;
	return (
		<>
			{request.grammar === "architecture" && (
				<FocusAvailability missing={request.projection.missingFocus} />
			)}
			<div className="flex min-h-0 min-w-0 flex-1">
				<div ref={area} className="relative flex min-h-0 min-w-0 flex-1">
					<Suspense fallback={null}>
						{scene !== null && (
							<ModelDiagram
								scene={scene}
								camera={props.camera}
								pending={props.pending}
								leaving={props.leaving}
								cut={props.cut}
								warnings={props.warnings}
								selected={selection.ids}
								onSelect={selection.select}
								onSelectMany={selection.selectMany}
								onOpen={props.onOpen}
								onToggle={props.onToggle}
								onAttention={props.onAttention}
								onWholeScope={props.onWholeScope}
								onOpenState={props.onOpenState}
								reducedMotion={props.reducedMotion}
							/>
						)}
					</Suspense>
					<NoPicture {...props} waiting={waiting} />
					<div
						data-slot="model-notices"
						className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col *:pointer-events-auto"
					>
						{props.notices}
						<ModelDestinationNotice
							paneId={props.paneId}
							request={request}
							failure={props.failure}
							onRetry={props.onRetry}
							waiting={waiting}
						/>
					</div>
					<div
						data-slot="model-stage-overlay"
						className="pointer-events-none absolute inset-x-0 bottom-6 z-25 flex justify-center px-8"
					>
						{props.overlay}
					</div>
				</div>
				{props.children}
			</div>
		</>
	);
}

/**
 * What the surface shows while no picture stands for the reading.
 * @param props The destination and how it is going.
 * @param props.vault The reading vault.
 * @param props.paneId The pane.
 * @param props.request The destination.
 * @param props.scene The accepted scene.
 * @param props.waiting Whether the reader waits for it.
 * @returns What the reading lacks, the wait for a first picture, or nothing.
 */
function NoPicture(
	props: Pick<ModelReadingCanvasProps, "vault" | "paneId" | "request" | "scene"> & {
		waiting: boolean;
	},
): JSX.Element | null {
	const { request, vault, paneId } = props;
	if (request.settled && request.grammar === null)
		return <ModelUnavailableReading vault={vault} paneId={paneId} request={request} />;
	if (props.scene !== null || !props.waiting) return null;
	return <StageSpinner className="pointer-events-none absolute inset-0" />;
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

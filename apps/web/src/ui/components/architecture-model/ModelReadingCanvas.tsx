import { lazy, Suspense, type JSX, type ReactNode } from "react";
import { DiagramGrammarSchema, type DiagramGrammar } from "@archboard/board/views";
import type { Model, projectModel } from "@archboard/board/content";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";

const ModelDiagram = lazy(async () => {
	const module = await import("#ui/components/architecture-model/ModelDiagram.tsx");
	return { default: module.ModelDiagram };
});

const LOADING_DIAGRAM = (
	<output className="text-body text-muted-foreground min-w-0 flex-1 p-8">Loading diagram…</output>
);

interface ModelReadingCanvasProps {
	overlay?: ReactNode;
	model: Model;
	warnings: ReadonlySet<string>;
	selection: ModelSelection;
	scope: string | null;
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	onOpen: (scope: string | null) => void;
}

/**
 * A behavioral reading requires its exact authored flow, independently of the structural scope.
 * @param props The requested mode, flow, and underlying architecture reading.
 * @returns A coherent diagram or explicit unavailable state.
 */
function ModelReadingCanvas(
	props: ModelReadingCanvasProps & { grammar: string; flow: string | null },
): JSX.Element {
	const parsed = DiagramGrammarSchema.safeParse(props.grammar);
	if (!parsed.success)
		return (
			<output data-slot="model-mode-unavailable" className="text-body p-8">
				The requested diagram mode is unavailable: {props.grammar}. Choose a supported mode.
			</output>
		);
	if (parsed.data !== "architecture") return <BehavioralReading {...props} grammar={parsed.data} />;
	if (props.projection.missing)
		return (
			<output data-slot="model-missing-scope" className="text-body p-8">
				The requested module is absent from this reading: {props.scope}. Open the repository from
				the path above.
			</output>
		);
	return (
		<>
			<FocusAvailability missing={props.projection.missingFocus} />
			<ScopedModelReading key={props.scope ?? "root"} {...props} grammar={parsed.data} />
		</>
	);
}

/**
 * Never replace a missing explicit flow with another exchange.
 * @param props The complete model and exact requested flow identity.
 * @returns The whole selected behavior or its recovery instruction.
 */
function BehavioralReading(
	props: ModelReadingCanvasProps & { grammar: DiagramGrammar; flow: string | null },
): JSX.Element {
	if (props.projection.flow === null)
		return (
			<output
				data-slot={props.flow === null ? "model-flow-required" : "model-flow-missing"}
				className="text-body p-8"
			>
				{props.flow === null
					? "Choose an authored flow to read its behavior."
					: `The selected flow is unavailable: ${props.flow}. Choose another flow or restore its architecture.`}
			</output>
		);
	return (
		<ScopedModelReading key={`${props.grammar}:${props.flow}`} {...props} grammar={props.grammar} />
	);
}

/**
 * Only selection is local state; authored content remains the query snapshot.
 * @param props The coherent model and scope projection.
 * @returns Immediate children, nearby context, and authored details.
 */
function ScopedModelReading(
	props: ModelReadingCanvasProps & { grammar: DiagramGrammar },
): JSX.Element {
	const { model } = props;
	const { ids: selected, select } = props.selection;
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			<div className="relative flex min-h-0 min-w-0 flex-1">
				<Suspense fallback={LOADING_DIAGRAM}>
					<ModelDiagram
						warnings={props.warnings}
						grammar={props.grammar}
						model={model}
						projection={props.projection}
						selected={selected}
						onSelect={select}
						onSelectMany={props.selection.selectMany}
						onOpen={props.onOpen}
						reducedMotion={props.reducedMotion}
					/>
				</Suspense>
				<div
					data-slot="model-stage-overlay"
					className="pointer-events-none absolute inset-x-0 bottom-6 z-25 flex justify-center px-8"
				>
					{props.overlay}
				</div>
			</div>
		</div>
	);
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

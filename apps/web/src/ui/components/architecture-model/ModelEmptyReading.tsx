import { useCallback, type JSX, type PointerEvent } from "react";
import { Button } from "@archboard/ui-kit/components";
import { ModelState } from "#ui/components/architecture-model/ModelState.tsx";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

/**
 * An empty coherent reading is a finished picture too. An unavailable one says why itself.
 * @param props The scene and whether another reading is on its way.
 * @param props.scene The scene on screen.
 * @param props.pending Whether another reading is on its way.
 * @param props.onWholeScope Lift what narrows the reading, when something does.
 * @param props.onOpenState Read another state of the model.
 * @returns The statement that nothing is visible, or nothing.
 */
function ModelEmptyReading(props: {
	scene: AcceptedScene;
	pending: boolean;
	onWholeScope: (() => void) | undefined;
	onOpenState: ((state: string) => void) | undefined;
}): JSX.Element | null {
	const { scene, pending, onWholeScope, onOpenState } = props;
	if (scene.picture.svg !== "" || scene.grammar === null || pending) return null;
	if (isPlanned(scene)) return <ModelPlanned model={scene.model} onOpenState={onOpenState} />;
	return (
		<output
			data-slot="model-empty-diagram"
			className="text-body text-muted-foreground absolute inset-0 space-y-3 p-8"
		>
			{onWholeScope === undefined ? (
				<p>No modules are visible in this reading.</p>
			) : (
				<>
					<p>The focus and filters of this reading leave no module to show.</p>
					<Button
						variant="outline"
						size="sm"
						data-slot="model-whole-scope"
						onPointerDown={stopPropagation}
						onClick={onWholeScope}
					>
						Show whole scope
					</Button>
				</>
			)}
		</output>
	);
}

/**
 * Whether the reader looks at the Current of a model that has none.
 * @param scene The scene on screen.
 * @returns True for a planning model, read with no proposal chosen. A preview says so itself.
 */
function isPlanned(scene: AcceptedScene): boolean {
	const { manifest, selectedState, migrationPreview } = scene.model;
	return manifest.current === null && selectedState === null && migrationPreview === undefined;
}

/**
 * A planning model has no Current to draw. Its newest proposal is what it holds.
 * @param props The model and the way to a proposal.
 * @param props.model The model.
 * @param props.onOpenState Read a proposal.
 * @returns The state that nothing is implemented, and the way to the plan.
 */
function ModelPlanned(props: {
	model: AcceptedScene["model"];
	onOpenState: ((state: string) => void) | undefined;
}): JSX.Element {
	const { model, onOpenState } = props;
	const proposal = model.proposals.at(-1);
	const open = useCallback((): void => {
		if (proposal !== undefined) onOpenState?.(proposal.id);
	}, [proposal, onOpenState]);
	return (
		<ModelState slot="model-planned" cover>
			<ModelState.Title>Nothing implemented yet</ModelState.Title>
			<ModelState.Line>
				{proposal === undefined
					? `${model.manifest.name} has no proposal yet.`
					: `${model.manifest.name} is a plan, and its proposals hold it.`}
			</ModelState.Line>
			{proposal === undefined ? (
				<ModelState.Ask
					label="Ask the agent to propose a design"
					draft="Read this repository and propose its first architecture."
				/>
			) : (
				<Button
					size="sm"
					data-slot="model-open-proposal"
					onPointerDown={stopPropagation}
					onClick={open}
				>
					Open {proposal.name}
				</Button>
			)}
		</ModelState>
	);
}

/**
 * Keep a press on a control from starting a gesture on the picture around it.
 * @param event The press.
 */
function stopPropagation(event: PointerEvent<HTMLElement>): void {
	event.stopPropagation();
}

export { ModelEmptyReading };

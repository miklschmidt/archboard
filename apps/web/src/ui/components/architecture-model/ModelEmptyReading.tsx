import type { JSX, PointerEvent } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

/**
 * An empty coherent reading is a finished picture too. An unavailable one says why itself.
 * @param props The scene and whether another reading is on its way.
 * @param props.scene The scene on screen.
 * @param props.pending Whether another reading is on its way.
 * @param props.onWholeScope Lift what narrows the reading, when something does.
 * @returns The statement that nothing is visible, or nothing.
 */
function ModelEmptyReading(props: {
	scene: AcceptedScene;
	pending: boolean;
	onWholeScope: (() => void) | undefined;
}): JSX.Element | null {
	const { scene, pending, onWholeScope } = props;
	if (scene.picture.svg !== "" || scene.grammar === null || pending) return null;
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
 * Keep a press on a control from starting a gesture on the picture around it.
 * @param event The press.
 */
function stopPropagation(event: PointerEvent<HTMLElement>): void {
	event.stopPropagation();
}

export { ModelEmptyReading };

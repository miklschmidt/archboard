// The control that switches the layout engine every pane draws with (TASK-348).
//
// A preference of this browser rather than a fact about the board on screen,
// so it is the last row of the board tab, under its own rule, and says in one
// line what it sets (TASK-383). Its list is the shared select's, in the
// theme's own surface, in place of the system's. Its label is above it and it
// takes the width of the column, so that the longest engine's name is read whole.

import { useCallback, useId, type JSX } from "react";

import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { Select } from "@archboard/ui-kit/components";
import { useLayoutEngine } from "#ui/hooks/semantic-board-canvas/use-layout-engine.ts";
import {
	LAYOUT_ENGINES,
	chooseLayoutEngine,
} from "#ui/clients/semantic-board-canvas/reads/layout-engine.ts";

/** The engines as the select lists them: a value, and the words it shows. */
const ENGINE_ITEMS = LAYOUT_ENGINES.map(({ name, label }) => ({ value: name, label }));

/**
 * Choose the engine every pane lays its board out with.
 * @returns The control, with its label.
 */
function SemanticEngineBar(): JSX.Element {
	const engine = useLayoutEngine();
	const id = useId();
	const onChange = useCallback((value: string | null): void => {
		const parsed = LayoutEngineSchema.safeParse(value);
		if (parsed.success) chooseLayoutEngine(parsed.data);
	}, []);
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-body text-muted-foreground">
				Layout engine
			</label>
			<Select items={ENGINE_ITEMS} value={engine} onValueChange={onChange}>
				<Select.Trigger id={id} size="sm" data-slot="semantic-engine-choice" className="w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					{ENGINE_ITEMS.map(({ value, label }) => (
						<Select.Item key={value} value={value}>
							{label}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
		</div>
	);
}

export { SemanticEngineBar };

// The control that switches the layout engine every pane draws with (TASK-348).
//
// A preference of this browser rather than a fact about the board on screen,
// so it is the last row of the board tab, under its own rule, and says in one
// line what it sets (TASK-383).

import { useCallback, useId, type ChangeEvent, type JSX } from "react";

import { LayoutEngineSchema } from "@/shared/semantic-board/index";
import { useLayoutEngine } from "@/ui/semantic-board-canvas/hooks/use-layout-engine";
import { LAYOUT_ENGINES, chooseLayoutEngine } from "@/ui/semantic-board-canvas/lib/layout-engine";

/**
 * Choose the engine every pane lays its board out with.
 * @returns The control, with its label.
 */
function SemanticEngineBar(): JSX.Element {
	const engine = useLayoutEngine();
	const id = useId();
	const onChange = useCallback((event: ChangeEvent<HTMLSelectElement>): void => {
		const parsed = LayoutEngineSchema.safeParse(event.target.value);
		if (parsed.success) chooseLayoutEngine(parsed.data);
	}, []);
	return (
		<div className="flex items-center justify-between gap-2">
			<label htmlFor={id} className="text-body text-muted-foreground shrink-0">
				Layout engine
			</label>
			<select
				id={id}
				data-slot="semantic-engine-choice"
				className="text-control border-border bg-background hover:bg-accent focus-visible:ring-ring h-7 min-w-0 rounded-sm border px-2 focus-visible:ring-2 focus-visible:outline-none"
				value={engine}
				onChange={onChange}
			>
				{LAYOUT_ENGINES.map(({ name, label }) => (
					<option key={name} value={name}>
						{label}
					</option>
				))}
			</select>
		</div>
	);
}

export { SemanticEngineBar };

// The control that switches the layout engine every pane draws with (TASK-348).

import { useCallback, type ChangeEvent, type JSX } from "react";

import { LayoutEngineSchema } from "@/shared/semantic-board/index";
import { useLayoutEngine } from "@/ui/semantic-board-canvas/hooks/use-layout-engine";
import { LAYOUT_ENGINES, chooseLayoutEngine } from "@/ui/semantic-board-canvas/lib/layout-engine";

/**
 * Choose the engine every pane lays its board out with.
 * @returns The control.
 */
function SemanticEngineBar(): JSX.Element {
	const engine = useLayoutEngine();
	const onChange = useCallback((event: ChangeEvent<HTMLSelectElement>): void => {
		const parsed = LayoutEngineSchema.safeParse(event.target.value);
		if (parsed.success) chooseLayoutEngine(parsed.data);
	}, []);
	return (
		<select
			aria-label="Layout engine"
			data-slot="semantic-engine-choice"
			className="text-control border-border bg-background hover:bg-accent focus-visible:ring-ring h-7 w-full rounded-sm border px-2 focus-visible:ring-2 focus-visible:outline-none"
			value={engine}
			onChange={onChange}
		>
			{LAYOUT_ENGINES.map(({ name, label }) => (
				<option key={name} value={name}>
					{label}
				</option>
			))}
		</select>
	);
}

export { SemanticEngineBar };

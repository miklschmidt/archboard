import type { JSX } from "react";
import { ModelSwitch } from "#ui/architecture-drawing/model-reader/reading/components/ModelSwitch.tsx";
import {
	LAYOUT_ENGINES,
	chooseLayoutEngine,
} from "#ui/architecture-drawing/canvas/picture/clients/layout-engine.ts";
import { useLayoutEngine } from "#ui/architecture-drawing/canvas/picture/hooks/use-layout-engine.ts";

/** The engines as the switch offers them. */
const ENGINES = LAYOUT_ENGINES.map(({ name, label }) => ({ value: name, label }));

/**
 * Choose the engine that lays out every structural picture of this browser.
 * @returns The switch, under its name.
 */
function ModelEngine(): JSX.Element {
	return (
		<div
			data-slot="model-engine"
			className="flex shrink-0 items-center justify-between gap-2 px-4 py-2"
		>
			<span className="text-body text-muted-foreground">Layout engine</span>
			<ModelSwitch
				label="Layout engine"
				slot="model-engine-choice"
				choices={ENGINES}
				value={useLayoutEngine()}
				onChange={chooseLayoutEngine}
			/>
		</div>
	);
}

export { ModelEngine };

import type { JSX } from "react";
import { ModelSwitch } from "#ui/components/architecture-model/ModelSwitch.tsx";
import { HOVER_LIGHTS, chooseHoverLight } from "#ui/clients/canvas/subjects/hover-light.ts";
import { useHoverLight } from "#ui/hooks/canvas/use-hover-light.ts";

/**
 * Choose whether a part the pointer rests on dims the rest of the picture.
 * @returns The switch, under its name.
 */
function ModelHoverLight(): JSX.Element {
	return (
		<div
			data-slot="model-hover-light"
			className="border-border flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2"
		>
			<span className="text-body text-muted-foreground">Dim on hover</span>
			<ModelSwitch
				label="Dim on hover"
				slot="model-hover-light-choice"
				choices={HOVER_LIGHTS}
				value={useHoverLight()}
				onChange={chooseHoverLight}
			/>
		</div>
	);
}

export { ModelHoverLight };

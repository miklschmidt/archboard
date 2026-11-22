import type { JSX, ReactNode } from "react";
import { ModelSwitch } from "#ui/architecture-drawing/model-reader/reading/components/ModelSwitch.tsx";
import {
	HOVER_LIGHTS,
	chooseHoverLight,
} from "#ui/architecture-drawing/canvas/picture/clients/hover-light.ts";
import { useHoverLight } from "#ui/architecture-drawing/canvas/picture/hooks/use-hover-light.ts";

/**
 * One setting: its name and what it does, with its control at the end.
 * @param props The setting.
 * @param props.slot The row's slot.
 * @param props.name The setting's name.
 * @param props.gloss What the setting does.
 * @param props.children The control.
 * @returns The row.
 */
function SettingRow(props: {
	readonly slot: string;
	readonly name: string;
	readonly gloss: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<div data-slot={props.slot} className="flex items-center justify-between gap-6 py-3">
			<div className="flex min-w-0 flex-col gap-1">
				<span className="text-control text-foreground font-semibold">{props.name}</span>
				<span className="text-body text-muted-foreground">{props.gloss}</span>
			</div>
			{props.children}
		</div>
	);
}

/**
 * How this browser draws pictures: whether a part the pointer rests on dims the rest. The choice
 * takes effect at once and stays in this browser.
 * @returns The settings.
 */
function PictureSettings(): JSX.Element {
	return (
		<div data-slot="picture-settings" className="flex flex-col">
			<SettingRow
				slot="model-hover-light"
				name="Dim on hover"
				gloss="A part under the pointer dims the rest of the picture. A pick, a trace and a row of the panel light it either way."
			>
				<ModelSwitch
					label="Dim on hover"
					slot="model-hover-light-choice"
					choices={HOVER_LIGHTS}
					value={useHoverLight()}
					onChange={chooseHoverLight}
				/>
			</SettingRow>
		</div>
	);
}

export { PictureSettings };

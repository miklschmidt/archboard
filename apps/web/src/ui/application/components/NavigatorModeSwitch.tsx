// The switch of what the navigator lists, in the row of the agent dock's keys (TASK-649):
// Architecture, the reading's modules, flows and walkthroughs, or Code, the files of its code with
// the code view beside them.

import type { JSX } from "react";

import { ModelSwitch } from "#ui/architecture-drawing/model-reader/reading/components/ModelSwitch.tsx";
import type { NavigatorMode } from "#ui/shell/rules/contracts.ts";

/** What the navigator can list. */
const MODES = [
	{ value: "architecture", label: "Architecture" },
	{ value: "code", label: "Code" },
] as const satisfies readonly { readonly value: NavigatorMode; readonly label: string }[];

/** Inputs for the switch. */
interface NavigatorModeSwitchProps {
	readonly mode: NavigatorMode;
	readonly onMode: (mode: NavigatorMode) => void;
}

/**
 * The switch of what the navigator lists.
 * @param props The mode and the way to change it.
 * @returns The switch.
 */
function NavigatorModeSwitch(props: NavigatorModeSwitchProps): JSX.Element {
	return (
		<ModelSwitch
			label="The navigator lists"
			slot="navigator-mode"
			choices={MODES}
			value={props.mode}
			onChange={props.onMode}
			wide
		/>
	);
}

export { NavigatorModeSwitch };

// The one place official Excalidraw is mounted. A pane owns exactly one stage;
// the shell gives it a real height and everything else stays Excalidraw's.

import { Excalidraw } from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useMemo } from "react";

import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND } from "@/shared/appearance/appearance";

/** The fill defaults every shape starts with, so its interior is selectable. */
const INITIAL_DATA: ExcalidrawInitialDataState = {
	appState: {
		currentItemBackgroundColor: DEFAULT_SHAPE_BACKGROUND,
		currentItemFillStyle: DEFAULT_FILL_STYLE,
	},
};

/** Inputs for one mounted canvas. */
interface ExcalidrawStageProps {
	theme: "light" | "dark";
	viewModeEnabled: boolean;
	/** Receives Excalidraw's imperative API once the canvas has mounted. */
	onApi?: (api: ExcalidrawImperativeAPI) => void;
}

/**
 * Mount official Excalidraw inside a flex child that gives it a real height.
 * @param props The theme, mode and API callback for this canvas.
 * @returns The stage element holding one Excalidraw instance.
 */
function ExcalidrawStage(props: ExcalidrawStageProps): React.JSX.Element {
	const { onApi } = props;
	const apiProps = useMemo(() => (onApi ? { excalidrawAPI: onApi } : {}), [onApi]);
	return (
		<div data-slot="excalidraw-stage" className="relative min-h-0 min-w-0 flex-1">
			<Excalidraw
				theme={props.theme}
				viewModeEnabled={props.viewModeEnabled}
				initialData={INITIAL_DATA}
				{...apiProps}
			/>
		</div>
	);
}

export { ExcalidrawStage, type ExcalidrawStageProps };

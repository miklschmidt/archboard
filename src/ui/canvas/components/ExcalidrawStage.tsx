// The one place official Excalidraw is mounted. A pane owns exactly one stage;
// the shell gives it a real height and everything else stays Excalidraw's.

import { Excalidraw } from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
	ExcalidrawProps,
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

/** The Excalidraw callbacks a session binds; each is optional. */
type StageBindings = Pick<
	ExcalidrawProps,
	"excalidrawAPI" | "onChange" | "onLibraryChange" | "onLinkOpen"
>;

/** Inputs for one mounted canvas. */
interface ExcalidrawStageProps extends Omit<StageBindings, "excalidrawAPI"> {
	theme: "light" | "dark";
	viewModeEnabled: boolean;
	/** Receives Excalidraw's imperative API once the canvas has mounted. */
	onApi?: (api: ExcalidrawImperativeAPI) => void;
	/** Receives the element the canvas fills, for the session that watches its size. */
	attachStage?: (element: HTMLDivElement | null) => void;
}

/**
 * The bound callbacks, with absent ones left out so Excalidraw sees no
 * `undefined` prop.
 * @param onApi The API callback.
 * @param onChange Excalidraw's onChange.
 * @param onLibraryChange Excalidraw's onLibraryChange.
 * @param onLinkOpen Excalidraw's onLinkOpen.
 * @returns The callbacks to spread.
 */
function boundProps(
	onApi: ExcalidrawStageProps["onApi"],
	onChange: ExcalidrawStageProps["onChange"],
	onLibraryChange: ExcalidrawStageProps["onLibraryChange"],
	onLinkOpen: ExcalidrawStageProps["onLinkOpen"],
): StageBindings {
	const bound: StageBindings = {};
	if (onApi) {
		bound.excalidrawAPI = onApi;
	}
	if (onChange) {
		bound.onChange = onChange;
	}
	if (onLibraryChange) {
		bound.onLibraryChange = onLibraryChange;
	}
	if (onLinkOpen) {
		bound.onLinkOpen = onLinkOpen;
	}
	return bound;
}

/**
 * Mount official Excalidraw inside a flex child that gives it a real height.
 * @param props The theme, mode, callbacks and stage ref for this canvas.
 * @returns The stage element holding one Excalidraw instance.
 */
function ExcalidrawStage(props: ExcalidrawStageProps): React.JSX.Element {
	const { onApi, onChange, onLibraryChange, onLinkOpen, attachStage, theme, viewModeEnabled } =
		props;
	const bound = useMemo(
		() => boundProps(onApi, onChange, onLibraryChange, onLinkOpen),
		[onApi, onChange, onLibraryChange, onLinkOpen],
	);
	return (
		<div data-slot="excalidraw-stage" ref={attachStage} className="relative min-h-0 min-w-0 flex-1">
			<Excalidraw
				theme={theme}
				viewModeEnabled={viewModeEnabled}
				initialData={INITIAL_DATA}
				{...bound}
			/>
		</div>
	);
}

export { ExcalidrawStage, type ExcalidrawStageProps };

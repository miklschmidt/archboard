// Fullscreen presentation of one pane: the canvas, a minimal exit control and
// the slot the voice workbench's mute and stop controls will occupy.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { RiFullscreenExitLine } from "@remixicon/react";
import { useCallback } from "react";

import { Button } from "@/ui/components/button";
import { ExcalidrawStage } from "@/ui/canvas/excalidraw-stage";
import type { ShellActions, ShellPane, ThemeChoice } from "@/ui/shell/lib/contracts";

/** Inputs for the presentation layer. */
interface PresentationProps {
	pane: ShellPane;
	theme: ThemeChoice;
	actions: ShellActions;
}

/**
 * One pane, fullscreen.
 * @param props The pane, the theme and the actions.
 * @returns The presentation layer.
 */
function Presentation(props: PresentationProps): React.JSX.Element {
	const { actions } = props;
	const { paneId } = props.pane.status;
	const handleExit = useCallback(() => actions.present(null), [actions]);
	const handleApi = useCallback(
		(api: ExcalidrawImperativeAPI) => actions.canvasReady(paneId, api),
		[actions, paneId],
	);
	return (
		<div className="bg-background relative flex h-full flex-col">
			<div className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-2">
				<Button variant="ghost" size="sm" onClick={handleExit}>
					<RiFullscreenExitLine data-icon="inline-start" />
					Exit presentation
				</Button>
				<span className="flex-1" />
				<fieldset
					aria-label="Voice controls"
					className="text-muted-foreground m-0 border-0 p-0 text-xs"
				>
					Mute and stop arrive with the voice workbench.
				</fieldset>
			</div>
			<section aria-label={`Pane ${paneId}`} className="flex min-h-0 flex-1 flex-col">
				<ExcalidrawStage theme={props.theme} viewModeEnabled={false} onApi={handleApi} />
			</section>
		</div>
	);
}

export { Presentation, type PresentationProps };

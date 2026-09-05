// Fullscreen presentation of one pane: the canvas fills the viewport under a
// slim bar with the exit control and the slot for the voice workbench's mute
// and stop controls. A disconnected presentation says so and offers the exit.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { RiFullscreenExitLine } from "@remixicon/react";
import { useCallback } from "react";

import { Button } from "@/ui/components/button";
import { ExcalidrawStage } from "@/ui/canvas/excalidraw-stage";
import type {
	ShellActions,
	ShellPane,
	ShellPresentation,
	ThemeChoice,
} from "@/ui/shell/lib/contracts";

/** Inputs for the presentation layer. */
interface PresentationProps {
	presentation: ShellPresentation;
	pane: ShellPane;
	theme: ThemeChoice;
	/** Live voice mute and stop controls, when the voice workbench supplies them. */
	voiceControls: React.ReactNode;
	actions: ShellActions;
}

/** Inputs for the exit control. */
interface ExitControlProps {
	actions: ShellActions;
}

/**
 * Leave the presentation.
 * @param props The actions.
 * @returns The exit button.
 */
function ExitControl(props: ExitControlProps): React.JSX.Element {
	const { actions } = props;
	const handleExit = useCallback(() => actions.present(null), [actions]);
	return (
		<Button variant="ghost" size="sm" onClick={handleExit}>
			<RiFullscreenExitLine data-icon="inline-start" />
			Exit presentation
		</Button>
	);
}

/** Inputs for the voice slot. */
interface VoiceSlotProps {
	children: React.ReactNode;
}

/**
 * The labelled slot the voice workbench's mute and stop controls occupy.
 * @param props The controls, or nothing until the voice workbench supplies them.
 * @returns The slot.
 */
function VoiceSlot(props: VoiceSlotProps): React.JSX.Element {
	return (
		<fieldset aria-label="Voice controls" className="m-0 flex items-center gap-1 border-0 p-0">
			{props.children ?? (
				<span className="text-muted-foreground text-xs">
					Mute and stop arrive with the voice workbench.
				</span>
			)}
		</fieldset>
	);
}

/** Inputs for the recovery message. */
interface RecoveryMessageProps {
	message: string;
}

/**
 * What the person sees when the presented pane has lost its connection.
 * @param props The plain message.
 * @returns The message, centred where the canvas was.
 */
function RecoveryMessage(props: RecoveryMessageProps): React.JSX.Element {
	return (
		<section
			aria-label="Presentation recovery"
			className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
		>
			<p className="text-base font-medium">The presented pane is disconnected</p>
			<p className="text-muted-foreground max-w-prose text-sm">{props.message}</p>
		</section>
	);
}

/**
 * One pane, fullscreen.
 * @param props The presentation, the pane, the theme, the voice slot and the actions.
 * @returns The presentation layer.
 */
function Presentation(props: PresentationProps): React.JSX.Element {
	const { actions, presentation, pane } = props;
	const { paneId, connected } = pane.status;
	const handleApi = useCallback(
		(api: ExcalidrawImperativeAPI) => actions.canvasReady(paneId, api),
		[actions, paneId],
	);
	return (
		<div data-slot="presentation" className="bg-background relative flex h-full flex-col">
			<div className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-2">
				<ExitControl actions={actions} />
				<span className="text-muted-foreground text-xs">
					Pane <span className="font-mono">{paneId}</span>
					{pane.status.board && ` · ${pane.status.board.board}`}
				</span>
				<span className="flex-1" />
				<VoiceSlot>{props.voiceControls}</VoiceSlot>
			</div>
			{presentation.kind === "recovery" ? (
				<RecoveryMessage message={presentation.message} />
			) : (
				<section aria-label={`Pane ${paneId}`} className="flex min-h-0 flex-1 flex-col">
					<ExcalidrawStage theme={props.theme} viewModeEnabled={!connected} onApi={handleApi} />
				</section>
			)}
		</div>
	);
}

export { Presentation, type PresentationProps };

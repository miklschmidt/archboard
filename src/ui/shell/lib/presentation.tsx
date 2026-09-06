// Fullscreen presentation of one pane: a slim bar with the exit control and
// the slot for the voice workbench's controls, above the pane's own canvas,
// which stays mounted where it is. A disconnected presentation says so and
// offers the exit.

import { RiFullscreenExitLine } from "@remixicon/react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/ui/components/button";
import type { ShellActions, ShellPane } from "@/ui/shell/lib/contracts";

/** Inputs for the presentation bar. */
interface PresentationBarProps {
	pane: ShellPane;
	/** A refused exit, shown in the bar so it is seen from inside the presentation. */
	error: string | null;
	/** Live voice controls, when the voice workbench supplies them. */
	voiceControls: React.ReactNode;
	actions: ShellActions;
}

/** Inputs for the exit control. */
interface ExitControlProps {
	actions: ShellActions;
}

/**
 * Leave the presentation. The control takes focus when the bar mounts: the
 * control that started the presentation sits outside the presented stage,
 * so keyboard focus would otherwise be stranded on something unseen.
 * @param props The actions.
 * @returns The exit button.
 */
function ExitControl(props: ExitControlProps): React.JSX.Element {
	const { actions } = props;
	const exit = useRef<HTMLButtonElement | null>(null);
	const handleExit = useCallback(() => actions.present(null), [actions]);
	useEffect(() => {
		exit.current?.focus();
	}, []);
	return (
		<Button ref={exit} variant="ghost" size="sm" onClick={handleExit}>
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
 * The labelled slot the voice workbench's controls occupy.
 * @param props The controls, or nothing while no voice workbench is attached.
 * @returns The slot.
 */
function VoiceSlot(props: VoiceSlotProps): React.JSX.Element {
	return (
		<fieldset aria-label="Voice controls" className="m-0 flex items-center gap-1 border-0 p-0">
			{props.children ?? (
				<span className="text-muted-foreground text-xs">No voice workbench on this pane.</span>
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
 * The bar above a presented pane.
 * @param props The pane, the voice slot and the actions.
 * @returns The bar.
 */
function PresentationBar(props: PresentationBarProps): React.JSX.Element {
	const { actions, pane } = props;
	const { paneId } = pane.status;
	return (
		<div
			data-slot="presentation-bar"
			data-presentation={paneId}
			className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-2"
		>
			<ExitControl actions={actions} />
			<span className="text-muted-foreground text-xs">
				Pane <span className="font-mono">{paneId}</span>
				{pane.status.board && ` · ${pane.status.board.board}`}
			</span>
			{props.error !== null && (
				<span role="alert" className="text-destructive min-w-0 truncate text-xs">
					{props.error}
				</span>
			)}
			<span className="flex-1" />
			<VoiceSlot>{props.voiceControls}</VoiceSlot>
		</div>
	);
}

export { PresentationBar, RecoveryMessage, type PresentationBarProps };

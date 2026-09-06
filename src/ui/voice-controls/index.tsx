// Start, mute, unmute, stop and restart for the live voice session, from
// shadcn Buttons and Tooltips. The expanded variant sits in the workbench's
// voice row beside the output wave and shows the state words; the compact
// variant fits the dock header and the fullscreen slot. Both are 24px icon
// controls whose visible label is the tooltip and whose text is read by
// assistive technology. Neither reads audio: there is no input meter.

import { RiMicLine, RiMicOffLine, RiPlayLine, RiRestartLine, RiStopLine } from "@remixicon/react";
import { cn } from "cn";

import { buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import { voiceControlsAvailability } from "@/ui/voice-controls/availability";
import type { ControlAvailability } from "@/ui/voice-controls/availability";
import type { VoiceControlsActions, VoiceControlsView } from "@/ui/voice-controls/contracts";

/** Inputs for either variant. */
interface VoiceControlsProps {
	view: VoiceControlsView;
	actions: VoiceControlsActions;
	className?: string;
}

/** One control's label, icon, tone and callback. */
interface ControlSpec {
	label: string;
	icon: React.JSX.Element;
	variant: "default" | "outline" | "ghost";
	availability: ControlAvailability;
	onClick: () => void;
}

/**
 * The five controls in display order, with the availability the view allows.
 * Start and unmute are the primary affordance; the rest are ordinary outline
 * controls, stopping included.
 * @param view The controls' inputs.
 * @param actions The callbacks.
 * @returns The control specs, hidden ones included.
 */
function controlSpecs(view: VoiceControlsView, actions: VoiceControlsActions): ControlSpec[] {
	const availability = voiceControlsAvailability(view);
	return [
		{
			label: "Start voice",
			icon: <RiPlayLine />,
			variant: "default",
			availability: availability.start,
			onClick: actions.start,
		},
		{
			label: "Mute",
			icon: <RiMicOffLine />,
			variant: "outline",
			availability: availability.mute,
			onClick: actions.mute,
		},
		{
			label: "Unmute",
			icon: <RiMicLine />,
			variant: "default",
			availability: availability.unmute,
			onClick: actions.unmute,
		},
		{
			label: "Stop voice",
			icon: <RiStopLine />,
			variant: "outline",
			availability: availability.stop,
			onClick: actions.stop,
		},
		{
			label: "Restart voice",
			icon: <RiRestartLine />,
			variant: "outline",
			availability: availability.restart,
			onClick: actions.restart,
		},
	];
}

/** Inputs for one icon control. */
interface IconControlProps {
	spec: ControlSpec;
}

/**
 * One 24px icon control with its tooltip and its label for assistive
 * technology; the hit area reaches 32px (the documented desktop exception).
 * @param props The control spec.
 * @returns The button, or nothing when the control is hidden.
 */
function IconControl(props: IconControlProps): React.JSX.Element | null {
	const { spec } = props;
	if (!spec.availability.shown) {
		return null;
	}
	return (
		<Tooltip>
			<TooltipTrigger
				className={cn(
					buttonVariants({ variant: spec.variant, size: "icon-xs" }),
					"relative rounded-sm after:absolute after:-inset-1",
				)}
				aria-label={spec.label}
				disabled={!spec.availability.enabled}
				onClick={spec.onClick}
			>
				{spec.icon}
				<span className="sr-only">{spec.label}</span>
			</TooltipTrigger>
			<TooltipContent side="top">{spec.label}</TooltipContent>
		</Tooltip>
	);
}

/** Inputs for the state words. */
interface StateTextProps {
	view: VoiceControlsView;
}

/**
 * The colour of the state words: lime while live, foreground after a failure,
 * muted otherwise.
 * @param live Whether the session carries audio.
 * @param failed Whether the last command failed.
 * @returns The text colour class.
 */
function stateTone(live: boolean, failed: boolean): string {
	if (failed) {
		return "text-foreground";
	}
	return live ? "text-status-foreground" : "text-muted-foreground";
}

/**
 * The dot beside the state words.
 * @param live Whether the session carries audio.
 * @param failed Whether the last command failed.
 * @returns The dot colour class.
 */
function dotTone(live: boolean, failed: boolean): string {
	if (failed) {
		return "bg-destructive";
	}
	return live ? "bg-status" : "bg-muted-foreground/60";
}

/**
 * The state words with a tone dot: lime while live, grey while ordinary
 * unavailability, destructive only after a failure.
 * @param props The view.
 * @returns The dot and the live-announced words.
 */
function StateText(props: StateTextProps): React.JSX.Element {
	const { stateText, live } = voiceControlsAvailability(props.view);
	const failed = props.view.failure !== null;
	return (
		<span className="flex min-w-0 flex-1 items-center gap-2">
			<span
				aria-hidden="true"
				className={`size-1.5 shrink-0 rounded-full ${dotTone(live, failed)}`}
			/>
			<output
				aria-live="polite"
				title={stateText}
				className={`text-body truncate ${stateTone(live, failed)}`}
			>
				{stateText}
			</output>
		</span>
	);
}

/**
 * The compact variant: icon buttons with tooltips and the state text for
 * assistive technology, for the dock header and the fullscreen slot.
 * @param props The view, the callbacks and an optional class.
 * @returns A toolbar of icon controls.
 */
function VoiceControlsCompact(props: VoiceControlsProps): React.JSX.Element {
	const specs = controlSpecs(props.view, props.actions);
	const { stateText } = voiceControlsAvailability(props.view);
	return (
		<div data-voice-controls="compact" className={cn("flex items-center gap-1", props.className)}>
			<output aria-live="polite" className="sr-only">
				{stateText}
			</output>
			{specs.map((spec) => (
				<IconControl key={spec.label} spec={spec} />
			))}
		</div>
	);
}

/**
 * The expanded variant: the visible state words and the icon controls, for
 * the workbench's voice row beside the output wave.
 * @param props The view, the callbacks and an optional class.
 * @returns The state line and a toolbar of controls.
 */
function VoiceControls(props: VoiceControlsProps): React.JSX.Element {
	const specs = controlSpecs(props.view, props.actions);
	return (
		<div
			data-voice-controls="expanded"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<StateText view={props.view} />
			<span className="flex shrink-0 items-center gap-1">
				{specs.map((spec) => (
					<IconControl key={spec.label} spec={spec} />
				))}
			</span>
		</div>
	);
}

export { VoiceControls, VoiceControlsCompact, type VoiceControlsProps };

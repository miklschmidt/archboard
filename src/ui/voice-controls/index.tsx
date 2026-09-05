// Start, mute, unmute, stop and restart for the live voice session, from
// shadcn Buttons and Tooltips. The expanded variant sits in the workbench
// beside the output wave; the compact variant fits a collapsed dock header
// and the fullscreen slot. Neither reads audio: there is no input meter.

import { RiMicLine, RiMicOffLine, RiPlayLine, RiRestartLine, RiStopLine } from "@remixicon/react";
import { cn } from "cn";

import { Button, buttonVariants } from "@/ui/components/button";
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
	variant: "default" | "outline" | "ghost" | "destructive";
	availability: ControlAvailability;
	onClick: () => void;
}

/**
 * The five controls in display order, with the availability the view allows.
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
			variant: "destructive",
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

/** Inputs for one compact icon control. */
interface IconControlProps {
	spec: ControlSpec;
}

/**
 * One icon-only control with its tooltip.
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
				className={buttonVariants({ variant: spec.variant, size: "icon-xs" })}
				aria-label={spec.label}
				disabled={!spec.availability.enabled}
				onClick={spec.onClick}
			>
				{spec.icon}
			</TooltipTrigger>
			<TooltipContent side="top">{spec.label}</TooltipContent>
		</Tooltip>
	);
}

/** Inputs for one labelled control. */
interface LabelledControlProps {
	spec: ControlSpec;
}

/**
 * One control with its icon and visible label.
 * @param props The control spec.
 * @returns The button, or nothing when the control is hidden.
 */
function LabelledControl(props: LabelledControlProps): React.JSX.Element | null {
	const { spec } = props;
	if (!spec.availability.shown) {
		return null;
	}
	return (
		<Button
			variant={spec.variant}
			size="xs"
			disabled={!spec.availability.enabled}
			onClick={spec.onClick}
		>
			{spec.icon}
			{spec.label}
		</Button>
	);
}

/**
 * The compact variant: icon buttons with tooltips and the state text for
 * assistive technology, for the collapsed dock header and the fullscreen slot.
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
 * The expanded variant: labelled buttons and the visible state text, for the
 * open workbench beside the output wave.
 * @param props The view, the callbacks and an optional class.
 * @returns A toolbar of labelled controls and the state line.
 */
function VoiceControls(props: VoiceControlsProps): React.JSX.Element {
	const specs = controlSpecs(props.view, props.actions);
	const { stateText, live } = voiceControlsAvailability(props.view);
	return (
		<div
			data-voice-controls="expanded"
			className={cn("flex min-w-0 items-center gap-2", props.className)}
		>
			<output
				aria-live="polite"
				className={cn(
					"truncate text-xs",
					live ? "text-status-foreground" : "text-muted-foreground",
					props.view.failure === null ? undefined : "text-destructive",
				)}
			>
				{stateText}
			</output>
			<span className="flex items-center gap-1">
				{specs.map((spec) => (
					<LabelledControl key={spec.label} spec={spec} />
				))}
			</span>
		</div>
	);
}

export { VoiceControls, VoiceControlsCompact, type VoiceControlsProps };

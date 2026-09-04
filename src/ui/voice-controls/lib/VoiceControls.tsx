import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import { useVoiceSession, type VoiceSession } from "../../voice-session/index.js";
import type {
	VoiceControlAction,
	VoiceControlCommand,
	VoiceControlsProps,
	VoiceControlsView,
} from "../contract.js";
import { projectVoiceControls } from "./projection.js";
import { useReducedMotion } from "./reduced-motion.js";
import { VoiceGlyph } from "./VoiceGlyph.js";
import { VoiceLevelMeter } from "./VoiceLevelMeter.js";

/**
 * The complete set of things this control can do. Every entry is one method on
 * the presentation adapter: there is no other path from a press to the realtime
 * session, no media object in reach, and no correlation minted here.
 */
const COMMANDS = {
	start: (session: VoiceSession) => session.start(),
	mute: (session: VoiceSession) => session.mute(),
	unmute: (session: VoiceSession) => session.unmute(),
	stop: (session: VoiceSession) => session.stop(),
	restart: (session: VoiceSession) => session.restart(),
	close: (session: VoiceSession) => session.close(),
} as const satisfies Record<VoiceControlCommand, (session: VoiceSession) => Promise<unknown>>;

const TONES = {
	primary: "primary",
	secondary: "secondary",
	quiet: "quiet",
} as const satisfies Record<VoiceControlAction["emphasis"], "primary" | "secondary" | "quiet">;

function CommandButton({
	action,
	onRun,
	reasonId,
}: {
	readonly action: VoiceControlAction;
	readonly onRun: (command: VoiceControlCommand) => void;
	readonly reasonId: string;
}): React.JSX.Element {
	const press = useCallback(() => onRun(action.command), [action.command, onRun]);
	return (
		<>
			<Button
				aria-describedby={action.reason === null ? undefined : reasonId}
				aria-label={action.accessibleLabel}
				data-voice-command={action.command}
				data-voice-enabled={action.enabled ? "" : undefined}
				disabled={!action.enabled}
				onClick={press}
				tone={TONES[action.emphasis]}
			>
				{action.label}
			</Button>
			{action.reason !== null && (
				<span className="sr-only" data-voice-reason={action.command} id={reasonId}>
					{action.reason}
				</span>
			)}
		</>
	);
}

function TransportRow({ view }: { readonly view: VoiceControlsView }): React.JSX.Element {
	const transport = view.transport;
	const binding = transport.binding;
	return (
		<div
			className="mt-control flex flex-wrap items-baseline gap-control-inline border-t border-border-subtle pt-control font-sans text-body"
			data-voice-transport={transport.active ? "active" : "idle"}
		>
			<span className="flex items-baseline gap-control">
				<span className="text-kicker font-semibold text-muted-foreground">Transport</span>
				<span className={transport.active ? "text-status-foreground" : "text-muted-foreground"}>
					{transport.label}
				</span>
				<code className="font-mono text-technical text-muted-foreground">{transport.feature}</code>
			</span>
			{binding === null ? (
				<span className="text-muted-foreground">No voice session is bound to this pane.</span>
			) : (
				<span className="flex flex-wrap items-baseline gap-control-inline font-mono text-technical text-muted-foreground">
					<span data-voice-bound="pane">pane {binding.paneId}</span>
					<span data-voice-bound="thread-link">
						{binding.childId}/{binding.epoch}/{binding.workhorseThreadId}
					</span>
					<span data-voice-bound="coordinator">
						{binding.coordinatorThreadId ?? "no coordinator"}
					</span>
					{transport.sessionId !== null && (
						<span data-voice-bound="session">{transport.sessionId}</span>
					)}
				</span>
			)}
		</div>
	);
}

/**
 * The persistent live voice control for one pane.
 *
 * It renders in all thirteen states, keeps Start, the microphone toggle, and
 * Stop in the same three places throughout, and emits nothing but the
 * adapter's own commands. It owns one piece of state of its own — which command
 * it sent and has not seen settle — because that, and not a guess about the
 * session, is what makes a repeated or late press inert with something true to
 * say about why.
 */
export function VoiceControls({ session, className }: VoiceControlsProps): React.JSX.Element {
	const sessionView = useVoiceSession(session);
	const [pending, setPending] = useState<VoiceControlCommand | null>(null);
	const pendingRef = useRef<VoiceControlCommand | null>(null);
	const mounted = useRef(true);
	const ids = useId();
	const reducedMotion = useReducedMotion();

	useEffect(
		() => () => {
			// A command that settles after this control is gone must not write to
			// it, and must not re-enable a session nobody is looking at.
			mounted.current = false;
		},
		[],
	);

	const run = useCallback(
		(command: VoiceControlCommand) => {
			if (pendingRef.current !== null) return;
			pendingRef.current = command;
			setPending(command);
			const settle = (): void => {
				if (!mounted.current || pendingRef.current !== command) return;
				pendingRef.current = null;
				setPending(null);
			};
			void Promise.resolve(COMMANDS[command](session)).then(settle, settle);
		},
		[session],
	);

	const view = projectVoiceControls({ view: sessionView, pending });

	return (
		<section
			aria-label="Live voice"
			className={cn(
				"min-w-0 flex flex-col gap-control border-border-subtle font-sans text-body text-foreground",
				className,
			)}
			data-voice-controls=""
			data-voice-meter-allowed={view.meter ? "" : undefined}
			data-voice-state={view.state}
		>
			<header className="min-w-0 flex flex-wrap items-center gap-control-inline">
				<span className="min-w-0 flex items-center gap-control">
					<VoiceGlyph className="shrink-0 text-muted-foreground" name={view.glyph} />
					<span className="text-control font-semibold" data-voice-label="">
						{view.label}
					</span>
				</span>
				{view.meter && !reducedMotion && <VoiceLevelMeter session={session} />}
			</header>

			<output
				aria-atomic="true"
				aria-live={view.failureMessage === null ? "polite" : "assertive"}
				className="sr-only"
				data-voice-announcer=""
				role={view.failureMessage === null ? "status" : "alert"}
			>
				{view.accessibleStatus}
			</output>

			<p className="text-muted-foreground" data-voice-detail="">
				{view.detail}
			</p>
			{view.recovery !== null && (
				<p className="text-muted-foreground" data-voice-recovery="">
					{view.recovery}
				</p>
			)}

			{/* A fieldset, not a div with role="group": the grouping is real, and the
			    repository lint prefers the semantic tag over the role. */}
			<fieldset
				aria-label="Voice commands"
				className="p-0 flex flex-wrap items-center gap-control border-0"
				data-voice-commands=""
			>
				{view.actions.map((action) => (
					<CommandButton
						action={action}
						key={action.command}
						onRun={run}
						reasonId={`${ids}-${action.command}`}
					/>
				))}
			</fieldset>

			<TransportRow view={view} />
		</section>
	);
}

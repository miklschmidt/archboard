import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useSyncExternalStore,
	type CompositionEvent,
	type KeyboardEvent,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import { assistantComposerPrimitives } from "../composer.js";
import type {
	WorkbenchComposerLink,
	WorkbenchComposerProps,
	WorkbenchComposerStatus,
	WorkbenchComposerStatusState,
	WorkbenchComposerTurnId,
} from "../contract.js";
import { composerKeyIntent } from "./keys.js";
import { readComposerLink } from "./link.js";

const { ComposerPrimitive } = assistantComposerPrimitives;

const STATUS_CLASSES = {
	idle: "text-muted-foreground",
	pending: "text-primary",
	refused: "text-destructive",
	delivered: "text-status-foreground",
	not_delivered: "text-destructive",
	outcome_unknown: "text-warning",
	unavailable: "text-muted-foreground",
} as const satisfies Record<WorkbenchComposerStatusState, string>;

const INPUT_CLASSES =
	"m-0 w-full resize-none border-0 bg-transparent px-control-inline py-control font-sans !text-control text-foreground outline-none placeholder:text-faint-foreground disabled:cursor-default disabled:opacity-disabled-control";

/** The accessible name says which of the two sends this keystroke performs. */
function inputLabel(link: WorkbenchComposerLink): string {
	if (link.kind !== "executable") return "Message the Codex workhorse (unavailable)";
	return link.turn.kind === "active"
		? "Steer the current Codex turn"
		: "Message the Codex workhorse";
}

function placeholderFor(link: WorkbenchComposerLink): string {
	if (link.kind !== "executable") return link.reason;
	return link.turn.kind === "active"
		? "Add a correction to the running turn."
		: "Ask the workhorse for something.";
}

function StatusLine({ status }: { readonly status: WorkbenchComposerStatus }): ReactNode {
	return (
		<p
			aria-label={status.label}
			className={cn(
				"m-0 border-t border-border-subtle px-control-inline py-compact font-sans text-body",
				STATUS_CLASSES[status.state],
			)}
			data-composer-status={status.state}
			role={status.role}
		>
			{status.message}
			{status.recovery === null ? null : (
				<span className="text-muted-foreground"> {status.recovery}</span>
			)}
		</p>
	);
}

/**
 * The text a command left behind when its delivery could not be established.
 * It is inert on purpose: nothing here resubmits it, because Archboard never
 * retries an unknown mutation. See `lib/draft.ts` for the whole policy.
 */
function RetainedDraft({
	text,
	reason,
	onDismiss,
}: {
	readonly text: string;
	readonly reason: string;
	readonly onDismiss: () => void;
}): ReactNode {
	const labelId = useId();
	return (
		<section
			aria-labelledby={labelId}
			className="border-t border-border bg-warning-subtle px-control-inline py-control"
			data-composer-retained="true"
		>
			<h3 className="m-0 font-sans text-kicker font-semibold text-warning uppercase" id={labelId}>
				Unsent message, outcome unknown
			</h3>
			<p className="m-0 pt-compact font-sans text-body text-foreground">{reason}</p>
			<textarea
				aria-label="Retained message text with an unknown outcome"
				className="mt-control w-full resize-none border border-border bg-surface px-control py-compact font-mono text-technical text-foreground"
				readOnly
				rows={3}
				value={text}
			/>
			<div className="pt-control">
				<Button onClick={onDismiss} tone="quiet" type="button">
					Dismiss this copy
				</Button>
			</div>
		</section>
	);
}

/**
 * Interrupt names the turn that was on screen when the control was rendered.
 * The id travels as a prop so the handler closes over one plain value, and the
 * controller re-reads the authoritative turn before it dispatches, so a turn
 * that ended in between is refused rather than retargeted.
 */
function InterruptButton({
	turnId,
	disabled,
	onInterrupt,
}: {
	readonly turnId: WorkbenchComposerTurnId;
	readonly disabled: boolean;
	readonly onInterrupt: (turnId: WorkbenchComposerTurnId) => Promise<unknown>;
}): ReactNode {
	const handleClick = useCallback(() => {
		void onInterrupt(turnId);
	}, [onInterrupt, turnId]);
	return (
		<Button
			data-composer-interrupt="true"
			disabled={disabled}
			onClick={handleClick}
			tone="secondary"
			type="button"
		>
			Interrupt
		</Button>
	);
}

/**
 * The Archboard-owned text composer for one linked workhorse.
 *
 * `ComposerPrimitive.Root` supplies the form whose submit reaches the runtime,
 * and `ComposerPrimitive.Input` supplies the textarea bound to the composer's
 * own text buffer with `submitMode="none"`, so this module owns the keyboard.
 * Everything else — the send and interrupt controls, the disabled policy, the
 * status region, the retained draft — is Archboard source, and every dispatch
 * goes through the controller so the captured target cannot be swapped.
 */
export function WorkbenchComposer({
	state,
	controller,
	className,
}: WorkbenchComposerProps): ReactNode {
	const formRef = useRef<HTMLFormElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const composingRef = useRef(false);
	const settledRef = useRef(0);
	const composer = useSyncExternalStore(
		controller.subscribe,
		controller.getState,
		controller.getState,
	);
	const link = readComposerLink(state);
	const executable = link.kind === "executable";
	const pending = composer.pending !== null;
	const disabled = !executable || pending;
	const activeTurn: WorkbenchComposerTurnId | null =
		executable && link.turn.kind === "active" ? link.turn.turnId : null;

	/**
	 * Focus returns to the input when a command settles, but only when focus is
	 * still inside this composer — a control the person has since moved to keeps
	 * it. This is what makes a Send button that disables itself mid-flight, and
	 * an Interrupt control that disappears when its turn ends, survivable with a
	 * keyboard alone.
	 */
	useEffect(() => {
		if (composer.settled === settledRef.current) return;
		settledRef.current = composer.settled;
		const form = formRef.current;
		const active = form?.ownerDocument.activeElement ?? null;
		const inside = active === null || active === form?.ownerDocument.body || form?.contains(active);
		if (inside === true) inputRef.current?.focus();
	}, [composer.settled]);

	const submitForm = useCallback(() => {
		formRef.current?.requestSubmit();
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			const intent = composerKeyIntent(
				{
					key: event.key,
					shiftKey: event.shiftKey,
					ctrlKey: event.ctrlKey,
					metaKey: event.metaKey,
					altKey: event.altKey,
					isComposing: event.nativeEvent.isComposing,
				},
				composingRef.current,
			);
			if (intent !== "submit") return;
			event.preventDefault();
			submitForm();
		},
		[submitForm],
	);

	const handleCompositionStart = useCallback((_event: CompositionEvent<HTMLTextAreaElement>) => {
		composingRef.current = true;
	}, []);
	const handleCompositionEnd = useCallback((_event: CompositionEvent<HTMLTextAreaElement>) => {
		composingRef.current = false;
	}, []);

	return (
		<section
			aria-label="Codex workhorse composer"
			className={cn("min-w-0 border-t border-border bg-surface", className)}
			data-workbench-composer={executable ? "executable" : link.kind}
		>
			<ComposerPrimitive.Root
				aria-busy={pending}
				className="m-0 min-w-0 p-0 flex items-end gap-control"
				ref={formRef}
			>
				<ComposerPrimitive.Input
					aria-label={inputLabel(link)}
					className={INPUT_CLASSES}
					disabled={disabled}
					maxRows={12}
					minRows={2}
					onCompositionEnd={handleCompositionEnd}
					onCompositionStart={handleCompositionStart}
					onKeyDown={handleKeyDown}
					placeholder={placeholderFor(link)}
					ref={inputRef}
					submitMode="none"
				/>
				<div className="flex shrink-0 items-center gap-control px-control-inline py-control">
					{activeTurn === null ? null : (
						<InterruptButton
							disabled={pending}
							onInterrupt={controller.interrupt}
							turnId={activeTurn}
						/>
					)}
					<Button
						data-composer-send={executable && activeTurn !== null ? "steer" : "start"}
						disabled={disabled}
						tone="primary"
						type="submit"
					>
						{activeTurn === null ? "Send" : "Steer"}
					</Button>
				</div>
			</ComposerPrimitive.Root>
			<StatusLine status={composer.status} />
			{composer.retained === null ? null : (
				<RetainedDraft
					onDismiss={controller.dismissRetainedDraft}
					reason={composer.retained.reason}
					text={composer.retained.text}
				/>
			)}
		</section>
	);
}

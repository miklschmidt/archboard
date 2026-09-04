import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	useSyncExternalStore,
	type ChangeEvent,
	type CompositionEvent,
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
} from "react";

import { Button } from "../../button/index.js";
import { cn } from "../../ui-classnames/index.js";
import { assistantComposerPrimitives } from "../composer.js";
import type {
	WorkbenchComposerController,
	WorkbenchComposerLink,
	WorkbenchComposerProps,
	WorkbenchComposerRetainedDraft,
	WorkbenchComposerStatusState,
	WorkbenchComposerTurnId,
} from "../contract.js";
import { composerDraftDisposition } from "./draft.js";
import { composerKeyIntent } from "./keys.js";
import { readComposerLink } from "./link.js";
import { REFUSAL_RECOVERIES } from "./vocabulary.js";

const { ComposerPrimitive } = assistantComposerPrimitives;

const COMPOSER_STATUS_LABEL = "Codex composer status";

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
	"m-0 min-h-touch-target w-full resize-none border-0 bg-transparent px-control-inline py-control font-sans !text-control text-foreground outline-none placeholder:text-faint-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-default disabled:opacity-disabled-control";

/** The accessible name says which of the two sends this keystroke performs. */
function inputLabel(turnId: WorkbenchComposerTurnId | null): string {
	return turnId === null ? "Message the Codex workhorse" : "Steer the current Codex turn";
}

function placeholderFor(turnId: WorkbenchComposerTurnId | null): string {
	return turnId === null
		? "Ask the workhorse for something."
		: "Add a correction to the running turn.";
}

function StatusLine({
	state,
	message,
	recovery,
}: {
	readonly state: WorkbenchComposerStatusState;
	readonly message: string;
	readonly recovery: string | null;
}): ReactNode {
	// `output` carries the implicit `status` role the contract names, so the
	// announcement has one owner rather than an element plus a redundant role.
	return (
		<output
			aria-label={COMPOSER_STATUS_LABEL}
			className={cn(
				"m-0 block border-t border-border-subtle px-control-inline py-compact font-sans text-body",
				STATUS_CLASSES[state],
			)}
			data-composer-status={state}
		>
			{message}
			{recovery === null ? null : <span className="text-muted-foreground"> {recovery}</span>}
		</output>
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

/** The retained region, shared by both branches so it has one shape. */
function RetainedRegion({
	retained,
	onDismiss,
}: {
	readonly retained: WorkbenchComposerRetainedDraft | null;
	readonly onDismiss: () => void;
}): ReactNode {
	if (retained === null) return null;
	return <RetainedDraft onDismiss={onDismiss} reason={retained.reason} text={retained.text} />;
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
	readonly onInterrupt: WorkbenchComposerController["interrupt"];
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
 * A workbench that cannot take direct workhorse input offers no input at all:
 * an empty box that refuses every keystroke is worse than one sentence saying
 * why. No reviewed primitive is rendered on this path, so a pane may place the
 * composer outside the runtime's executable branch and still show a person the
 * state and any text a command left behind.
 */
function UnavailableComposer({
	link,
	className,
	retained,
	onDismissRetained,
}: {
	readonly link: Exclude<WorkbenchComposerLink, { readonly kind: "executable" }>;
	readonly className: string | undefined;
	readonly retained: WorkbenchComposerRetainedDraft | null;
	readonly onDismissRetained: () => void;
}): ReactNode {
	return (
		<section
			aria-label="Codex workhorse composer"
			className={cn("min-w-0 border-t border-border bg-surface", className)}
			data-workbench-composer={link.kind}
		>
			<StatusLine
				message={link.reason}
				recovery={
					link.kind === "inspect_only"
						? REFUSAL_RECOVERIES.inspect_only
						: REFUSAL_RECOVERIES.unavailable
				}
				state="unavailable"
			/>
			<RetainedRegion onDismiss={onDismissRetained} retained={retained} />
		</section>
	);
}

/**
 * The Archboard-owned text composer for one linked workhorse.
 *
 * `ComposerPrimitive.Root` is the assigned headless composer primitive: it
 * supplies the form element and the mechanic that focuses the input when a
 * person taps blank composer space, which is what makes the composer usable on
 * a 75-inch display. Its own send is deliberately suppressed — the submit
 * handler prevents the default, which is also how the primitive skips its
 * internal send — because assistant-ui refuses to send while a run is in
 * progress unless its forbidden Queue is enabled, and steering a running turn
 * is exactly what this composer exists to do. Archboard therefore owns the text
 * buffer, the keyboard, the draft policy, the pending policy, and every
 * dispatch; `ComposerPrimitive.Input` is not used, because its buffer and its
 * Enter policy belong to assistant-ui and cannot express a steer.
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
	const [text, setText] = useState("");
	const composer = useSyncExternalStore(
		controller.subscribe,
		controller.getState,
		controller.getState,
	);
	const link = readComposerLink(state);
	const pending = composer.pending !== null;
	const activeTurn: WorkbenchComposerTurnId | null =
		link.kind === "executable" && link.turn.kind === "active" ? link.turn.turnId : null;

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

	/**
	 * One submit funnel for the keyboard and the send control. The draft policy
	 * decides what happens to the text: `restored` leaves it in place, and both
	 * other dispositions clear it — the retained copy, when there is one, is the
	 * controller's, not this buffer's. A person who kept typing while the command
	 * was in flight keeps their newer text.
	 */
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const submitted = text;
			void (async () => {
				const result = await controller.submit({ text: submitted });
				if (composerDraftDisposition(result.outcome) === "restored") return;
				setText((current) => (current === submitted ? "" : current));
			})();
		},
		[controller, text],
	);

	const submitForm = useCallback(() => {
		formRef.current?.requestSubmit();
	}, []);

	const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
		setText(event.target.value);
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

	if (link.kind !== "executable")
		return (
			<UnavailableComposer
				className={className}
				link={link}
				onDismissRetained={controller.dismissRetainedDraft}
				retained={composer.retained}
			/>
		);

	return (
		<section
			aria-label="Codex workhorse composer"
			className={cn("min-w-0 border-t border-border bg-surface", className)}
			data-workbench-composer="executable"
		>
			<ComposerPrimitive.Root
				aria-busy={pending}
				className="m-0 min-w-0 p-0 flex items-end gap-control"
				onSubmit={handleSubmit}
				ref={formRef}
			>
				<textarea
					aria-label={inputLabel(activeTurn)}
					className={INPUT_CLASSES}
					disabled={pending}
					onChange={handleChange}
					onCompositionEnd={handleCompositionEnd}
					onCompositionStart={handleCompositionStart}
					onKeyDown={handleKeyDown}
					placeholder={placeholderFor(activeTurn)}
					ref={inputRef}
					rows={2}
					value={text}
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
						data-composer-send={activeTurn === null ? "start" : "steer"}
						disabled={pending}
						tone="primary"
						type="submit"
					>
						{activeTurn === null ? "Send" : "Steer"}
					</Button>
				</div>
			</ComposerPrimitive.Root>
			<StatusLine
				message={composer.status.message}
				recovery={composer.status.recovery}
				state={composer.status.state}
			/>
			<RetainedRegion onDismiss={controller.dismissRetainedDraft} retained={composer.retained} />
		</section>
	);
}

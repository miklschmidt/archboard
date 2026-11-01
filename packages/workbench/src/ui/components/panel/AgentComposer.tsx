// The composer, at the foot of the conversation: type and press Enter. While a
// turn runs, Enter steers it and Ctrl or Cmd with Enter queues the message to
// run after it; Shift with Enter starts a new line. It grows upward as the
// message grows, taking room from the conversation above it. It says which
// board the agent will read.

import { RiArrowUpLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useRef,
	useSyncExternalStore,
	type ChangeEvent,
	type JSX,
	type KeyboardEvent,
} from "react";

import { usesCommandKey } from "@archboard/ui-kit/components";
import type { DraftStore } from "#ui/state/surfaces/draft-store.ts";

/** Inputs for the composer. */
interface AgentComposerProps {
	readonly draft: DraftStore;
	/** A turn is running: Enter steers it. */
	readonly running: boolean;
	/**
	 * Send the draft.
	 * @param text The message.
	 * @param queue Whether to run it after the current turn.
	 */
	readonly onSend: (text: string, queue: boolean) => void;
}

/**
 * What the empty composer says: who it talks to, about what.
 * @param running Whether a turn is running.
 * @returns The placeholder.
 */
function placeholderOf(running: boolean): string {
	if (running) return `Steer the agent · ${usesCommandKey() ? "⌘" : "Ctrl"}+Enter to queue`;
	return "Ask the agent";
}

/**
 * The composer.
 * @param props The draft and the send action.
 * @returns The composer.
 */
function AgentComposer(props: AgentComposerProps): JSX.Element {
	const { draft, onSend, running } = props;
	const value = useSyncExternalStore(draft.subscribe, draft.get, draft.get);
	const field = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		draft.attach(field.current);
		return () => draft.attach(null);
	}, [draft]);
	const send = useCallback(
		(queue: boolean): void => {
			const text = draft.get().trim();
			if (text === "") return;
			onSend(text, queue && running);
			draft.set("");
		},
		[draft, onSend, running],
	);
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => draft.set(event.target.value),
		[draft],
	);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Escape") {
				event.currentTarget.blur();
				return;
			}
			if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
			event.preventDefault();
			send(event.ctrlKey || event.metaKey);
		},
		[send],
	);
	const handleSend = useCallback(() => send(false), [send]);
	const empty = value.trim() === "";
	return (
		<div data-slot="agent-composer" className="min-w-0 flex-1">
			<div className="border-input bg-background dark:bg-sidebar shadow-well focus-within:border-ring/70 rounded-control flex min-h-9 items-end gap-1 border py-[5px] pr-[5px] pl-3">
				<textarea
					ref={field}
					rows={1}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					aria-label="Message the agent"
					placeholder={placeholderOf(running)}
					className="text-control placeholder:text-muted-foreground [field-sizing:content] max-h-[30vh] min-h-6 min-w-0 flex-1 resize-none bg-transparent py-[3px] font-normal outline-none"
				/>
				<button
					type="button"
					aria-label="Send"
					disabled={empty}
					onClick={handleSend}
					className="primary-finish disabled:text-muted-foreground/60 rounded-control flex size-6 shrink-0 items-center justify-center border active:translate-y-px disabled:border-transparent disabled:bg-transparent disabled:bg-none disabled:shadow-none"
				>
					<RiArrowUpLine aria-hidden="true" className="size-3.5" />
				</button>
			</div>
		</div>
	);
}

export { AgentComposer, type AgentComposerProps };

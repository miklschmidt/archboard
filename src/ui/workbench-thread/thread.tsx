import { MarkdownText } from "@/ui/workbench-thread/markdown-text";
import {
	Reasoning,
	ReasoningContent,
	ReasoningRoot,
	ReasoningText,
	ReasoningTrigger,
} from "@/ui/workbench-thread/reasoning";
import { ToolFallback } from "@/ui/workbench-thread/tool-fallback";
import {
	ToolGroupContent,
	ToolGroupRoot,
	ToolGroupTrigger,
} from "@/ui/workbench-thread/tool-group";
import { TooltipIconButton } from "@/ui/workbench-thread/tooltip-icon-button";
import { Button } from "@/ui/components/button";
import { Skeleton } from "@/ui/components/skeleton";
import { cn } from "@/ui/components/class-names";
import {
	ActionBarMorePrimitive,
	ActionBarPrimitive,
	AuiIf,
	type AssistantState,
	BranchPickerPrimitive,
	ComposerPrimitive,
	ErrorPrimitive,
	groupPartByType,
	MessagePrimitive,
	ThreadPrimitive,
	type ToolCallMessagePartComponent,
	useAui,
	useAuiState,
} from "@assistant-ui/react";
import {
	RiArrowDownLine,
	RiArrowUpLine,
	RiCheckLine,
	RiArrowLeftSLine,
	RiArrowRightSLine,
	RiFileCopyLine,
	RiDownloadLine,
	RiMoreLine,
	RiPencilLine,
	RiRefreshLine,
	RiStopFill,
} from "@remixicon/react";
import {
	createContext,
	useContext,
	type ComponentType,
	type FC,
	type KeyboardEvent,
	type PropsWithChildren,
} from "react";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`.
 */
export type ThreadComponents = {
	AssistantMessage?: ComponentType | undefined;
	Welcome?: ComponentType | undefined;
	/** Archboard: rendered at the start of the composer's action row, before Send. */
	ComposerFooter?: ComponentType | undefined;
	ToolFallback?: ToolCallMessagePartComponent | undefined;
	ToolGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
	ReasoningGroup?: ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined;
};

export type ThreadProps = {
	components?: ThreadComponents | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
	s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
	s.thread.messages.length === 0 &&
	s.thread.isLoading &&
	!s.thread.isDisabled &&
	!s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
	<div
		data-slot="aui_thread-history-skeleton"
		role="status"
		className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
	>
		<span className="sr-only">Loading conversation</span>
		<Skeleton className="ml-auto h-7 w-2/5 rounded-sm motion-reduce:animate-none" />
		<div className="flex flex-col gap-y-2">
			<Skeleton className="h-3 w-11/12 motion-reduce:animate-none" />
			<Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
			<Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
		</div>
		<Skeleton className="ml-auto h-7 w-1/3 rounded-sm motion-reduce:animate-none" />
		<div className="flex flex-col gap-y-2">
			<Skeleton className="h-3 w-10/12 motion-reduce:animate-none" />
			<Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
		</div>
	</div>
);

export const Thread: FC<ThreadProps> = ({ components = EMPTY_COMPONENTS }) => {
	const isEmpty = useAuiState(isNewChatView);

	return (
		<ThreadComponentsContext.Provider value={components}>
			<ThreadRoot isEmpty={isEmpty} />
		</ThreadComponentsContext.Provider>
	);
};

const ThreadRoot: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
	const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);

	return (
		<ThreadPrimitive.Root
			className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
			style={{
				["--thread-max-width" as string]: "none",
				["--composer-bg" as string]: "var(--color-card)",
				["--composer-radius" as string]: "var(--radius-sm)",
				["--composer-padding" as string]: "0px",
			}}
		>
			<ThreadPrimitive.Viewport
				turnAnchor="top"
				data-slot="aui_thread-viewport"
				className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
			>
				<div
					className={cn(
						"mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-3",
						isEmpty && "justify-center",
					)}
				>
					<AuiIf condition={isNewChatView}>
						<Welcome />
					</AuiIf>
					<AuiIf condition={isHistoryLoadingView}>
						<ThreadHistorySkeleton />
					</AuiIf>

					<div
						data-slot="aui_message-group"
						className="divide-border mb-3 flex flex-col divide-y empty:hidden"
					>
						<ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
					</div>

					<ThreadPrimitive.ViewportFooter
						className={cn(
							"aui-thread-viewport-footer bg-background sticky bottom-0 mt-auto flex flex-col gap-2 overflow-visible pb-3",
						)}
					>
						<ThreadScrollToBottom />
						<Composer />
					</ThreadPrimitive.ViewportFooter>
				</div>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
};

const ThreadMessage: FC = () => {
	const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
		useContext(ThreadComponentsContext);
	const role = useAuiState((s) => s.message.role);
	const isEditing = useAuiState((s) => s.message.composer.isEditing);

	if (isEditing) return <EditComposer />;
	if (role === "user") return <UserMessage />;
	return <AssistantMessageComponent />;
};

const ThreadScrollToBottom: FC = () => {
	return (
		<ThreadPrimitive.ScrollToBottom asChild>
			<TooltipIconButton
				tooltip="Scroll to bottom"
				variant="outline"
				className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-9 z-10 size-7 self-center rounded-sm disabled:invisible"
			>
				<RiArrowDownLine />
			</TooltipIconButton>
		</ThreadPrimitive.ScrollToBottom>
	);
};

const ThreadWelcome: FC = () => {
	return (
		<div className="aui-thread-welcome-root my-auto flex flex-col items-center gap-1 px-4 py-6 text-center">
			<h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-title duration-200">
				No turns yet
			</h1>
			<p className="text-body text-muted-foreground">
				Send a message to the linked workhorse, or steer the running turn.
			</p>
		</div>
	);
};

/**
 * Submission through the runtime's own handler, which decides steer, send or
 * queue for a message (`src/ui/workbench-runtime`). The official Send and the
 * input's Enter refuse while a turn runs unless the runtime declares a queue
 * adapter, and that adapter would route a running-turn message around the
 * handler; Archboard submits through the handler in both states and shows
 * Stop beside Send while a turn runs.
 * @returns Whether a message can be sent, the send, and the Enter handler
 *   that submits while a turn runs (the official input handles Enter otherwise).
 */
function useSubmitThroughRuntime(): {
	canSend: boolean;
	send: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
} {
	const aui = useAui();
	const canSend = useAuiState((s) => s.composer.canSend);
	const send = (): void => {
		aui.composer.send();
	};
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
		if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
			return;
		}
		if (!aui.thread.getState().isRunning) {
			return;
		}
		event.preventDefault();
		if (aui.composer.getState().canSend) {
			send();
		}
	};
	return { canSend, send, onKeyDown };
}

const Composer: FC = () => {
	const { onKeyDown } = useSubmitThroughRuntime();
	return (
		<ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
			<div
				data-slot="aui_composer-shell"
				className="border-border focus-within:border-ring flex min-h-[72px] w-full cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color]"
			>
				<ComposerPrimitive.Input
					placeholder="Ask the workhorse or add context…"
					className="aui-composer-input caret-primary placeholder:text-muted-foreground text-control max-h-48 min-h-9 w-full resize-none bg-transparent px-2.5 py-2 font-normal outline-none"
					rows={1}
					enterKeyHint="send"
					aria-label="Message input"
					onKeyDown={onKeyDown}
				/>
				<ComposerAction />
			</div>
		</ComposerPrimitive.Root>
	);
};

const ComposerSend: FC = () => {
	const { canSend, send } = useSubmitThroughRuntime();
	return (
		<TooltipIconButton
			tooltip="Send message"
			side="bottom"
			type="button"
			variant="default"
			size="icon"
			className="aui-composer-send size-7 rounded-sm"
			aria-label="Send message"
			disabled={!canSend}
			onClick={send}
		>
			<RiArrowUpLine className="aui-composer-send-icon size-4" />
		</TooltipIconButton>
	);
};

const ComposerAction: FC = () => {
	const { ComposerFooter } = useContext(ThreadComponentsContext);
	return (
		<div className="aui-composer-action-wrapper border-border relative flex items-center justify-between gap-3 border-t px-2 py-1.5">
			{ComposerFooter ? <ComposerFooter /> : null}
			<div className="ms-auto flex items-center gap-1.5">
				<ComposerSend />
				<AuiIf condition={(s) => s.thread.isRunning}>
					<ComposerPrimitive.Cancel asChild>
						<Button
							type="button"
							variant="default"
							size="icon"
							className="aui-composer-cancel size-7 rounded-sm"
							aria-label="Stop generating"
						>
							<RiStopFill className="aui-composer-cancel-icon size-3.5 fill-current" />
						</Button>
					</ComposerPrimitive.Cancel>
				</AuiIf>
			</div>
		</div>
	);
};

const MessageError: FC = () => {
	return (
		<MessagePrimitive.Error>
			<ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 text-body mt-2 rounded-sm border p-2 dark:text-red-200">
				<ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
			</ErrorPrimitive.Root>
		</MessagePrimitive.Error>
	);
};

const AssistantMessage: FC = () => {
	const {
		ToolFallback: ToolFallbackComponent = ToolFallback,
		ToolGroup,
		ReasoningGroup,
	} = useContext(ThreadComponentsContext);

	const ACTION_BAR_PT = "pt-1.5";
	// Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
	const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

	return (
		<MessagePrimitive.Root
			data-slot="aui_assistant-message-root"
			data-role="assistant"
			className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pt-3 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
		>
			<div
				data-slot="aui_assistant-message-content"
				className="text-foreground text-body px-2 wrap-break-word"
			>
				<MessagePrimitive.GroupedParts
					groupBy={groupPartByType({
						reasoning: ["group-chainOfThought", "group-reasoning"],
						"tool-call": ["group-chainOfThought", "group-tool"],
						"standalone-tool-call": [],
					})}
				>
					{({ part, children }) => {
						switch (part.type) {
							case "group-chainOfThought":
								return <div data-slot="aui_chain-of-thought">{children}</div>;
							case "group-tool":
								if (ToolGroup) {
									return <ToolGroup group={part}>{children}</ToolGroup>;
								}
								return (
									<ToolGroupRoot variant="ghost">
										<ToolGroupTrigger
											count={part.indices.length}
											active={part.status.type === "running"}
										/>
										<ToolGroupContent>{children}</ToolGroupContent>
									</ToolGroupRoot>
								);
							case "group-reasoning": {
								if (ReasoningGroup) {
									return <ReasoningGroup group={part}>{children}</ReasoningGroup>;
								}
								const running = part.status.type === "running";
								return (
									<ReasoningRoot streaming={running}>
										<ReasoningTrigger active={running} />
										<ReasoningContent aria-busy={running}>
											<ReasoningText>{children}</ReasoningText>
										</ReasoningContent>
									</ReasoningRoot>
								);
							}
							case "text":
								return <MarkdownText />;
							case "reasoning":
								return <Reasoning {...part} />;
							case "tool-call":
								return part.toolUI ?? <ToolFallbackComponent {...part} />;
							case "data":
								return part.dataRendererUI;
							case "indicator":
								return (
									<span
										data-slot="aui_assistant-message-indicator"
										className="text-status animate-pulse font-sans"
										aria-label="Assistant is working"
									>
										{"●"}
									</span>
								);
							default:
								return null;
						}
					}}
				</MessagePrimitive.GroupedParts>
				<MessageError />
			</div>

			<div
				data-slot="aui_assistant-message-footer"
				className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
			>
				<BranchPicker />
				<AssistantActionBar />
			</div>
		</MessagePrimitive.Root>
	);
};

const AssistantActionBar: FC = () => {
	return (
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
		>
			<ActionBarPrimitive.Copy asChild>
				<TooltipIconButton tooltip="Copy">
					<AuiIf condition={(s) => s.message.isCopied}>
						<RiCheckLine className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
					</AuiIf>
					<AuiIf condition={(s) => !s.message.isCopied}>
						<RiFileCopyLine className="animate-in zoom-in-75 fade-in duration-150" />
					</AuiIf>
				</TooltipIconButton>
			</ActionBarPrimitive.Copy>
			<ActionBarPrimitive.Reload asChild>
				<TooltipIconButton tooltip="Refresh">
					<RiRefreshLine />
				</TooltipIconButton>
			</ActionBarPrimitive.Reload>
			<ActionBarMorePrimitive.Root>
				<ActionBarMorePrimitive.Trigger asChild>
					<TooltipIconButton tooltip="More" className="data-[state=open]:bg-accent">
						<RiMoreLine />
					</TooltipIconButton>
				</ActionBarMorePrimitive.Trigger>
				<ActionBarMorePrimitive.Content
					side="bottom"
					align="start"
					sideOffset={6}
					className="aui-action-bar-more-content bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1"
				>
					<ActionBarPrimitive.ExportMarkdown asChild>
						<ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-control flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 font-normal outline-none select-none">
							<RiDownloadLine className="size-4" />
							Export as Markdown
						</ActionBarMorePrimitive.Item>
					</ActionBarPrimitive.ExportMarkdown>
				</ActionBarMorePrimitive.Content>
			</ActionBarMorePrimitive.Root>
		</ActionBarPrimitive.Root>
	);
};

const UserMessage: FC = () => {
	return (
		<MessagePrimitive.Root
			data-slot="aui_user-message-root"
			className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
			data-role="user"
		>
			<div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
				<div className="aui-user-message-content peer bg-muted text-foreground text-body rounded-sm px-2.5 py-1.5 wrap-break-word empty:hidden">
					<MessagePrimitive.Parts />
				</div>
				<div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
					<UserActionBar />
				</div>
			</div>

			<BranchPicker
				data-slot="aui_user-branch-picker"
				className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
			/>
		</MessagePrimitive.Root>
	);
};

const UserActionBar: FC = () => {
	return (
		<ActionBarPrimitive.Root
			hideWhenRunning
			autohide="not-last"
			className="aui-user-action-bar-root flex flex-col items-end"
		>
			<ActionBarPrimitive.Edit asChild>
				<TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
					<RiPencilLine />
				</TooltipIconButton>
			</ActionBarPrimitive.Edit>
		</ActionBarPrimitive.Root>
	);
};

const EditComposer: FC = () => {
	return (
		<MessagePrimitive.Root
			data-slot="aui_edit-composer-wrapper"
			className="flex flex-col px-2 py-3 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
		>
			<ComposerPrimitive.Root className="aui-edit-composer-root border-border focus-within:border-ring ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg)">
				{/* The person just chose Edit on this message: moving focus into the
				    editor is the expected outcome, not a page-load focus steal. */}
				{/* oxlint-disable jsx-a11y/no-autofocus */}
				<ComposerPrimitive.Input
					className="aui-edit-composer-input text-foreground text-control min-h-12 w-full resize-none bg-transparent px-2.5 pt-2 pb-1 font-normal outline-none"
					autoFocus
				/>
				{/* oxlint-enable jsx-a11y/no-autofocus */}
				<div className="aui-edit-composer-footer mx-2 mb-2 flex items-center gap-1.5 self-end">
					<ComposerPrimitive.Cancel asChild>
						<Button variant="ghost" size="sm" className="rounded-sm">
							Cancel
						</Button>
					</ComposerPrimitive.Cancel>
					<ComposerPrimitive.Send asChild>
						<Button size="sm" className="rounded-sm">
							Update
						</Button>
					</ComposerPrimitive.Send>
				</div>
			</ComposerPrimitive.Root>
		</MessagePrimitive.Root>
	);
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
	return (
		<BranchPickerPrimitive.Root
			hideWhenSingleBranch
			className={cn(
				"aui-branch-picker-root text-muted-foreground text-technical -ms-2 me-2 inline-flex items-center font-mono",
				className,
			)}
			{...rest}
		>
			<BranchPickerPrimitive.Previous asChild>
				<TooltipIconButton tooltip="Previous">
					<RiArrowLeftSLine />
				</TooltipIconButton>
			</BranchPickerPrimitive.Previous>
			<span className="aui-branch-picker-state font-medium">
				<BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
			</span>
			<BranchPickerPrimitive.Next asChild>
				<TooltipIconButton tooltip="Next">
					<RiArrowRightSLine />
				</TooltipIconButton>
			</BranchPickerPrimitive.Next>
		</BranchPickerPrimitive.Root>
	);
};

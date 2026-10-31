import { useCallback, useContext } from "react";
import { useRouter } from "@tanstack/react-router";
import { ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";
import type { JSX, ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { RiRefreshLine } from "@remixicon/react";
import { Button } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import {
	PaneHeaderRow,
	PaneHeaderStart,
	PaneHeaderEnd,
} from "#ui/components/semantic-board-canvas/PaneHeaderFrame.tsx";

interface ModelErrorProps {
	/** Lay the error over a kept picture, which it never moves. */
	compact?: boolean;
	title?: string;
	code: string;
	message: string;
	diagnostics?: Extract<ArchitectureModelRead, { success: false }>["diagnostics"];
	/** What the reader can do about it. */
	children?: ReactNode;
}

/**
 * Keep the server's diagnostic and recovery instruction together.
 * @param props The refusal and its optional domain diagnostics.
 * @returns A recoverable error beside the header's Refresh action.
 */
function ModelError(props: ModelErrorProps): JSX.Element {
	const diagnostics = new Map(props.diagnostics?.map((entry) => [JSON.stringify(entry), entry]));
	return (
		<div
			role="alert"
			data-slot="model-error"
			data-code={props.code}
			className={
				props.compact
					? "text-body border-border bg-background max-h-40 shrink-0 space-y-2 overflow-auto border-b px-4 py-3"
					: "text-body max-w-prose space-y-4 p-10"
			}
		>
			<h3 className="text-title font-semibold">{props.title ?? "Architecture unavailable"}</h3>
			<p>{props.message}</p>
			{[...diagnostics].map(([key, diagnostic]) => (
				<div key={key} className="space-y-1">
					{diagnostic.file && <code className="text-control break-all">{diagnostic.file}</code>}
					<p>{diagnostic.message}</p>
					<p className="text-muted-foreground">{diagnostic.recovery}</p>
				</div>
			))}
			{props.children}
		</div>
	);
}

/**
 * What a reader can do about a failure. Back is the browser's, so a reading opened
 * directly has none.
 * @param props The recovery actions.
 * @param props.onRetry Try the failed step again.
 * @param props.onPlain Show the state alone, when a comparison can be what failed.
 * @returns The actions.
 */
function ModelFailureActions(props: {
	onRetry: () => void;
	onPlain?: (() => void) | undefined;
}): JSX.Element {
	const { history } = useRouter();
	const back = useCallback((): void => history.back(), [history]);
	return (
		<div className="flex items-center gap-2">
			<Button size="sm" data-slot="model-retry" onClick={props.onRetry}>
				Retry
			</Button>
			{history.canGoBack() && (
				<Button variant="outline" size="sm" data-slot="model-back" onClick={back}>
					Back
				</Button>
			)}
			{props.onPlain !== undefined && (
				<Button variant="outline" size="sm" data-slot="model-show-plain" onClick={props.onPlain}>
					No comparison
				</Button>
			)}
		</div>
	);
}

interface ModelHeaderProps {
	name: string;
	/** Read again, offered only where the live feed cannot recover by itself. */
	refresh?: (() => void) | undefined;
	refreshing?: boolean | undefined;
	children?: ReactNode;
}

/**
 * The model uses the same header frame and pane controls as a board.
 * @param props The model name and explicit read action.
 * @returns The pane header.
 */
function ModelHeader(props: ModelHeaderProps): JSX.Element {
	const { controls } = usePaneChrome();
	const pane = useContext(ModelPaneContext);
	return (
		<PaneHeaderRow>
			<PaneHeaderStart>
				{/* A reading that can speak for itself says so here, in place of the name. */}
				<h2 className="text-control truncate font-[650] [&:has(+:not(:empty))]:hidden">
					{props.name}
				</h2>
				<div
					ref={pane?.attachHead}
					data-slot="model-head"
					className="flex min-w-0 flex-1 items-center gap-3"
				/>
				{props.children}
			</PaneHeaderStart>
			<PaneHeaderEnd>
				{props.refresh !== undefined && (
					<Button
						variant="ghost"
						size="sm"
						data-slot="model-refresh"
						onClick={props.refresh}
						disabled={props.refreshing}
						aria-busy={props.refreshing}
					>
						<RiRefreshLine aria-hidden="true" className="size-4" />
						Refresh
					</Button>
				)}
				{controls}
			</PaneHeaderEnd>
		</PaneHeaderRow>
	);
}

export { ModelHeader, ModelError, ModelFailureActions, type ModelErrorProps };

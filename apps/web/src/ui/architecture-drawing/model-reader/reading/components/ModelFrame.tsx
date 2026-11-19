import { useCallback, useContext } from "react";
import { useRouter } from "@tanstack/react-router";
import {
	ModelPaneContext,
	ModelWalkthroughContext,
} from "#ui/architecture-drawing/model-reader/state/presentation.ts";
import type { JSX, ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { RiRefreshLine } from "@remixicon/react";
import { Button, cn } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";
import { namesDiagnosticFile } from "#ui/architecture-drawing/model-reader/reading/rules/reading-freshness.ts";
import {
	PaneHeaderRow,
	PaneHeaderStart,
	PaneHeaderEnd,
} from "#ui/architecture-drawing/canvas/presentation/components/PaneHeaderFrame.tsx";

interface ModelErrorProps {
	/** Lay the error over a kept picture as a floating card, which never moves it. */
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
					? "text-body bg-popover text-popover-foreground rounded-table shadow-float m-2 max-h-60 max-w-xl shrink-0 space-y-2 self-start overflow-auto border p-4"
					: "text-body max-w-prose space-y-4 p-10"
			}
		>
			<h3 className="text-title font-semibold">{props.title ?? "Architecture unavailable"}</h3>
			<p>{props.message}</p>
			{[...diagnostics].map(([key, diagnostic]) => (
				<div key={key} className="space-y-1">
					{namesDiagnosticFile(diagnostic.file) && (
						<code className="text-control break-all">{diagnostic.file}</code>
					)}
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
 * The model uses the same header frame and pane controls as a legacy board. The row parts where
 * the picture meets the right panel: what stands over the picture says where the reader is and
 * what they read, and what stands over the panel, as wide as the panel, holds the way to read it
 * and the pane's own controls. The panel is `min(360px, 46%)` of the reading, which is as wide as
 * this row. Container queries measure its content box, which excludes the row's 1.5rem padding.
 * Only a mounted panel reserves space, and a narrow panel reserves it only during selection.
 * @param props The model name and explicit read action.
 * @returns The pane header.
 */
function ModelHeader(props: ModelHeaderProps): JSX.Element {
	const { controls } = usePaneChrome();
	const pane = useContext(ModelPaneContext);
	const presenting = useContext(ModelWalkthroughContext)?.active === true;
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
			<div
				data-slot="model-head-side"
				className={cn(
					"flex h-full shrink-0 items-center gap-2",
					!presenting && [
						"[[data-slot=architecture-model-stage]:has([data-slot=model-panel][data-selected])_&]:w-[calc(min(360px,46cqw+0.69rem)-0.5rem)]",
						"[[data-slot=architecture-model-stage]:has([data-slot=model-panel][data-selected])_&]:pl-4",
						"@min-[calc(900px-1.5rem)]/pane-header:[[data-slot=architecture-model-stage]:has([data-slot=model-panel])_&]:w-[calc(360px-0.5rem)]",
						"@min-[calc(900px-1.5rem)]/pane-header:[[data-slot=architecture-model-stage]:has([data-slot=model-panel])_&]:pl-4",
					],
				)}
			>
				<div ref={pane?.attachSide} data-slot="model-side" className="flex min-w-0 items-center" />
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
			</div>
		</PaneHeaderRow>
	);
}

export { ModelHeader, ModelError, ModelFailureActions, type ModelErrorProps };

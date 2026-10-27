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
	compact?: boolean;
	code: string;
	message: string;
	diagnostics?: Extract<ArchitectureModelRead, { success: false }>["diagnostics"];
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
					? "text-body border-border max-h-40 shrink-0 space-y-2 overflow-auto border-b px-4 py-3"
					: "text-body max-w-prose space-y-4 p-10"
			}
		>
			<h3 className="text-title font-semibold">Architecture unavailable</h3>
			<p>{props.message}</p>
			{[...diagnostics].map(([key, diagnostic]) => (
				<div key={key} className="space-y-1">
					{diagnostic.file && <code className="text-control break-all">{diagnostic.file}</code>}
					<p>{diagnostic.message}</p>
					<p className="text-muted-foreground">{diagnostic.recovery}</p>
				</div>
			))}
		</div>
	);
}

interface ModelHeaderProps {
	name: string;
	refresh: () => void;
	refreshing: boolean;
	children: ReactNode;
}

/**
 * The model uses the same header frame and pane controls as a board.
 * @param props The model name and explicit read action.
 * @returns The pane header.
 */
function ModelHeader(props: ModelHeaderProps): JSX.Element {
	const { controls } = usePaneChrome();
	return (
		<PaneHeaderRow>
			<PaneHeaderStart>
				<h2 className="text-control truncate font-semibold">{props.name}</h2>
				{props.children}
			</PaneHeaderStart>
			<PaneHeaderEnd>
				<Button
					variant="ghost"
					size="sm"
					data-slot="model-refresh"
					onClick={props.refresh}
					disabled={props.refreshing}
				>
					<RiRefreshLine aria-hidden="true" className="size-4" />
					{props.refreshing ? "Reading…" : "Refresh"}
				</Button>
				{controls}
			</PaneHeaderEnd>
		</PaneHeaderRow>
	);
}

export { ModelHeader, ModelError, type ModelErrorProps };

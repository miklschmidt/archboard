import type { JSX, ReactNode } from "react";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";

interface HeaderPartProps {
	children: ReactNode;
}

/**
 * Every pane shares one header frame and the shell's notices.
 * @param props The contents of the header row.
 * @returns The header followed by its pane notice.
 */
function PaneHeaderRow(props: HeaderPartProps): JSX.Element {
	const { notice } = usePaneChrome();
	return (
		<>
			<header
				data-slot="pane-header"
				className="bg-sidebar h-chrome shadow-edge-down after:bg-border @container/pane-header relative z-30 flex shrink-0 items-center pr-2 pl-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px in-data-presenting:hidden"
			>
				{props.children}
			</header>
			{notice}
		</>
	);
}

/**
 * The pane letter precedes the current reading's name or breadcrumb.
 * @param props The reading identity.
 * @returns The start of the header row.
 */
function PaneHeaderStart(props: HeaderPartProps): JSX.Element {
	const { letter } = usePaneChrome();
	return (
		<div className="mr-5 flex min-w-0 shrink items-center gap-3">
			{letter}
			{props.children}
		</div>
	);
}

/**
 * Actions share the end of the header row.
 * @param props The reading and shell controls.
 * @returns The end of the header row.
 */
function PaneHeaderEnd(props: HeaderPartProps): JSX.Element {
	return <div className="ml-auto flex h-full shrink-0 items-center gap-2">{props.children}</div>;
}

export { PaneHeaderRow, PaneHeaderStart, PaneHeaderEnd };

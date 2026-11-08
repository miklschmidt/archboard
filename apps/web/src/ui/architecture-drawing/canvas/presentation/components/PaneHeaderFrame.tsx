import type { JSX, ReactNode } from "react";
import { usePaneChrome } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-chrome.ts";

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
				className="bg-sidebar h-chrome @container/pane-header relative z-30 flex shrink-0 items-center pr-2 pl-4 in-data-presenting:hidden"
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
		<div className="mr-3 flex min-w-0 flex-1 items-center gap-3">
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

// The one control that shows and hides a pane's sidebar. It is in the pane's
// header, beside the shell's controls for the pane, because the sidebar is the
// pane's and the header is where the pane's controls are: there is no rail, no
// bar left at the edge, and nothing else that opens it. Its mark is filled while
// the panel is shown. Its name stays, and says what it is, as a disclosure's
// does; what pressing it will do is in its tooltip. While a presented walkthrough
// has the sidebar stepped aside the control stays where it is, held, and says so.

import { RiLayoutRightFill, RiLayoutRightLine } from "@remixicon/react";
import type { JSX } from "react";

import { IconButton } from "@archboard/ui-kit/components";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";

/** Why the control does nothing while a walkthrough is presented. */
const STEPPED_ASIDE = "The sidebar steps aside while a walkthrough is presented.";

/**
 * The control that shows and hides the sidebar.
 * @param props The sidebar.
 * @param props.sidebar Its state and controls.
 * @returns The control.
 */
function SidebarToggle(props: { readonly sidebar: Sidebar }): JSX.Element {
	const { sidebar } = props;
	return (
		<IconButton
			id={sidebar.toggleId}
			slot="semantic-sidebar-toggle"
			label="Sidebar"
			tip={sidebar.shown ? "Hide the sidebar" : "Show the sidebar"}
			held={sidebar.steppedAside ? STEPPED_ASIDE : null}
			expanded={sidebar.shown}
			controls={sidebar.shown ? sidebar.panelId : undefined}
			onClick={sidebar.toggle}
		>
			{sidebar.shown ? <RiLayoutRightFill /> : <RiLayoutRightLine />}
		</IconButton>
	);
}

export { SidebarToggle };

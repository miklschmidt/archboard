import { columnMs } from "@archboard/timing";

/**
 * Put the durations of a popover on the root element. A select or a menu stands in a portal, outside
 * the shell root, and the kit that draws it reads no timing, so only the root reaches both.
 * @param root The root element of the page.
 */
function applyShellDurations(root: HTMLElement): void {
	root.style.setProperty("--popover-in-ms", `${columnMs("popoverIn")}ms`);
	root.style.setProperty("--popover-out-ms", `${columnMs("popoverOut")}ms`);
}

export { applyShellDurations };

// Which way the model a part opens lies from the model it is drawn on, read
// from the part's kind, which is the level of the model it opens, against the
// level of the model drawn, in the vault's order of levels (ADR 0029). The
// renderer core reads the same way when it marks a card that opens a model
// (`crates/archboard-render/src/appearance.rs`, `drill_direction`), and a
// pane says it in words beside the card.

/** Which way the model a part opens lies: coarser, finer, level, or not known. */
type DrillDirection = "up" | "down" | "across" | "elsewhere";

/**
 * Which way the model a part opens lies.
 * @param kind The part's kind, which is the level of the model it opens.
 * @param here The level of the model it is drawn on, when the caller said.
 * @param levels The vault's levels, coarsest first.
 * @returns The direction, or `elsewhere` when either level is not one the vault lists.
 */
function drillDirection(
	kind: string,
	here: string | undefined,
	levels: readonly string[],
): DrillDirection {
	const there = levels.indexOf(kind);
	const at = here === undefined ? -1 : levels.indexOf(here);
	if (there < 0 || at < 0) {
		return "elsewhere";
	}
	if (there === at) {
		return "across";
	}
	return there < at ? "up" : "down";
}

export { drillDirection };

/** Browser legends inherit the same comparison colors used by exported diagrams. */
const STANDING_COLORS = {
	added: "var(--standing-added)",
	changed: "var(--standing-changed)",
	removed: "var(--standing-removed)",
	selected: "var(--diagram-selection)",
} as const;

export { STANDING_COLORS };

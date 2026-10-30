/** How wide the right panel of a reading is. */
const PANEL_WIDTH = 360;

/** How much of a narrow pane the panel can cover, so that half of the picture stays. */
const PANEL_SHARE = 0.46;

/** The panel's width in a stylesheet, which the picture's area can narrow. */
const PANEL_CSS_WIDTH = `min(${PANEL_WIDTH}px, ${PANEL_SHARE * 100}%)`;

/**
 * How wide the panel is in a picture's area.
 * @param area The area's width.
 * @returns The panel's width.
 */
function panelWidth(area: number): number {
	return Math.min(PANEL_WIDTH, area * PANEL_SHARE);
}

export { PANEL_CSS_WIDTH, panelWidth };

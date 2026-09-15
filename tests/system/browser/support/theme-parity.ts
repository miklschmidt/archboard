import { expect } from "bun:test";
import { readThemeColors, themeColor } from "@/shared/theme/server";
import { PaletteColorSchema } from "@/shared/semantic-policy/index";
import type { AgentBrowserSession } from "./agent-browser.ts";

/**
 * Verify the built shell consumes the same theme definitions as standalone SVGs.
 * Normalize through the export converter: browsers may gamut-map saturated OKLCH
 * differently, and matching those upstream conversion algorithms is not our contract.
 * @param browser The running shell browser.
 */
async function assertThemeParity(browser: AgentBrowserSession): Promise<void> {
	const tokens = [
		"--background",
		"--card",
		"--border",
		"--muted-foreground",
		"--standing-added",
		"--standing-changed",
		"--standing-removed",
		"--diagram-selection",
		"--diagram-edge",
		...PaletteColorSchema.options.map((name) => `--semantic-${name}`),
	];
	const css = await browser.eval<string>(`(() => {
		const tokens = ${JSON.stringify(tokens)};
		const root = document.documentElement;
		const original = root.getAttribute("data-theme");
		try {
			return ["light", "dark"].map(theme => {
				root.setAttribute("data-theme", theme);
				const style = getComputedStyle(root);
				const declarations = tokens.map(token => token + ": " + style.getPropertyValue(token) + ";");
				const selector = theme === "light" ? ":root" : ':root[data-theme="dark"]';
				return selector + " { " + declarations.join(" ") + " }";
			}).join("\\n");
		} finally {
			if (original === null) root.removeAttribute("data-theme");
			else root.setAttribute("data-theme", original);
		}
	})()`);
	const shell = readThemeColors(css);
	for (const theme of ["light", "dark"] as const) {
		for (const token of tokens) expect(shell[theme][token]).toBe(themeColor(theme, token));
	}
}

export { assertThemeParity };

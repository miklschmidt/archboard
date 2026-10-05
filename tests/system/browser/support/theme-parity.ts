import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { readThemeColors } from "@/shared/theme/server";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** Every colour of both themes, as a standalone picture is drawn in them. */
const THEME = readThemeColors(
	readFileSync(new URL("../../../../src/shared/theme/theme.css", import.meta.url), "utf8"),
);

/**
 * Verify the built page paints with the colours a standalone picture is drawn
 * in: every colour theme.css sets, in both themes, with nothing laid over them.
 * Normalize through the export converter: browsers may gamut-map saturated OKLCH
 * differently, and matching those upstream conversion algorithms is not our contract.
 * @param browser The running shell browser.
 */
async function assertThemeParity(browser: AgentBrowserSession): Promise<void> {
	const tokens = Object.keys(THEME.dark);
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
	expect(readThemeColors(css)).toEqual(THEME);
}

export { assertThemeParity };

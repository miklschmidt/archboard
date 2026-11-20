import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { transform } from "lightningcss";
import type { AgentBrowserSession } from "./agent-browser.ts";

/** Each theme's tokens, by custom property name. */
type ThemeTokens = Record<"light" | "dark", Record<string, string>>;

/**
 * The tokens a stylesheet sets in each theme, every value as Lightning CSS prints it minified, so
 * two spellings of one colour read the same. The dark theme inherits each token it leaves to the
 * light one.
 * @param css The stylesheet: `:root` for the light theme, `:root[data-theme=dark]` for the dark.
 * @returns The tokens of each theme.
 */
function tokensOf(css: string): ThemeTokens {
	const printed = transform({ filename: "theme.css", code: Buffer.from(css), minify: true });
	const light: Record<string, string> = {};
	const dark: Record<string, string> = {};
	for (const [, selector = "", body = ""] of printed.code
		.toString()
		.matchAll(/([^{}]+)\{([^}]*)\}/gu)) {
		const tokens = selector.includes("dark") ? dark : light;
		for (const declaration of body.split(";")) {
			const colon = declaration.indexOf(":");
			if (colon > 0)
				tokens[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
		}
	}
	return { light, dark: { ...light, ...dark } };
}

/** The tokens of both themes as the shared stylesheet sets them. */
const EXPECTED = tokensOf(
	readFileSync(Bun.resolveSync("@archboard/renderer/theme.css", import.meta.dir), "utf8"),
);

/**
 * Verify the built page's theme tokens are the shared stylesheet's, in both themes, with nothing
 * laid over them: every token the stylesheet sets reads the same, and not empty, on the running
 * shell. The pictures' side is the renderer's own theme test, which holds every token a
 * standalone picture names to the stylesheet's colour in each theme.
 * @param browser The running shell browser.
 */
async function assertThemeParity(browser: AgentBrowserSession): Promise<void> {
	const tokens = Object.keys(EXPECTED.dark);
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
	const shown = tokensOf(css);
	for (const theme of ["light", "dark"] as const) {
		for (const [token, value] of Object.entries(EXPECTED[theme])) {
			expect(shown[theme][token] ?? "", `${theme} ${token}`).not.toBe("");
			expect(shown[theme][token], `${theme} ${token}`).toBe(value);
		}
	}
}

export { assertThemeParity };

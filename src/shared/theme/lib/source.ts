import { readFileSync } from "node:fs";
import type { DiagramTheme } from "@/shared/semantic-board/index";
import { readThemeColors } from "@/shared/theme/lib/read";

const colors = readThemeColors(readFileSync(new URL("../theme.css", import.meta.url), "utf8"));

/**
 * Resolve a shared token without a browser, stylesheet build or external resource.
 * @param theme The requested SVG theme.
 * @param name The CSS color custom property used by the matching shell surface.
 * @returns A literal sRGB color suitable for a standalone SVG.
 */
function themeColor(theme: DiagramTheme, name: string): string {
	const color = colors[theme][name];
	if (color === undefined)
		throw new Error(
			`Missing ${theme} theme color ${name}. Define it in src/shared/theme/theme.css.`,
		);
	return color;
}

export { themeColor };

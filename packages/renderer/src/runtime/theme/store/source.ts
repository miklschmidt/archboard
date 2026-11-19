import { readFileSync } from "node:fs";
import type { DiagramTheme } from "@archboard/model/render-reply";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/theme/store/read.ts";
import type { ThemeColors } from "#shared/protocol/generated/core/types.ts";

/**
 * The colours of both themes that a stylesheet sets, each resolved for a standalone picture.
 * @param stylesheet The stylesheet's text; the shared stylesheet the shell and the pictures
 *   are painted with when none is given.
 * @returns The colours, by theme and custom property.
 */
function themeColors(stylesheet: string = readFileSync(THEME_STYLESHEET, "utf8")): ThemeColors {
	return readThemeColors(stylesheet);
}

const colors = themeColors();

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
			`Missing ${theme} theme color ${name}. Define it in packages/renderer/assets/theme.css.`,
		);
	return color;
}

export { themeColor, themeColors };

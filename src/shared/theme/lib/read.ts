import { transform, type Selector, type StyleRule, type Declaration } from "lightningcss";
import type { DiagramTheme } from "@/shared/semantic-board/index";
import { exportColor } from "@/shared/theme/lib/colors";

/** Only color declarations live in the shared stylesheet. */
type ThemeColors = Readonly<Record<DiagramTheme, Readonly<Record<string, string>>>>;

/**
 * Recognize the shared stylesheet's base selector.
 * @param part One parsed selector component.
 * @returns Whether it selects the document root.
 */
function isRoot(part: Selector[number] | undefined): boolean {
	return part?.type === "pseudo-class" && part.kind === "root";
}

/**
 * Recognize the explicit dark-theme attribute used by the shell.
 * @param part One parsed selector component.
 * @returns Whether it selects the dark theme.
 */
function isDark(part: Selector[number] | undefined): boolean {
	if (part?.type !== "attribute" || part.name !== "data-theme") return false;
	return part.operation?.operator === "equal" && part.operation.value === "dark";
}

/**
 * The source supports two explicit theme blocks, without a browser CSS cascade.
 * @param selectors The parsed selectors on a style rule.
 * @returns The theme these declarations define.
 */
function themeOf(selectors: StyleRule["selectors"]): DiagramTheme {
	const selector = selectors[0]!;
	if (selectors.length !== 1 || !isRoot(selector[0]))
		throw new Error('Shared theme.css supports only :root and :root[data-theme="dark"].');
	if (selector.length === 1) return "light";
	if (selector.length === 2 && isDark(selector[1])) return "dark";
	throw new Error('Shared theme.css supports only :root and :root[data-theme="dark"].');
}

/**
 * Refuse declarations that would need a browser to resolve before export.
 * @param declaration One custom property from the shared stylesheet.
 * @returns Its name and portable color.
 */
function readColor(declaration: Declaration): [string, string] {
	if (declaration.property !== "custom")
		throw new Error("Shared theme.css accepts color custom properties only.");
	const { name, value } = declaration.value;
	const component = value[0];
	if (value.length !== 1 || component?.type !== "color")
		throw new Error(`Theme token ${name} must contain a literal CSS color.`);
	return [name, exportColor(component.value)];
}

/**
 * Parse our explicit theme declarations and resolve each literal color for SVG export.
 * @param css Shared CSS color declarations.
 * @returns Light colors and dark colors inheriting any unchanged root declarations.
 */
function readThemeColors(css: string): ThemeColors {
	const light: Record<string, string> = {};
	const dark: Record<string, string> = {};
	transform({
		filename: "theme.css",
		code: Buffer.from(css),
		visitor: {
			/**
			 * Collect only unconditional color blocks; reject unsupported cascade rules.
			 * @param rule A parsed CSS rule.
			 */
			Rule(rule) {
				if (rule.type !== "style")
					throw new Error("Shared theme.css accepts theme color blocks only.");
				if (rule.value.rules.length > 0 || rule.value.declarations.importantDeclarations.length > 0)
					throw new Error(
						"Shared theme.css does not accept nested rules or !important declarations.",
					);
				const destination = themeOf(rule.value.selectors) === "light" ? light : dark;
				Object.assign(
					destination,
					Object.fromEntries(rule.value.declarations.declarations.map(readColor)),
				);
			},
		},
	});
	return { light, dark: { ...light, ...dark } };
}

export { readThemeColors, type ThemeColors };

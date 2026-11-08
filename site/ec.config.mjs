// How every code block of the docs looks: Expressive Code with a theme made of the site's own
// palette. Commands and code sit on the code bed, a marked line takes the 2px inset edge that
// DESIGN.md allows a code view, and added and removed lines keep the product's green and red.
// The `<Code>` component of the reference pages reads this file too.
import { defineEcConfig } from "astro-expressive-code";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

const ink = "#f2f0ea";
const body = "#d3cfc6";
const muted = "#bdb8ad";
const faint = "#8f897d";
const violet = "#c4b2f2";
const sky = "#8fd0f5";
const parchment = "#e8d9b0";
const teal = "#86dbc8";

/** The site's code colours as a TextMate theme. */
const archboardNight = {
	name: "archboard-night",
	type: "dark",
	colors: {
		"editor.background": "#16140f",
		"editor.foreground": ink,
		"editor.selectionBackground": "#e6b84a40",
		"editorLineNumber.foreground": faint,
		"editorLineNumber.activeForeground": muted,
	},
	tokenColors: [
		{ settings: { foreground: ink } },
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: { foreground: muted, fontStyle: "italic" },
		},
		{
			scope: [
				"keyword",
				"storage",
				"storage.type",
				"keyword.control",
				"keyword.operator.new",
				"keyword.operator.expression",
			],
			settings: { foreground: violet },
		},
		{
			scope: ["string", "string.quoted", "string.template", "markup.inline.raw"],
			settings: { foreground: parchment },
		},
		{
			scope: [
				"support.type.property-name",
				"meta.object-literal.key",
				"entity.name.tag.yaml",
				"variable.other.property",
				"entity.other.attribute-name",
			],
			settings: { foreground: sky },
		},
		{
			scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"],
			settings: { foreground: teal },
		},
		{
			scope: ["entity.name.function", "support.function", "meta.function-call"],
			settings: { foreground: ink },
		},
		{
			scope: ["entity.name.type", "support.type", "support.class", "entity.name.class"],
			settings: { foreground: ink, fontStyle: "" },
		},
		{
			scope: ["variable.parameter", "variable.other.readwrite", "variable"],
			settings: { foreground: body },
		},
		{
			scope: ["punctuation", "meta.brace", "keyword.operator"],
			settings: { foreground: muted },
		},
		{
			scope: ["variable.parameter.shell", "constant.other.option", "source.shell constant.other"],
			settings: { foreground: sky },
		},
		{
			scope: ["entity.name.command", "support.function.builtin.shell"],
			settings: { foreground: ink },
		},
		{ scope: ["string.unquoted.argument.shell"], settings: { foreground: body } },
		{ scope: ["markup.inserted"], settings: { foreground: "#7fe0a0" } },
		{ scope: ["markup.deleted"], settings: { foreground: "#f39a8c" } },
	],
};

export default defineEcConfig({
	themes: [archboardNight],
	plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
	defaultProps: {
		showLineNumbers: false,
		wrap: false,
		overridesByLang: {
			"bash,sh,shell,console": { frame: "terminal" },
		},
	},
	frames: {
		showCopyToClipboardButton: true,
		removeCommentsWhenCopyingTerminalFrames: true,
		extractFileNameFromCode: true,
	},
	useStyleReset: true,
	styleOverrides: {
		borderRadius: "6px",
		borderColor: "oklch(1 0.01 85 / 0.09)",
		borderWidth: "1px",
		codeBackground: "oklch(0.155 0.005 75)",
		codeFontFamily: "var(--font-mono)",
		codeFontSize: "0.8125rem",
		codeLineHeight: "1.75",
		codePaddingBlock: "14px",
		codePaddingInline: "18px",
		uiFontFamily: "var(--font-body)",
		uiFontSize: "0.8125rem",
		focusBorder: "oklch(0.86 0.125 86)",
		scrollbarThumbColor: "oklch(0.31 0.007 75)",
		scrollbarThumbHoverColor: "oklch(0.36 0.007 75)",
		frames: {
			frameBoxShadowCssValue:
				"0 1px 0 oklch(0.06 0.004 75 / 0.7), 0 12px 24px -12px oklch(0.06 0.006 75 / 0.6)",
			editorTabBarBackground: "oklch(0.165 0.005 75)",
			editorTabBarBorderBottomColor: "oklch(1 0.01 85 / 0.09)",
			editorActiveTabBackground: "oklch(0.155 0.005 75)",
			editorActiveTabForeground: "oklch(0.955 0.006 90)",
			editorActiveTabIndicatorTopColor: "oklch(0.86 0.125 86)",
			editorActiveTabIndicatorBottomColor: "transparent",
			editorActiveTabIndicatorHeight: "2px",
			editorTabBorderRadius: "0",
			terminalBackground: "oklch(0.155 0.005 75)",
			terminalTitlebarBackground: "oklch(0.165 0.005 75)",
			terminalTitlebarForeground: "oklch(0.78 0.008 85)",
			terminalTitlebarDotsForeground: "oklch(0.31 0.007 75)",
			terminalTitlebarDotsOpacity: "1",
			terminalTitlebarBorderBottomColor: "oklch(1 0.01 85 / 0.09)",
			inlineButtonBackground: "oklch(0.255 0.008 78)",
			inlineButtonBackgroundIdleOpacity: "0",
			inlineButtonBackgroundHoverOrFocusOpacity: "1",
			inlineButtonBackgroundActiveOpacity: "1",
			inlineButtonForeground: "oklch(0.955 0.006 90)",
			inlineButtonBorder: "oklch(1 0.01 85 / 0.15)",
			inlineButtonBorderOpacity: "1",
			tooltipSuccessBackground: "oklch(0.792 0.209 151.711)",
			tooltipSuccessForeground: "oklch(0.2 0.03 150)",
		},
		textMarkers: {
			lineMarkerAccentWidth: "2px",
			markBackground: "oklch(0.86 0.125 86 / 0.09)",
			markBorderColor: "oklch(0.86 0.125 86)",
			insBackground: "oklch(0.792 0.209 151.711 / 0.1)",
			insBorderColor: "oklch(0.792 0.209 151.711)",
			insDiffIndicatorColor: "oklch(0.792 0.209 151.711)",
			delBackground: "oklch(0.76 0.16 22 / 0.1)",
			delBorderColor: "oklch(0.76 0.16 22)",
			delDiffIndicatorColor: "oklch(0.76 0.16 22)",
			inlineMarkerBorderWidth: "1px",
		},
		lineNumbers: {
			foreground: "oklch(0.62 0.01 80)",
			highlightForeground: "oklch(0.78 0.008 85)",
		},
		collapsibleSections: {
			closedBackgroundColor: "oklch(0.2 0.006 75)",
			closedBorderColor: "oklch(1 0.01 85 / 0.09)",
			closedTextColor: "oklch(0.78 0.008 85)",
			openBackgroundColorCollapsible: "transparent",
		},
	},
});

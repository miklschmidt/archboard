// How every code block of the docs looks: Expressive Code with a theme made of the site's own
// palette. Commands and code sit on the code bed, a marked line takes the 2px inset edge that
// DESIGN.md allows a code view, and added and removed lines keep the product's green and red.
// The `<Code>` component of the reference pages reads this file too.
import { defineEcConfig } from "astro-expressive-code";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";

/** A title that names a file, a path, a stream or a finding code, which the reader reads verbatim. */
const CODE_TITLE =
	/^(?:[\w.@~-]*[./][\w./@~-]*|std(?:out|err)|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?::.*)?)$/u;

/**
 * Marks a frame whose title is code, so the title sets in the monospace face like other code. A
 * title in words, such as "Ask your agent", keeps the body face.
 * @returns The plugin.
 */
function pluginCodeTitles() {
	return {
		name: "code-titles",
		hooks: {
			postprocessRenderedBlock: ({ codeBlock, renderData }) => {
				const title = codeBlock.props.title;
				if (typeof title !== "string" || !CODE_TITLE.test(title)) return;
				const properties = renderData.blockAst.properties;
				const classes = properties.className ?? [];
				properties.className = [...(Array.isArray(classes) ? classes : [classes]), "code-title"];
			},
		},
	};
}

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
	plugins: [pluginLineNumbers(), pluginCollapsibleSections(), pluginCodeTitles()],
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
	// Its styles go into each page, so a page waits on no stylesheet before its first paint.
	emitExternalStylesheet: false,
	styleOverrides: {
		borderRadius: "6px",
		borderColor: "var(--rule)",
		borderWidth: "1px",
		codeBackground: "var(--code-bed)",
		codeFontFamily: "var(--font-mono)",
		codeFontSize: "0.8125rem",
		codeLineHeight: "1.75",
		codePaddingBlock: "14px",
		codePaddingInline: "18px",
		uiFontFamily: "var(--font-body)",
		uiFontSize: "0.8125rem",
		focusBorder: "var(--gold-mark)",
		scrollbarThumbColor: "var(--slab)",
		scrollbarThumbHoverColor: "color-mix(in oklch, var(--slab) 90%, var(--ink))",
		frames: {
			frameBoxShadowCssValue: "var(--shadow-raised)",
			editorTabBarBackground: "var(--chrome)",
			editorTabBarBorderBottomColor: "var(--rule)",
			editorActiveTabBackground: "var(--code-bed)",
			editorActiveTabForeground: "var(--ink)",
			editorActiveTabIndicatorTopColor: "var(--gold-mark)",
			editorActiveTabIndicatorBottomColor: "transparent",
			editorActiveTabIndicatorHeight: "2px",
			editorTabBorderRadius: "0",
			terminalBackground: "var(--code-bed)",
			terminalTitlebarBackground: "var(--chrome)",
			terminalTitlebarForeground: "var(--ink-muted)",
			terminalTitlebarDotsForeground: "var(--slab)",
			terminalTitlebarDotsOpacity: "1",
			terminalTitlebarBorderBottomColor: "var(--rule)",
			inlineButtonBackground: "var(--raised)",
			inlineButtonBackgroundIdleOpacity: "0",
			inlineButtonBackgroundHoverOrFocusOpacity: "1",
			inlineButtonBackgroundActiveOpacity: "1",
			inlineButtonForeground: "var(--ink)",
			inlineButtonBorder: "var(--rule-strong)",
			inlineButtonBorderOpacity: "1",
			tooltipSuccessBackground: "var(--added)",
			tooltipSuccessForeground: "var(--added-ink)",
		},
		textMarkers: {
			lineMarkerAccentWidth: "2px",
			markBackground: "color-mix(in oklch, var(--gold-mark) 9%, transparent)",
			markBorderColor: "var(--gold-mark)",
			insBackground: "color-mix(in oklch, var(--added) 10%, transparent)",
			insBorderColor: "var(--added)",
			insDiffIndicatorColor: "var(--added)",
			delBackground: "color-mix(in oklch, var(--removed) 10%, transparent)",
			delBorderColor: "var(--removed)",
			delDiffIndicatorColor: "var(--removed)",
			inlineMarkerBorderWidth: "1px",
		},
		lineNumbers: {
			foreground: "var(--ink-faint)",
			highlightForeground: "var(--ink-muted)",
		},
		collapsibleSections: {
			closedBackgroundColor: "var(--plane)",
			closedBorderColor: "var(--rule)",
			closedTextColor: "var(--ink-muted)",
			openBackgroundColorCollapsible: "transparent",
		},
	},
});

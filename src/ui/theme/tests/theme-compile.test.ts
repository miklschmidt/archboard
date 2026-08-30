import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appStylesheet = path.join(moduleRoot, "app.css");

async function loadStylesheet(
	id: string,
	base: string,
): Promise<{ path: string; base: string; content: string }> {
	const resolved = id.startsWith(".")
		? path.resolve(base, id)
		: fileURLToPath(import.meta.resolve(id));
	return {
		path: resolved,
		base: path.dirname(resolved),
		content: fs.readFileSync(resolved, "utf8"),
	};
}

async function compiledTheme(candidates: readonly string[]): Promise<string> {
	const compiler = await compile(fs.readFileSync(appStylesheet, "utf8"), {
		base: moduleRoot,
		loadStylesheet,
	});
	return compiler.build([...candidates]);
}

function compiledRule(css: string, selector: string, anchor: string): string {
	const anchorIndex = css.indexOf(anchor);
	expect(anchorIndex).toBeGreaterThan(-1);
	const start = css.lastIndexOf(`${selector} {`, anchorIndex);
	const end = css.indexOf("\n}", anchorIndex);
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return css.slice(start, end);
}

const semanticCandidates = [
	"bg-background",
	"bg-surface-raised",
	"border-border",
	"text-foreground",
	"text-muted-foreground",
	"bg-primary",
	"text-primary-foreground",
	"bg-destructive-subtle",
	"bg-warning-subtle",
	"bg-status",
	"text-status-foreground",
	"font-sans",
	"font-mono",
	"font-medium",
	"text-kicker",
	"text-technical",
	"tracking-wordmark",
	"rounded-control",
	"rounded-panel",
	"gap-control",
	"px-control-inline",
	"min-h-touch-target",
	"shadow-flat",
	"opacity-disabled-control",
	"duration-control",
	"ease-control",
	"animate-status",
] as const;

const refusedCandidates = [
	"bg-red-500",
	"bg-token-that-does-not-exist",
	"font-serif",
	"text-2xl",
	"rounded-3xl",
	"shadow-xl",
	"gap-token-that-does-not-exist",
	"animate-pulse",
	"ease-in-out",
] as const;

describe("Archboard semantic Tailwind theme", () => {
	test("retains the completed TASK-140 light and dark source values", async () => {
		const css = await compiledTheme([]);
		const light = compiledRule(css, ":root", "--arch-font-ui");
		const dark = compiledRule(
			css,
			'.shell[data-theme="dark"]',
			"--arch-color-muted-foreground: #b5b7bd",
		);

		for (const declaration of [
			'--arch-font-ui: "Archboard Onest"',
			'--arch-font-technical: "Archboard DM Mono"',
			"--arch-text-kicker-size: 9px",
			"--arch-text-kicker-line: 12px",
			"--arch-text-primary-size: 16px",
			"--arch-text-primary-line: 22px",
			"--arch-color-selection: #155eef",
			"--arch-color-status: #a3e635",
			"--arch-color-foreground: #18181b",
			"--arch-color-muted-foreground: #5f6269",
			"--arch-color-border: #cfd1d4",
			"--arch-color-background: #f4f4f1",
			"--arch-color-surface: #fafaf8",
			"--arch-color-primary-hover: #0b4dcc",
			"--arch-color-destructive: #b42318",
			"--arch-color-warning: #8a4b08",
			"--arch-color-status-foreground: #315314",
			"--arch-radius-control: 3px",
			"--arch-radius-panel: 4px",
			"--arch-radius-dialog: 5px",
			"--arch-space-control: 8px",
			"--arch-space-control-inline: 12px",
			"--arch-space-region: 16px",
			"--arch-size-touch-target: 44px",
			"--arch-size-header: 56px",
			"--arch-shadow-flat: none",
			"--arch-opacity-disabled-control: 0.46",
			"--arch-opacity-disabled-item: 0.5",
			"--arch-opacity-disabled-action: 0.52",
			"--arch-duration-control: 140ms",
			"--arch-duration-status: 2.4s",
		]) {
			expect(light).toContain(declaration);
		}

		for (const declaration of [
			"--arch-color-selection: #155eef",
			"--arch-color-status: #a3e635",
			"--arch-color-foreground: #f4f4f0",
			"--arch-color-muted-foreground: #b5b7bd",
			"--arch-color-border: #3b3e45",
			"--arch-color-background: #17181b",
			"--arch-color-surface: #111216",
			"--arch-color-primary-hover: #8eb0ff",
			"--arch-color-destructive: #f97066",
			"--arch-color-warning: #fdb022",
			"--arch-color-status-foreground: #d9ff84",
		]) {
			expect(dark).toContain(declaration);
		}
	});

	test("emits every application token family from complete static candidates", async () => {
		const css = await compiledTheme(semanticCandidates);

		for (const candidate of semanticCandidates) {
			expect(css).toContain(`.${candidate}`);
		}
		expect(css).toContain("background-color: var(--arch-color-background)");
		expect(css).toContain("font-family: var(--arch-font-technical)");
		expect(css).toContain("min-height: var(--arch-size-touch-target)");
		expect(css).toContain("animation: var(--arch-animation-status)");
	});

	test("does not emit unknown semantic names or Tailwind's default visual tokens", async () => {
		const css = await compiledTheme(refusedCandidates);

		for (const candidate of refusedCandidates) {
			expect(css).not.toContain(`.${candidate}`);
		}
	});

	test("compiles without Preflight and retains contrast and motion accessibility", async () => {
		const css = await compiledTheme(["animate-status", "duration-control"]);

		expect(css).not.toContain("ol, ul, menu");
		expect(css).not.toContain("forced-color-adjust: none");
		expect(css).toContain("@media (prefers-reduced-motion: reduce)");
		expect(css).toContain("--arch-status-iteration-count: 1");
		expect(css).toContain("animation-duration: 0.001ms !important");
	});
});

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const loadedModule: unknown = await import(new URL("../index.tsx", import.meta.url).href);
if (typeof loadedModule !== "object" || loadedModule === null) {
	throw new Error("Button module did not load as an object.");
}
const publicApi = loadedModule as Readonly<Record<string, unknown>>;
if (typeof publicApi.Button !== "function") throw new Error("Button export is not a function.");
const Button = publicApi.Button as ComponentType<Record<string, unknown>>;

const source = fs.readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
const provenance = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");

const EXPECTED_CLASSES = {
	primary:
		"inline-flex shrink-0 items-center justify-center gap-control whitespace-nowrap rounded-control border font-sans !text-control font-medium shadow-flat outline-none select-none transition-colors duration-control ease-control data-disabled:cursor-default data-disabled:opacity-disabled-control focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 border-primary bg-primary text-primary-foreground hover:not-data-disabled:bg-primary-hover min-h-touch-target px-control-inline py-control",
	secondary:
		"inline-flex shrink-0 items-center justify-center gap-control whitespace-nowrap rounded-control border font-sans !text-control font-medium shadow-flat outline-none select-none transition-colors duration-control ease-control data-disabled:cursor-default data-disabled:opacity-disabled-control focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 border-border bg-surface-subtle text-foreground hover:not-data-disabled:bg-surface-hover min-h-touch-target px-control-inline py-control",
	quiet:
		"inline-flex shrink-0 items-center justify-center gap-control whitespace-nowrap rounded-control border font-sans !text-control font-medium shadow-flat outline-none select-none transition-colors duration-control ease-control data-disabled:cursor-default data-disabled:opacity-disabled-control focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 border-transparent bg-transparent text-foreground hover:not-data-disabled:border-border hover:not-data-disabled:bg-surface-hover min-h-touch-target px-control-inline py-control",
} as const;

function renderButton(props: Record<string, unknown>): string {
	return renderToStaticMarkup(createElement(Button, props, "Action"));
}

function renderedClasses(markup: string): string {
	const match = markup.match(/ class="([^"]*)"/);
	if (!match?.[1]) throw new Error(`Button markup has no class attribute: ${markup}`);
	return match[1].replaceAll("&amp;", "&");
}

describe("button public module", () => {
	test("exports only Button at runtime and keeps ButtonProps type-only", () => {
		expect(Object.keys(publicApi)).toEqual(["Button"]);
		expect(Button).toBeTypeOf("function");
	});

	test("emits exact deterministic tone and size classes", () => {
		for (const tone of ["primary", "secondary", "quiet"] as const) {
			const first = renderedClasses(renderButton({ tone }));
			const second = renderedClasses(renderButton({ tone }));
			expect(first).toBe(EXPECTED_CLASSES[tone]);
			expect(second).toBe(first);
		}

		const icon = renderedClasses(renderButton({ tone: "quiet", size: "icon" }));
		expect(icon).toBe(
			EXPECTED_CLASSES.quiet.replace(
				"min-h-touch-target px-control-inline py-control",
				"size-touch-target p-0",
			),
		);
	});

	test("resolves caller strings and state callbacks last without mutating them", () => {
		const callerString = "border-warning bg-warning-subtle";
		const callbackStates: Array<{ disabled: boolean }> = [];
		const callerCallback = (state: { disabled: boolean }) => {
			callbackStates.push({ ...state });
			return state.disabled ? "border-destructive bg-destructive-subtle" : undefined;
		};
		Object.freeze(callerCallback);

		const stringClasses = renderedClasses(
			renderButton({ tone: "primary", className: callerString }),
		);
		const enabledClasses = renderedClasses(
			renderButton({ tone: "secondary", className: callerCallback }),
		);
		const disabledClasses = renderedClasses(
			renderButton({ tone: "secondary", className: callerCallback, disabled: true }),
		);

		expect(stringClasses).toEndWith(
			"text-primary-foreground hover:not-data-disabled:bg-primary-hover min-h-touch-target px-control-inline py-control border-warning bg-warning-subtle",
		);
		expect(enabledClasses).toBe(EXPECTED_CLASSES.secondary);
		expect(disabledClasses).toEndWith(
			"text-foreground hover:not-data-disabled:bg-surface-hover min-h-touch-target px-control-inline py-control border-destructive bg-destructive-subtle",
		);
		expect(callbackStates).toEqual([{ disabled: false }, { disabled: true }]);
		expect(callerString).toBe("border-warning bg-warning-subtle");
	});

	test("keeps native, focusable-disabled, non-native, tab index, and submit semantics in Base UI", () => {
		const native = renderButton({ tone: "primary" });
		const submit = renderButton({ tone: "primary", type: "submit" });
		const disabled = renderButton({ tone: "primary", disabled: true });
		const focusable = renderButton({
			tone: "primary",
			disabled: true,
			focusableWhenDisabled: true,
		});
		const nonNative = renderButton({
			tone: "quiet",
			disabled: true,
			focusableWhenDisabled: true,
			nativeButton: false,
			render: createElement("div"),
			tabIndex: 3,
		});

		expect(native).toContain('type="button"');
		expect(submit).toContain('type="submit"');
		expect(disabled).toContain(' disabled=""');
		expect(disabled).toContain(' data-disabled=""');
		expect(focusable).not.toContain(' disabled=""');
		expect(focusable).toContain('aria-disabled="true"');
		expect(focusable).toContain(' data-disabled=""');
		expect(nonNative).toStartWith("<div");
		expect(nonNative).toContain('role="button"');
		expect(nonNative).toContain('aria-disabled="true"');
		expect(nonNative).toContain('tabindex="3"');
		expect(nonNative).toContain(' data-disabled=""');
	});

	test("passes style callbacks and caller props without mutation", () => {
		const styleStates: Array<{ disabled: boolean }> = [];
		const style = (state: { disabled: boolean }) => {
			styleStates.push({ ...state });
			return { opacity: state.disabled ? 0.25 : 1 };
		};
		Object.freeze(style);
		const props = Object.freeze({
			tone: "secondary" as const,
			disabled: true,
			focusableWhenDisabled: true,
			className: undefined,
			style,
			"data-owner": "archboard",
		});
		const before = { ...props };
		const markup = renderButton(props);

		expect(markup).toContain('style="opacity:0.25"');
		expect(markup).toContain('data-owner="archboard"');
		expect(styleStates).toEqual([{ disabled: true }]);
		expect(props).toEqual(before);
	});

	test("keeps interaction mechanics in Base UI and pins local provenance", () => {
		expect(source).toContain('from "@base-ui/react/button"');
		expect(source).toContain('from "@/ui/ui-classnames"');
		for (const marker of [
			["class", "variance", "authority"].join("-"),
			"VariantProps",
			"buttonVariants",
			"defaultVariants",
			"data-slot",
			"asChild",
			"lucide",
			"<svg",
			"<button",
		]) {
			expect(source).not.toContain(marker);
		}
		expect(source).not.toMatch(
			/onClick\s*=|onMouseDown\s*=|onPointerDown\s*=|onKeyDown\s*=|onKeyUp\s*=|role\s*=|aria-disabled\s*=|tabIndex\s*=|addEventListener|setTimeout|useState/,
		);
		for (const field of [
			"Upstream repository: https://github.com/shadcn-ui/ui",
			"Immutable commit: `b4a618b97e35f5dadf3a00d51f410c84a2567d4d`",
			"Upstream path: `apps/v4/registry/bases/base/ui/button.tsx`",
			"Reviewed fixture: `docs/design/vendor/shadcn-base/button.tsx`",
			"Fixture SHA-256: `97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12`",
			"Reduced on: 2026-08-31",
			"Local owner: `src/ui/button`",
			"Runtime primitive: `@base-ui/react` 1.7.0",
		]) {
			expect(provenance).toContain(field);
		}
		expect(provenance).toContain("noncompiled reading copy");
		expect(provenance).toContain("Archboard-owned source");
		expect(provenance).toContain(
			"requires a new immutable upstream commit, fixture hash, and review",
		);
	});
});

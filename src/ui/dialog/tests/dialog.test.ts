import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { Children, createRef, isValidElement, type ReactElement, type ReactNode } from "react";

const loadedModule: unknown = await import(new URL("../index.tsx", import.meta.url).href);
if (typeof loadedModule !== "object" || loadedModule === null) {
	throw new Error("Dialog module did not load as an object.");
}
const publicApi = loadedModule as Readonly<Record<string, unknown>>;
type DialogComponent = (props: Record<string, unknown>) => ReactElement;
const Dialog = publicApi.Dialog as DialogComponent;
const DialogClose = publicApi.DialogClose as DialogComponent;
const DialogContent = publicApi.DialogContent as DialogComponent;
const DialogDescription = publicApi.DialogDescription as DialogComponent;
const DialogTitle = publicApi.DialogTitle as DialogComponent;
const loadedButtonModule: unknown = await import(
	new URL("../../button/index.tsx", import.meta.url).href
);
if (typeof loadedButtonModule !== "object" || loadedButtonModule === null) {
	throw new Error("Button module did not load as an object.");
}
const Button = (loadedButtonModule as Readonly<Record<string, unknown>>).Button;
const source = fs.readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
const provenance = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");

const POPUP_CLASSES =
	"fixed top-1/2 left-1/2 z-50 flex max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-region overflow-auto rounded-dialog border border-border bg-surface-raised p-panel font-sans !text-body text-foreground shadow-flat outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const TITLE_CLASSES = "m-0 font-sans !text-title font-semibold text-foreground";
const DESCRIPTION_CLASSES = "m-0 font-sans !text-body text-muted-foreground";
const RETURN_TRUE = () => true;
const DO_NOTHING = () => undefined;

function elementProps(element: unknown): Readonly<Record<string, unknown>> {
	if (!isValidElement<Record<string, unknown>>(element)) {
		throw new Error("Expected a valid React element.");
	}
	return element.props;
}

function contentParts(element: ReactElement): [ReactElement, ReactElement] {
	const parts = Children.toArray(elementProps(element).children as ReactNode);
	if (parts.length !== 2 || !isValidElement(parts[0]) || !isValidElement(parts[1])) {
		throw new Error("DialogContent did not produce one backdrop and one popup.");
	}
	return [parts[0], parts[1]];
}

describe("dialog public module", () => {
	test("exports the owned dialog composition at runtime", () => {
		expect(Object.keys(publicApi)).toEqual([
			"Dialog",
			"DialogClose",
			"DialogContent",
			"DialogDescription",
			"DialogHeader",
			"DialogTitle",
		]);
		for (const value of Object.values(publicApi)) expect(value).toBeTypeOf("function");
	});

	test("keeps controlled state requests and event details on the Base UI root", () => {
		const requests: Array<[boolean, unknown]> = [];
		const onOpenChange = (open: boolean, details: unknown) => requests.push([open, details]);
		const children = "dialog";
		const props = Object.freeze({ open: true, onOpenChange, children });
		const before = { ...props };
		const root = Dialog(props);
		const rootProps = elementProps(root);

		expect(root.type).toBe(BaseDialog.Root);
		expect(rootProps.open).toBe(true);
		expect(rootProps.modal).toBe(true);
		expect(rootProps.disablePointerDismissal).toBe(false);
		expect(rootProps.children).toBe(children);
		expect(rootProps.onOpenChange).toBe(onOpenChange);

		const details = Object.freeze({ reason: "escape-key", marker: "vendor-owned" });
		(rootProps.onOpenChange as (open: boolean, details: unknown) => void)(false, details);
		expect(requests).toEqual([[false, details]]);
		expect(props).toEqual(before);
	});

	test("fixes exactly one portal, backdrop, and popup while passing popup contracts through", () => {
		const ref = createRef<HTMLDivElement>();
		const initialFocus = createRef<HTMLElement>();
		const finalFocus = RETURN_TRUE;
		const style = Object.freeze({ maxWidth: "40rem" });
		const onKeyDown = DO_NOTHING;
		const children = "content";
		const props = Object.freeze({
			ref,
			initialFocus,
			finalFocus,
			style,
			onKeyDown,
			children,
			"aria-label": "Settings",
			"data-owner": "archboard",
		});
		const content = DialogContent(props);
		const [backdrop, popup] = contentParts(content);
		const backdropProps = elementProps(backdrop);
		const popupProps = elementProps(popup);

		expect(content.type).toBe(BaseDialog.Portal);
		expect(backdrop.type).toBe(BaseDialog.Backdrop);
		expect(popup.type).toBe(BaseDialog.Popup);
		expect(backdropProps.className).toBe("fixed z-50 bg-background/60");
		expect(backdropProps.style).toEqual({ inset: 0 });
		expect(popupProps.className).toBe(POPUP_CLASSES);
		for (const name of [
			"ref",
			"initialFocus",
			"finalFocus",
			"style",
			"onKeyDown",
			"children",
			"aria-label",
			"data-owner",
		]) {
			expect(popupProps[name]).toBe(props[name as keyof typeof props]);
		}
	});

	test("composes deterministic caller-last popup, title, and description classes", () => {
		const popupStates: BaseDialog.Popup.State[] = [];
		const popupClassName = (state: BaseDialog.Popup.State) => {
			popupStates.push({ ...state });
			return "max-w-full bg-warning-subtle";
		};
		const content = DialogContent({ className: popupClassName });
		const [, popup] = contentParts(content);
		const popupResolver = elementProps(popup).className as (
			state: BaseDialog.Popup.State,
		) => string;
		const popupState: BaseDialog.Popup.State = {
			open: true,
			transitionStatus: "idle",
			nested: false,
			nestedDialogOpen: false,
		};
		const first = popupResolver(popupState);
		const second = popupResolver(popupState);

		expect(first).toBe(
			POPUP_CLASSES.replace("max-w-full", "")
				.replace("bg-surface-raised", "")
				.replaceAll("  ", " ")
				.trim()
				.concat(" max-w-full bg-warning-subtle"),
		);
		expect(second).toBe(first);
		expect(popupStates).toEqual([popupState, popupState]);

		const title = DialogTitle({ className: "text-warning", children: "Title" });
		const description = DialogDescription({
			className: () => "text-destructive",
			children: "Description",
		});
		expect(elementProps(title).className).toBe(
			TITLE_CLASSES.replace("text-foreground", "text-warning"),
		);
		expect(
			(elementProps(description).className as (state: BaseDialog.Description.State) => string)({}),
		).toBe(DESCRIPTION_CLASSES.replace("text-muted-foreground", "text-destructive"));
	});

	test("uses actual Base UI label parts and composes Close through the accepted Button", () => {
		const titleRef = createRef<HTMLHeadingElement>();
		const descriptionRef = createRef<HTMLParagraphElement>();
		const closeRef = createRef<HTMLButtonElement>();
		const onClick = DO_NOTHING;
		const title = DialogTitle({ ref: titleRef, id: "dialog-title", children: "Settings" });
		const description = DialogDescription({
			ref: descriptionRef,
			id: "dialog-description",
			children: "Choose an opener.",
		});
		const close = DialogClose({
			ref: closeRef,
			onClick,
			className: "bg-warning-subtle",
			children: "Cancel",
		});
		const closeProps = elementProps(close);
		const renderedButton = closeProps.render;
		const buttonProps = elementProps(renderedButton);

		expect(title.type).toBe(BaseDialog.Title);
		expect(description.type).toBe(BaseDialog.Description);
		expect(elementProps(title).ref).toBe(titleRef);
		expect(elementProps(description).ref).toBe(descriptionRef);
		expect(close.type).toBe(BaseDialog.Close);
		expect(closeProps.ref).toBe(closeRef);
		expect(closeProps.onClick).toBe(onClick);
		expect(closeProps.children).toBe("Cancel");
		expect((renderedButton as ReactElement).type as unknown).toBe(Button);
		expect(buttonProps.tone).toBe("secondary");
		expect(buttonProps.size).toBeUndefined();
		expect(buttonProps.className).toBe("border-border text-foreground bg-warning-subtle");
	});

	test("leaves every interaction mechanic in Base UI and pins local provenance", () => {
		expect(source).toContain('from "@base-ui/react/dialog"');
		expect(source).toContain('from "@/ui/button"');
		expect(source).toContain('from "@/ui/ui-classnames"');
		expect(source.match(/<BaseDialog\.Portal>/g)).toHaveLength(1);
		expect(source.match(/<BaseDialog\.Backdrop/g)).toHaveLength(1);
		expect(source.match(/<BaseDialog\.Popup\n/g)).toHaveLength(1);
		for (const marker of [
			"DialogTrigger",
			"DialogFooter",
			"DialogOverlay",
			"DialogViewport",
			"showCloseButton",
			["Icon", "Placeholder"].join(""),
			"lucide",
			"<svg",
			["class", "variance", "authority"].join("-"),
			"buttonVariants",
			"createPortal",
		]) {
			expect(source).not.toContain(marker);
		}
		expect(source).not.toMatch(/data-slot\s*=/);
		expect(source).not.toMatch(
			/useState|useEffect|useReducer|useRef|addEventListener|removeEventListener|querySelector|focus\(|onClick\s*=|onPointerDown\s*=|onKeyDown\s*=|role\s*=|aria-labelledby\s*=|aria-describedby\s*=|tabIndex\s*=|inert\s*=|setTimeout|setInterval/,
		);
		for (const field of [
			"Upstream repository: https://github.com/shadcn-ui/ui",
			"Immutable commit: `b4a618b97e35f5dadf3a00d51f410c84a2567d4d`",
			"Upstream path: `apps/v4/registry/bases/base/ui/dialog.tsx`",
			"Reviewed fixture: `docs/design/vendor/shadcn-base/dialog.tsx`",
			"Fixture SHA-256: `85f9a33d1a8c495b0faecd066dae1581b8feb5d27f912ecf65f814386f6da3a9`",
			"Reduced on: 2026-08-31",
			"Local owner: `src/ui/dialog`",
			"Runtime primitive: `@base-ui/react` 1.7.0",
			"Accepted dependency: `src/ui/button` and its recorded provenance",
		]) {
			expect(provenance).toContain(field);
		}
		expect(provenance).toContain("noncompiled reading copy");
		expect(provenance).toContain("Archboard-owned source");
		expect(provenance).toContain(
			"requires a new immutable upstream commit, fixture hash, dependency review, and local",
		);
		expect(provenance).toContain("semantic background color at 60% opacity");
		expect(provenance).toContain("legacy modal backdrop's 62% opacity");
	});
});

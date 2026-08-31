import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const entrypoint = path.join(repoRoot, "src/ui/dialog/index.tsx");
const frontendConfig = path.join(repoRoot, "tsconfig.frontend.json");

function compileTypeContract(): ReturnType<typeof spawnSync> {
	const temporaryRoot = fs.mkdtempSync(path.join(repoRoot, ".task-14419-dialog-types-"));
	const contractPath = path.join(temporaryRoot, "contract.tsx");
	const configPath = path.join(temporaryRoot, "tsconfig.json");
	const contract = `
import { createElement, createRef } from "react";
import * as publicApi from ${JSON.stringify(entrypoint)};
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	type DialogProps,
	type DialogCloseProps,
	type DialogContentProps,
	type DialogDescriptionProps,
	type DialogTitleProps,
} from ${JSON.stringify(entrypoint)};

const popupRef = createRef<HTMLDivElement>();
const headingRef = createRef<HTMLHeadingElement>();
const paragraphRef = createRef<HTMLParagraphElement>();
const buttonRef = createRef<HTMLButtonElement>();
const focusRef = createRef<HTMLElement>();
const root = {
	open: true,
	onOpenChange: (open, details) => {
		const next: boolean = open;
		const reason = details.reason;
		details.preventUnmountOnClose();
		if (reason === "escape-key") details.cancel();
		void next;
	},
	children: "Dialog",
} satisfies DialogProps;
createElement(Dialog, root);

const content = {
	ref: popupRef,
	initialFocus: focusRef,
	finalFocus: (interaction) => interaction === "keyboard" ? focusRef.current : true,
	className: (state) => state.open ? "bg-surface" : undefined,
	style: (state) => ({ opacity: state.open ? 1 : 0 }),
	render: createElement("section"),
	role: "region",
	"aria-label": "Settings",
	"data-owner": "archboard",
	"data-active": true,
	onKeyDown: (event) => event.preventBaseUIHandler(),
	children: "Contents",
} satisfies DialogContentProps;
createElement(DialogContent, content);

const title = {
	ref: headingRef,
	id: "title",
	className: () => "text-warning",
	style: () => ({ margin: 0 }),
	children: "Settings",
} satisfies DialogTitleProps;
const description = {
	ref: paragraphRef,
	id: "description",
	className: "text-muted-foreground",
	children: "Choose an opener.",
} satisfies DialogDescriptionProps;
const close = {
	ref: buttonRef,
	disabled: false,
	type: "button",
	className: (state) => state.disabled ? "opacity-disabled-control" : undefined,
	style: (state) => ({ opacity: state.disabled ? 0.5 : 1 }),
	"aria-label": "Cancel settings",
	"data-owner": "archboard",
	onClick: (event) => event.preventBaseUIHandler(),
	children: "Cancel",
} satisfies DialogCloseProps;
createElement(DialogTitle, title);
createElement(DialogDescription, description);
createElement(DialogClose, close);

// @ts-expect-error Controlled state is required.
const missingOpen: DialogProps = { onOpenChange: () => undefined };
// @ts-expect-error Controlled state requests are required.
const missingChange: DialogProps = { open: true };
// @ts-expect-error Uncontrolled state is not part of the owned API.
const uncontrolled: DialogProps = { open: true, onOpenChange: () => undefined, defaultOpen: true };
// @ts-expect-error Modal behavior is pinned by the owned API.
const modalOverride: DialogProps = { open: true, onOpenChange: () => undefined, modal: false };
// @ts-expect-error Outside dismissal is pinned by the owned API.
const dismissalOverride: DialogProps = { open: true, onOpenChange: () => undefined, disablePointerDismissal: true };
// @ts-expect-error Imperative root actions are not exposed.
const rootActions: DialogProps = { open: true, onOpenChange: () => undefined, actionsRef: createRef() };
// @ts-expect-error Detached handles are not exposed.
const rootHandle: DialogProps = { open: true, onOpenChange: () => undefined, handle: {} };
// @ts-expect-error Trigger routing is not exposed.
const triggerId: DialogProps = { open: true, onOpenChange: () => undefined, triggerId: "open" };
// @ts-expect-error Popup refs retain the vendor HTMLDivElement contract.
const wrongPopupRef: DialogContentProps = { ref: createRef<HTMLElement>() };
// @ts-expect-error Title refs retain the heading contract.
const wrongTitleRef: DialogTitleProps = { ref: createRef<SVGSVGElement>() };
// @ts-expect-error Description refs retain the paragraph contract.
const wrongDescriptionRef: DialogDescriptionProps = { ref: createRef<SVGSVGElement>() };
// @ts-expect-error Close refs retain the native button contract.
const wrongCloseRef: DialogCloseProps = { ref: createRef<HTMLElement>() };
// @ts-expect-error Close cannot bypass the accepted Button.
const closeRender: DialogCloseProps = { render: createElement("a") };
// @ts-expect-error Close cannot claim a non-native element.
const closeNative: DialogCloseProps = { nativeButton: false };
// @ts-expect-error Stock shadcn variants are not public.
const closeVariant: DialogCloseProps = { variant: "outline" };
// @ts-expect-error Generated size choices are not public.
const closeSize: DialogCloseProps = { size: "sm" };
// @ts-expect-error Generated slots are not public.
const generatedSlot: DialogContentProps = { "data-slot": "dialog-content" };
// @ts-expect-error data-* values must be DOM-serializable scalars.
const objectData: DialogContentProps = { "data-value": {} };
// @ts-expect-error data-* values cannot carry functions.
const functionData: DialogCloseProps = { "data-value": () => undefined };
// @ts-expect-error data-* values cannot carry symbols.
const symbolData: DialogTitleProps = { "data-value": Symbol("value") };
// @ts-expect-error There is no trigger export.
void publicApi.DialogTrigger;
// @ts-expect-error There is no portal export.
void publicApi.DialogPortal;
// @ts-expect-error There is no backdrop export.
void publicApi.DialogBackdrop;
// @ts-expect-error There are no public class helpers.
void publicApi.dialogClasses;

void missingOpen;
void missingChange;
void uncontrolled;
void modalOverride;
void dismissalOverride;
void rootActions;
void rootHandle;
void triggerId;
void wrongPopupRef;
void wrongTitleRef;
void wrongDescriptionRef;
void wrongCloseRef;
void closeRender;
void closeNative;
void closeVariant;
void closeSize;
void generatedSlot;
void objectData;
void functionData;
void symbolData;
`;
	const config = {
		extends: frontendConfig,
		compilerOptions: { noEmit: true },
		files: [contractPath],
	};

	try {
		fs.writeFileSync(contractPath, contract);
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
		return spawnSync("bunx", ["tsc", "--noEmit", "-p", configPath], {
			cwd: repoRoot,
			encoding: "utf8",
		});
	} finally {
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

describe("dialog compile-time contract", () => {
	test("accepts the controlled owned API and rejects bypasses and wrong refs", () => {
		const result = compileTypeContract();
		expect(result.status, String(result.stdout) + String(result.stderr)).toBe(0);
	});
});

import { beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import {
	Children,
	isValidElement,
	type Dispatch,
	type EffectCallback,
	type ReactElement,
	type ReactNode,
	type RefObject,
	type SetStateAction,
} from "react";
import ReactDefault, * as ReactRuntime from "react";

type StateCell = unknown;
type OpenerReply = Readonly<Record<string, unknown>>;
type ElementProps = Record<string, unknown>;
type TestElement = ReactElement<ElementProps>;
type TestComponent = (props: ElementProps) => TestElement;

const stateCells: StateCell[] = [];
const effects: EffectCallback[] = [];
const refCells: Array<RefObject<unknown>> = [];
let stateCursor = 0;
let refCursor = 0;

function useStateHarness<State>(
	initial: State | (() => State),
): [State, Dispatch<SetStateAction<State>>] {
	const index = stateCursor++;
	if (index >= stateCells.length) {
		stateCells[index] = typeof initial === "function" ? (initial as () => State)() : initial;
	}
	const setState: Dispatch<SetStateAction<State>> = (next) => {
		const current = stateCells[index] as State;
		stateCells[index] =
			typeof next === "function" ? (next as (value: State) => State)(current) : next;
	};
	return [stateCells[index] as State, setState];
}

await mock.module("react", () => ({
	...ReactRuntime,
	default: ReactDefault,
	useCallback: <Callback>(callback: Callback) => callback,
	useEffect: (effect: EffectCallback) => {
		effects.push(effect);
	},
	useMemo: <Value>(factory: () => Value) => factory(),
	useRef: <Value>(initial: Value) => {
		const index = refCursor++;
		refCells[index] ??= { current: initial };
		return refCells[index] as RefObject<Value>;
	},
	useState: useStateHarness,
}));

const calls = {
	fetch: 0,
	reset: 0,
	save: [] as unknown[],
	test: [] as Array<{ selection: unknown; repository: string }>,
};

const repository = "github.com/acme/archboard";
const customSelection = {
	version: 1,
	kind: "custom",
	executable: "/opt/acme/bin/editor",
	argv: ["--reuse-window", "{path}"],
} as const;
const platformSelection = { version: 1, kind: "platform" } as const;

function settingsReply(selection: typeof customSelection | typeof platformSelection): OpenerReply {
	const command =
		selection.kind === "custom"
			? { executable: selection.executable, argv: selection.argv }
			: { executable: "xdg-open", argv: ["{path}"] };
	return {
		success: true,
		selection,
		effectiveCommand: command,
		availability: { available: true },
		platformDefault: { executable: "xdg-open", argv: ["{path}"] },
		presets: [
			{ preset: "vscode", command: { executable: "code", argv: ["{path}"] } },
			{ preset: "cursor", command: { executable: "cursor", argv: ["{path}"] } },
			{ preset: "zed", command: { executable: "zed", argv: ["{path}"] } },
		],
		repositories: [
			{
				repository,
				root: "/controlled/checkout",
				exists: true,
				identityMatches: true,
			},
		],
	};
}

let fetchReply = settingsReply(customSelection);
let resetReply: OpenerReply = { success: true, selection: platformSelection };
let saveReply: OpenerReply = { success: true, selection: customSelection };
let testReply: OpenerReply = { success: true, code: "OPENER_TESTED", repository };

const apiUrl = new URL("../../canvas/api.ts", import.meta.url).href;
await mock.module(apiUrl, () => ({
	fetchOpenerSettings: async () => {
		calls.fetch += 1;
		return fetchReply;
	},
	resetOpenerSettings: async () => {
		calls.reset += 1;
		if (resetReply.success) fetchReply = settingsReply(platformSelection);
		return resetReply;
	},
	saveOpenerSettings: async (selection: unknown) => {
		calls.save.push(selection);
		return saveReply;
	},
	testOpenerSettings: async (selection: unknown, selectedRepository: string) => {
		calls.test.push({ selection, repository: selectedRepository });
		return testReply;
	},
}));

const openerModule: unknown = await import(new URL("../index.tsx", import.meta.url).href);
const dialogModule: unknown = await import(new URL("../../dialog/index.tsx", import.meta.url).href);
const buttonModule: unknown = await import(new URL("../../button/index.tsx", import.meta.url).href);
if (typeof openerModule !== "object" || openerModule === null)
	throw new Error("Opener module failed.");
if (typeof dialogModule !== "object" || dialogModule === null)
	throw new Error("Dialog module failed.");
if (typeof buttonModule !== "object" || buttonModule === null)
	throw new Error("Button module failed.");

const publicApi = openerModule as Readonly<Record<string, unknown>>;
const OpenerSettingsDialog = publicApi.OpenerSettingsDialog as (props: {
	onCancel: () => void;
	onSuccess: (message: string) => void;
	onFailure: (notice: unknown) => void;
}) => TestElement;
const { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } = dialogModule as {
	Dialog: TestComponent;
	DialogClose: TestComponent;
	DialogContent: TestComponent;
	DialogDescription: TestComponent;
	DialogTitle: TestComponent;
};
const Button = (buttonModule as { Button: TestComponent }).Button;
const source = fs.readFileSync(new URL("../lib/OpenerSettingsDialog.tsx", import.meta.url), "utf8");
const entrypoint = fs.readFileSync(new URL("../index.tsx", import.meta.url), "utf8");

const callbacks = {
	cancel: 0,
	success: [] as string[],
	failure: [] as unknown[],
};

function renderDialog(): TestElement {
	stateCursor = 0;
	refCursor = 0;
	return OpenerSettingsDialog({
		onCancel: () => {
			callbacks.cancel += 1;
		},
		onSuccess: (message) => callbacks.success.push(message),
		onFailure: (notice) => callbacks.failure.push(notice),
	});
}

function elements(node: ReactNode): TestElement[] {
	const found: TestElement[] = [];
	for (const child of Children.toArray(node)) {
		if (!isValidElement<ElementProps>(child)) continue;
		found.push(child);
		found.push(...elements(child.props.children as ReactNode));
	}
	return found;
}

function textContent(node: ReactNode): string {
	return Children.toArray(node)
		.map((child) =>
			typeof child === "string" || typeof child === "number"
				? String(child)
				: isValidElement(child)
					? textContent((child.props as { children?: ReactNode }).children)
					: "",
		)
		.join("");
}

function findByText(root: TestElement, type: unknown, text: string): TestElement {
	const match = elements(root).find(
		(element) =>
			element.type === type &&
			textContent((element.props as { children?: ReactNode }).children) === text,
	);
	if (!match) throw new Error(`Could not find ${text}.`);
	return match;
}

function requestOpenChange(root: TestElement, open: boolean, details: unknown): void {
	(root.props.onOpenChange as (nextOpen: boolean, nextDetails: unknown) => void)(open, details);
}

async function click(element: TestElement): Promise<void> {
	await (element.props.onClick as () => void | Promise<void>)();
}

async function runLoadEffect(): Promise<void> {
	const effect = effects.shift();
	if (!effect) throw new Error("The opener did not request its initial load effect.");
	effect();
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	stateCells.length = 0;
	effects.length = 0;
	refCells.length = 0;
	stateCursor = 0;
	refCursor = 0;
	calls.fetch = 0;
	calls.reset = 0;
	calls.save.length = 0;
	calls.test.length = 0;
	callbacks.cancel = 0;
	callbacks.success.length = 0;
	callbacks.failure.length = 0;
	fetchReply = settingsReply(customSelection);
	resetReply = { success: true, selection: platformSelection };
	saveReply = { success: true, selection: customSelection };
	testReply = { success: true, code: "OPENER_TESTED", repository };
});

describe("opener settings public consumer", () => {
	test("keeps the exact public callbacks and translates only requested closure", () => {
		expect(Object.keys(publicApi)).toEqual(["OpenerSettingsDialog"]);
		const root = renderDialog();
		expect(root.type).toBe(Dialog);
		expect(root.props.open).toBe(true);

		const details = Object.freeze({ reason: "trigger-press" });
		requestOpenChange(root, true, details);
		expect(callbacks.cancel).toBe(0);
		requestOpenChange(root, false, details);
		expect(callbacks.cancel).toBe(1);

		const content = elements(root).find((element) => element.type === DialogContent);
		expect(content?.props.className).toBe("opener-dialog gap-0 p-0 overflow-hidden");
		expect(findByText(root, DialogTitle, "Opener settings")).toBeDefined();
		expect(findByText(root, DialogDescription, "Reading opener settings…")).toBeDefined();
		const cancel = findByText(root, DialogClose, "Cancel");
		expect(content?.props.initialFocus).toBe(cancel.props.ref);
		expect(cancel.props.ref).toEqual({ current: null });
		expect(cancel.props.disabled).toBe(false);
		expect(source).toContain('disabled={busy && working !== "load"}');
		const close = elements(root).find(
			(element) => element.type === DialogClose && element.props["aria-label"] === "Close dialog",
		);
		expect(close?.props.className).toBe(
			"p-0 size-touch-target min-h-touch-target text-muted-foreground",
		);
	});

	test("loads through the existing owner and preserves drafts across test success and failure", async () => {
		renderDialog();
		await runLoadEffect();
		let root = renderDialog();

		expect(calls.fetch).toBe(1);
		const executable = elements(root).find(
			(element) => element.type === "input" && element.props.placeholder,
		);
		if (!executable) throw new Error("Could not find the custom executable input.");
		expect(executable.props.value).toBe(customSelection.executable);
		const argumentIds = elements(root)
			.filter((element) => element.type === "input" && element.props["data-argument-id"])
			.map((element) => element.props["data-argument-id"]);
		expect(argumentIds).toHaveLength(2);

		const testButton = findByText(root, Button, "Test");
		expect(testButton.props.tone).toBe("secondary");
		expect(testButton.props.disabled).toBe(false);
		await click(testButton);
		expect(calls.test).toEqual([{ selection: customSelection, repository }]);
		expect(calls.save).toEqual([]);
		expect(callbacks.success).toEqual([`Test opener launched for ${repository}.`]);
		expect(callbacks.cancel).toBe(0);

		const unsavedSelection = {
			...customSelection,
			executable: "/opt/draft/bin/editor",
			argv: ["--new-window", "{path}"],
		};
		(executable.props.onChange as (event: unknown) => void)({
			target: { value: unsavedSelection.executable },
		});
		const firstArgument = elements(root).find(
			(element) => element.type === "input" && element.props["data-argument-id"] === argumentIds[0],
		);
		if (!firstArgument) throw new Error("Could not find the first custom argument input.");
		(firstArgument.props.onChange as (event: unknown) => void)({
			currentTarget: {
				dataset: { argumentId: argumentIds[0] },
				value: unsavedSelection.argv[0],
			},
		});
		root = renderDialog();
		testReply = {
			success: false,
			code: "OPENER_SPAWN_FAILED",
			error: "Controlled opener failed before launch.",
			actions: [{ kind: "settings", label: "Opener settings" }],
		};
		await click(findByText(root, Button, "Test"));
		root = renderDialog();
		expect(calls.test).toEqual([
			{ selection: customSelection, repository },
			{ selection: unsavedSelection, repository },
		]);
		expect(callbacks.failure).toEqual([
			{
				kind: "error",
				message: "Controlled opener failed before launch.",
				actions: [{ kind: "settings", label: "Opener settings" }],
			},
		]);
		expect(textContent(root)).toContain("Controlled opener failed before launch.");
		const currentExecutable = elements(root).find(
			(element) => element.type === "input" && element.props.placeholder,
		);
		const currentArguments = elements(root).filter(
			(element) => element.type === "input" && element.props["data-argument-id"],
		);
		if (!currentExecutable) throw new Error("The custom executable input was lost after failure.");
		expect(currentExecutable.props.value).toBe(unsavedSelection.executable);
		expect(currentArguments.map((element) => element.props["data-argument-id"])).toEqual(
			argumentIds,
		);
		expect(currentArguments.map((element) => element.props.value)).toEqual(unsavedSelection.argv);
		expect(callbacks.cancel).toBe(0);
	});

	test("keeps save and reset API effects and callback copy unchanged", async () => {
		renderDialog();
		await runLoadEffect();
		let root = renderDialog();

		saveReply = {
			success: false,
			code: "OPENER_SAVE_FAILED",
			error: "Could not save opener settings.",
		};
		await click(findByText(root, Button, "Save"));
		expect(calls.save).toEqual([customSelection]);
		expect(callbacks.failure).toEqual([
			{ kind: "error", message: "Could not save opener settings.", actions: [] },
		]);
		expect(callbacks.cancel).toBe(0);
		root = renderDialog();
		expect(textContent(root)).toContain("Could not save opener settings.");

		saveReply = { success: true, selection: customSelection };
		await click(findByText(root, Button, "Save"));
		expect(calls.save).toEqual([customSelection, customSelection]);
		expect(callbacks.success).toEqual([
			"Saved. Every pane and caller uses this opener on the next activation.",
		]);
		expect(callbacks.cancel).toBe(1);

		callbacks.cancel = 0;
		callbacks.success.length = 0;
		callbacks.failure.length = 0;
		resetReply = {
			success: false,
			code: "OPENER_RESET_FAILED",
			error: "Could not reset opener settings.",
		};
		await click(findByText(root, Button, "Reset"));
		expect(calls.reset).toBe(1);
		expect(calls.fetch).toBe(1);
		expect(callbacks.failure).toEqual([
			{ kind: "error", message: "Could not reset opener settings.", actions: [] },
		]);
		expect(callbacks.cancel).toBe(0);

		resetReply = { success: true, selection: platformSelection };
		root = renderDialog();
		await click(findByText(root, Button, "Reset"));
		expect(calls.reset).toBe(2);
		expect(calls.fetch).toBe(2);
		expect(callbacks.success).toEqual(["Reset to the system default for every pane and caller."]);
		expect(callbacks.cancel).toBe(0);
		root = renderDialog();
		expect(findByText(root, "strong", "System default")).toBeDefined();
	});

	test("uses one named dialog owner and exact semantic classes without copied mechanics", async () => {
		renderDialog();
		await runLoadEffect();
		const root = renderDialog();

		expect(elements(root).filter((element) => element.type === Dialog)).toHaveLength(1);
		expect(elements(root).filter((element) => element.type === DialogContent)).toHaveLength(1);
		expect(elements(root).filter((element) => element.type === "button")).toHaveLength(0);
		expect(findByText(root, Button, "Reset").props.tone).toBe("quiet");
		expect(findByText(root, Button, "Test").props.tone).toBe("secondary");
		expect(findByText(root, DialogClose, "Cancel")).toBeDefined();
		expect(findByText(root, Button, "Save").props.tone).toBe("primary");

		const summary = elements(root).find(
			(element) => element.props["aria-label"] === "Current opener",
		);
		expect(summary?.props.className).toBe(
			"opener-summary relative grid grid-cols-2 gap-control rounded-panel border border-border bg-surface-subtle p-control-inline",
		);
		const choices = elements(root).find((element) => element.type === "fieldset");
		expect(choices?.props.className).toBe(
			"opener-choices p-0 mt-region grid grid-cols-2 gap-control border-0",
		);

		expect(source).toContain('from "@/ui/dialog"');
		expect(source).toContain('from "@/ui/button"');
		expect(source).toContain('from "@/ui/ui-classnames"');
		expect(source).toContain(
			"outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
		);
		expect(entrypoint).not.toContain(".css");
		expect(fs.existsSync(new URL("../opener-settings.css", import.meta.url))).toBe(false);
		for (const marker of [
			["@base", "ui/react"].join("-"),
			["ra", "dix"].join(""),
			["shell", "Modal"].join("/"),
			"createPortal",
			"addEventListener",
			"removeEventListener",
			"querySelector",
			"data-autofocus",
			"tabIndex",
			"inert",
			"setTimeout",
			"setInterval",
			"style=",
			"btn ",
			"modal-",
		]) {
			expect(source).not.toContain(marker);
		}
		expect(source.match(/<Dialog open=/g)).toHaveLength(1);
		expect(source).not.toMatch(/className=\{`|className={`|style\s*=\s*\{/);
	});
});

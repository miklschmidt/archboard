import { afterAll, afterEach, describe, expect, test } from "bun:test";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { render, screen, userEvent, act, cleanup, waitFor } = await loadRenderedUiTools();
const { WorkbenchComposer, createWorkbenchComposerController } = await import("../index.js");
const { WorkbenchRuntimeProvider } = await import("../../workbench-runtime/index.js");
const support = await import("./model.js");

afterAll(unregisterHappyDom);
afterEach(cleanup);

const RUNNING = support.connected(
	support.snapshot({ timeline: support.timeline([[support.TURN, "inProgress"]]) }),
);

type Mounted = {
	readonly transport: ReturnType<typeof support.fakeComposerTransport>;
	readonly controller: ReturnType<typeof createWorkbenchComposerController>;
};

/**
 * The composer as a pane composes it: inside the runtime provider, with the
 * runtime's `onSubmit` seam bound to the same controller the surface renders
 * from. Every send below records exactly one command, which is also the proof
 * that the reviewed primitive's own send stays suppressed rather than
 * dispatching a second time through that seam.
 */
function mount(options: Parameters<typeof support.fakeComposerTransport>[0] = {}): Mounted {
	const transport = support.fakeComposerTransport(options);
	const controller = createWorkbenchComposerController({ transport });
	render(
		<WorkbenchRuntimeProvider
			onSubmit={controller.submit}
			transport={support.runtimeTransport(transport)}
		>
			<WorkbenchComposer controller={controller} state={transport.state()} />
		</WorkbenchRuntimeProvider>,
	);
	return { transport, controller };
}

function composerInput(name: string): HTMLTextAreaElement {
	const element = screen.getByRole("textbox", { name });
	if (!(element instanceof HTMLTextAreaElement)) throw new Error("the composer is not a textarea");
	return element;
}

function fireComposition(element: Element, type: "compositionstart" | "compositionend"): void {
	act(() => {
		element.dispatchEvent(new window.CompositionEvent(type, { bubbles: true }));
	});
}

describe("the composer's accessible surface", () => {
	test("an idle workhorse names the send it performs", () => {
		mount();
		expect(composerInput("Message the Codex workhorse")).toBeDefined();
		expect(screen.getByRole("button", { name: "Send" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "Interrupt" })).toBeNull();
	});

	test("a running turn renames the input and offers Interrupt beside Steer", () => {
		mount({ state: RUNNING });
		expect(composerInput("Steer the current Codex turn")).toBeDefined();
		expect(screen.getByRole("button", { name: "Steer" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Interrupt" })).toBeDefined();
	});

	test("the composer's own status is announced through a status role", () => {
		mount();
		const announced = screen
			.getAllByRole("status")
			.filter((element) => element.getAttribute("aria-label") === "Codex composer status");
		expect(announced).toHaveLength(1);
		expect(announced[0]?.textContent).toContain("The composer is ready.");
		expect(announced[0]?.className).toBe("sr-only text-muted-foreground");
	});
});

describe("the keyboard the composer owns", () => {
	test("Enter sends the literal start body carrying the typed text", async () => {
		const user = userEvent.setup();
		const { transport } = mount();
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw the module graph.");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(transport.sent).toHaveLength(1);
		});
		expect(transport.sent[0]?.draft).toEqual({
			command: "start",
			threadId: support.THREAD,
			prompt: "Draw the module graph.",
		});
		expect(transport.sent[0]?.target).toEqual(support.commandIntent());
	});

	test("Enter during a running turn sends the literal steer body with its turn id", async () => {
		const user = userEvent.setup();
		const { transport } = mount({ state: RUNNING });
		await user.click(composerInput("Steer the current Codex turn"));
		await user.keyboard("Rename the node too.");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(transport.sent).toHaveLength(1);
		});
		expect(transport.sent[0]?.draft).toEqual({
			command: "steer",
			threadId: support.THREAD,
			turnId: support.TURN,
			prompt: "Rename the node too.",
		});
	});

	test("Shift+Enter writes a second line and sends nothing", async () => {
		const user = userEvent.setup();
		const { transport } = mount();
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("first line");
		await user.keyboard("{Shift>}{Enter}{/Shift}");
		await user.keyboard("second line");
		expect(transport.sent).toHaveLength(0);
		expect(input.value).toBe("first line\nsecond line");
	});

	test("Enter never sends while an IME composition is open, and sends once it ends", async () => {
		const user = userEvent.setup();
		const { transport } = mount();
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("nihongo");
		fireComposition(input, "compositionstart");
		await user.keyboard("{Enter}");
		expect(transport.sent).toHaveLength(0);
		fireComposition(input, "compositionend");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(transport.sent).toHaveLength(1);
		});
	});

	test("clicking Send sends the same body the keyboard would", async () => {
		const user = userEvent.setup();
		const { transport } = mount();
		await user.click(composerInput("Message the Codex workhorse"));
		await user.keyboard("Draw it.");
		await user.click(screen.getByRole("button", { name: "Send" }));
		await waitFor(() => {
			expect(transport.sent).toHaveLength(1);
		});
		expect(transport.sent[0]?.draft).toEqual({
			command: "start",
			threadId: support.THREAD,
			prompt: "Draw it.",
		});
	});

	test("tapping blank composer space focuses the input", async () => {
		const user = userEvent.setup();
		mount();
		const input = composerInput("Message the Codex workhorse");
		const form = input.closest("form");
		if (form === null) throw new Error("the composer has no form");
		expect(document.activeElement).not.toBe(input);
		await user.click(form);
		expect(document.activeElement).toBe(input);
	});

	test("clicking Interrupt sends the literal interrupt body for the turn on screen", async () => {
		const user = userEvent.setup();
		const { transport } = mount({ state: RUNNING });
		await user.click(screen.getByRole("button", { name: "Interrupt" }));
		await waitFor(() => {
			expect(transport.sent).toHaveLength(1);
		});
		expect(transport.sent[0]?.draft).toEqual({
			command: "interrupt",
			threadId: support.THREAD,
			turnId: support.TURN,
		});
	});
});

describe("the draft each outcome leaves behind", () => {
	test("a delivered send clears the composer and renders no message of its own", async () => {
		const user = userEvent.setup();
		mount();
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw the module graph.");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(input.value).toBe("");
		});
		// Nothing optimistic: the submitted text is nowhere in the document,
		// because only a host snapshot can put a turn on screen.
		expect(document.body.textContent).not.toContain("Draw the module graph.");
	});

	test("a not_delivered send keeps the text in the composer", async () => {
		const user = userEvent.setup();
		mount({
			command: async () =>
				support.commandResult({ outcome: "not_delivered", code: "not_ready", message: null }),
		});
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw the module graph.");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(screen.getByText(/cannot send workhorse commands/)).toBeDefined();
		});
		expect(input.value).toBe("Draw the module graph.");
		expect(screen.queryByLabelText("Retained message text with an unknown outcome")).toBeNull();
	});

	test("an unknown outcome retains an inert copy that no control resends", async () => {
		const user = userEvent.setup();
		const { transport } = mount({
			command: async () => support.commandResult({ outcome: "outcome_unknown", code: null }),
		});
		await user.click(composerInput("Message the Codex workhorse"));
		await user.keyboard("Rename the node.");
		await user.keyboard("{Enter}");
		const retained = await waitFor(() => {
			const element = screen.getByLabelText("Retained message text with an unknown outcome");
			if (!(element instanceof HTMLTextAreaElement)) throw new Error("not a textarea");
			return element;
		});
		expect(retained.value).toBe("Rename the node.");
		expect(retained.readOnly).toBe(true);
		await user.click(screen.getByRole("button", { name: "Dismiss this copy" }));
		expect(screen.queryByLabelText("Retained message text with an unknown outcome")).toBeNull();
		expect(transport.sent).toHaveLength(1);
	});
});

describe("pending, focus, and a workbench that cannot take input", () => {
	test("a command in flight disables the composer and refuses a second Enter", async () => {
		const user = userEvent.setup();
		let release: (() => void) | null = null;
		const { transport } = mount({
			command: async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return support.commandResult();
			},
		});
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw it.");
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(input.disabled).toBe(true);
		});
		expect(screen.getByRole("button", { name: "Send" }).getAttribute("data-disabled")).toBe("");
		await user.keyboard("{Enter}");
		expect(transport.sent).toHaveLength(1);
		act(() => {
			release?.();
		});
		await waitFor(() => {
			expect(input.disabled).toBe(false);
		});
	});

	test("focus returns to the composer after a command settles", async () => {
		const user = userEvent.setup();
		let release: (() => void) | null = null;
		mount({
			command: async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return support.commandResult();
			},
		});
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw it.");
		await user.click(screen.getByRole("button", { name: "Send" }));
		// The send control disables itself mid-flight, so focus is nowhere useful.
		await waitFor(() => {
			expect(input.disabled).toBe(true);
		});
		expect(document.activeElement).not.toBe(input);
		act(() => {
			release?.();
		});
		await waitFor(() => {
			expect(document.activeElement).toBe(input);
		});
	});

	test("focus is not taken back from a control outside the composer", async () => {
		const user = userEvent.setup();
		let release: (() => void) | null = null;
		const transport = support.fakeComposerTransport({
			command: async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return support.commandResult();
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		render(
			<WorkbenchRuntimeProvider transport={support.runtimeTransport(transport)}>
				<WorkbenchComposer controller={controller} state={transport.state()} />
				<button type="button">Elsewhere</button>
			</WorkbenchRuntimeProvider>,
		);
		const input = composerInput("Message the Codex workhorse");
		await user.click(input);
		await user.keyboard("Draw it.");
		await user.click(screen.getByRole("button", { name: "Send" }));
		const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
		await user.click(elsewhere);
		act(() => {
			release?.();
		});
		await waitFor(() => {
			expect(input.disabled).toBe(false);
		});
		expect(document.activeElement).toBe(elsewhere);
	});

	test("a workbench that cannot take direct input offers no input at all", () => {
		const transport = support.fakeComposerTransport({
			state: support.reconnecting("Codex is reconnecting."),
		});
		const controller = createWorkbenchComposerController({ transport });
		render(<WorkbenchComposer controller={controller} state={transport.state()} />);
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
		const announced = screen.getByLabelText("Codex composer status");
		expect(announced.textContent).toContain("Codex is reconnecting.");
		expect(announced.textContent).toContain("Wait for Codex to become thread-capable");
	});

	test("an inspect-only link says why it accepts nothing", () => {
		const transport = support.fakeComposerTransport({
			state: support.connected(
				support.snapshot({
					threadLink: support.inspectOnlyLink("A prior child owned this thread."),
				}),
			),
		});
		const controller = createWorkbenchComposerController({ transport });
		render(<WorkbenchComposer controller={controller} state={transport.state()} />);
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.getByLabelText("Codex composer status").textContent).toContain(
			"A prior child owned this thread.",
		);
	});
});

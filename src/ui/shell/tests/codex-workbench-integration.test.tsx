import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { useCallback, useEffect, useState, type ComponentProps } from "react";

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
	type BrowserSnapshot,
} from "../../../shared/codex-browser-model/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import { installFullscreen } from "./codex-workbench-integration-support.js";

registerHappyDom();
const { cleanup, render, screen, userEvent, waitFor, within } = await loadRenderedUiTools();

await mock.module("@excalidraw/excalidraw", () => ({
	exportToSvg: async () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
	getLibraryItemsHash: () => 0,
	mergeLibraryItems: (localItems: readonly unknown[]) => localItems,
	parseLibraryTokensFromUrl: () => null,
	restoreLibraryItems: (items: readonly unknown[]) => items,
}));

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const identity = authorities.identity;
const childId = model.ChildIdSchema.parse(identity.validator.childId);
const epoch = model.ChildEpochSchema.parse(identity.validator.epoch);

interface RecordedCommand {
	readonly command: string;
	readonly threadId?: string;
	readonly turnId?: string;
}

interface FakeWorkbenchTransport {
	readonly transport: BrowserWorkbenchTransport;
	readonly threadId: string;
	readonly turnId: string;
	readonly commands: RecordedCommand[];
	readonly listenerCount: () => number;
}

function fakeTransport(
	paneId: string,
	suffix: string,
	overrides: Partial<BrowserSnapshot> = {},
): FakeWorkbenchTransport {
	const threadId = model.ThreadIdSchema.parse(identity.decoder.adoptThreadId(`thread-${suffix}`));
	const turnId = model.TurnIdSchema.parse(identity.decoder.adoptTurnId(`turn-${suffix}`));
	const itemId = model.ItemIdSchema.parse(identity.decoder.adoptItemId(`item-${suffix}`));
	const approvalId = model.ApprovalIdSchema.parse(
		identity.decoder.adoptApprovalId(`approval-${suffix}`),
	);
	const requestId = model.JsonRpcRequestIdSchema.parse(identity.issuer.mintJsonRpcRequestId());
	const commandId = model.BrowserCommandIdSchema.parse(identity.issuer.mintBrowserCommandId());
	const coordinatorThreadId = model.ThreadIdSchema.parse(
		identity.decoder.adoptThreadId(`coordinator-${suffix}`),
	);
	const snapshot: BrowserSnapshot = model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
			sourcePresentation: "standard",
			status: "active",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: {
			kind: "timeline",
			threadId,
			turns: [
				{
					turnId,
					status: "inProgress",
					items: [{ media: "text", itemId, text: `Working through ${suffix}.` }],
					summary: `Active ${suffix} turn`,
					outputsIncluded: true,
					outputsTruncated: false,
				},
			],
			nextCursor: null,
		},
		queue: { kind: "queue", status: "running", entries: [] },
		settings: [],
		approvals: [
			{
				kind: "approval",
				approvalKind: "command_execution",
				requestId,
				threadId,
				turnId,
				itemId,
				approvalId,
				expiresAtMs: Date.now() + 60_000,
				lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
				binding: {
					child: childId,
					epoch,
					link: paneId,
					target: `${paneId} workhorse`,
					effect: `Run the ${suffix} verification.`,
				},
				spoken: { eligible: true, reason: "eligible" },
				reason: "The command requires approval.",
				command: `bun test ${suffix}`,
				availableDecisions: ["accept", "decline"],
			},
		],
		dynamicApprovals: [],
		semantic: {
			kind: "semantic_delivery",
			threadId,
			delivery: "delivered",
			capturedAtMs: Date.now(),
			freshUntilMs: Date.now() + 60_000,
			reason: null,
		},
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: coordinatorThreadId,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: "Voice is outside the text shell owner.",
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: {
			kind: "command_lease",
			commandId,
			paneId,
			childId,
			epoch,
			state: "active",
			expiresAtMs: Date.now() + 120_000,
		},
		operation: null,
		...overrides,
	});
	const commands: RecordedCommand[] = [];
	const listeners = new Set<() => void>();
	const state = {
		kind: "readiness",
		state: snapshot.readiness.state,
		connection: "connected",
		snapshot,
		sequence: 1,
	} as const satisfies BrowserWorkbenchState;
	const target = { commandId, paneId, childId, epoch, capturedThreadLink: snapshot.threadLink };
	const threadCapable = snapshot.readiness.state === "thread_capable";
	const executable = snapshot.threadLink.state === "executable";
	const transport: BrowserWorkbenchTransport = {
		attach: async () => state,
		detach: async () => undefined,
		close: async () => undefined,
		refresh: async () => {
			throw new Error("Refresh is outside this shell owner.");
		},
		setMediaReady: async () => {
			throw new Error("Media is outside this shell owner.");
		},
		claimLease: async () => snapshot.lease!,
		renewLease: async () => snapshot.lease!,
		releaseLease: async () => null,
		accountRead: async () => {
			throw new Error("Account reads are outside this shell owner.");
		},
		command: async (draft) => {
			commands.push(draft);
			return {
				kind: "command_result",
				commandId,
				outcome: "delivered",
				code: null,
				message: null,
				snapshot,
			};
		},
		captureCommandTarget: () => target,
		snapshot: () => snapshot,
		sequence: () => 1,
		lease: () => snapshot.lease,
		state: () => state,
		capabilities: () => ({
			connected: true,
			readiness: snapshot.readiness.state,
			canReadAccount: true,
			canClaimLease: true,
			canRenewLease: snapshot.lease !== null,
			canReleaseLease: snapshot.lease !== null,
			canCommand: threadCapable && executable,
			canThreadCommands: threadCapable && executable,
			canRealtime: threadCapable && executable,
			supportsCommand: (command) =>
				command === "accountLogin" ||
				command === "accountLoginCancel" ||
				command === "accountLogout"
					? true
					: threadCapable,
		}),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => undefined,
	};
	return { transport, threadId, turnId, commands, listenerCount: () => listeners.size };
}

const transports = [fakeTransport("pane-1", "first"), fakeTransport("pane-1", "reloaded")];
const paneBTransport = fakeTransport("pane-2", "pane-b");
const unboundThreadLink: BrowserSnapshot["threadLink"] = {
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
};
const unboundTransport = fakeTransport("pane-1", "unbound", {
	threadLink: unboundThreadLink,
	timeline: null,
	approvals: [],
	semantic: null,
});
const signedOutTransport = fakeTransport("pane-1", "signed-out", {
	readiness: { kind: "readiness", state: "signed_out" },
	account: { kind: "account", state: "signed_out" },
	threadLink: unboundThreadLink,
	timeline: null,
	approvals: [],
	semantic: null,
	lease: null,
});
let paneOneInitialTransport = transports[0]!.transport;

const canvasPaneUrl = new URL("../../canvas/CanvasPane.tsx", import.meta.url).href;
await mock.module(canvasPaneUrl, () => ({
	CanvasPane(props: ComponentProps<"section"> & Record<string, unknown>) {
		const [generation, setGeneration] = useState(0);
		const paneId = String(props.paneId);
		const transport =
			paneId === "pane-2"
				? paneBTransport.transport
				: generation === 0
					? paneOneInitialTransport
					: transports[1]!.transport;
		const onStatus = props.onStatus as (status: Record<string, unknown>) => void;
		const onAgentState = props.onAgentState as (...args: unknown[]) => void;
		const onWorkbenchTransport = props.onWorkbenchTransport as (
			id: string,
			transport: BrowserWorkbenchTransport | null,
		) => void;
		const reloadTransport = useCallback(() => setGeneration(1), []);
		useEffect(() => {
			onStatus({
				paneId,
				clientId: `${paneId}-client`,
				connected: true,
				board: null,
				boardKey: null,
				elementCount: 7,
				lastChangeAt: null,
				hold: null,
				writtenElsewhere: null,
				doing: [],
			});
			onAgentState(paneId, null, null, async () => ({ outcome: "success" }));
			onWorkbenchTransport(paneId, transport);
			return () => onWorkbenchTransport(paneId, null);
		}, [onAgentState, onStatus, onWorkbenchTransport, paneId, transport]);
		return (
			<section
				aria-label={String(props.label)}
				data-canvas-pane={paneId}
				data-presentation={String(props.presentation)}
			>
				<span>Excalidraw canvas</span>
				<button type="button" onClick={reloadTransport}>
					Reload workbench transport
				</button>
			</section>
		);
	},
}));

const apiUrl = new URL("../../canvas/api.ts", import.meta.url).href;
await mock.module(apiUrl, () => ({
	BoardConflictError: class BoardConflictError extends Error {},
	clearBoard: async () => ({ count: 0 }),
	fetchBoardInfo: async () => null,
	fetchBoardPreview: async () => null,
	fetchBoards: async () => ({ vault: "/test-vault", boards: [], open: [], onScreen: [] }),
	fetchLibrary: async () => ({ items: [] }),
	fetchOpenerSettings: async () => ({
		success: false,
		code: "OUTSIDE_TEST",
		error: "Outside test.",
	}),
	newBoard: async () => {
		throw new Error("New board is outside this owner.");
	},
	openCodeTarget: async () => ({ success: false, code: "OUTSIDE_TEST", error: "Outside test." }),
	openBoard: async () => {
		throw new Error("Open board is outside this owner.");
	},
	putLibrary: async () => ({ success: true }),
	resetOpenerSettings: async () => ({
		success: false,
		code: "OUTSIDE_TEST",
		error: "Outside test.",
	}),
	saveBoard: async () => {
		throw new Error("Save board is outside this owner.");
	},
	saveOpenerSettings: async () => ({
		success: false,
		code: "OUTSIDE_TEST",
		error: "Outside test.",
	}),
	testOpenerSettings: async () => ({
		success: false,
		code: "OUTSIDE_TEST",
		error: "Outside test.",
	}),
}));

const { Shell } = await import("../Shell.js");

afterEach(() => {
	cleanup();
	paneOneInitialTransport = transports[0]!.transport;
	for (const fixture of [...transports, paneBTransport, unboundTransport, signedOutTransport]) {
		fixture.commands.length = 0;
	}
});
afterAll(unregisterHappyDom);

test("keeps a registered thread-capable unbound pane with create and attach choices", async () => {
	paneOneInitialTransport = unboundTransport.transport;
	const user = userEvent.setup();
	render(<Shell />);
	const frame = await screen.findByRole("region", { name: "Agent" });
	expect(frame.getAttribute("data-pane-count")).toBe("1");
	await user.click(screen.getByRole("button", { name: "Expand" }));
	await user.click(screen.getByRole("button", { name: "Open Agent settings" }));
	const link = screen.getByRole("region", { name: "No thread link" });
	expect(
		within(link)
			.getByRole("button", { name: "Create a workhorse thread" })
			.hasAttribute("disabled"),
	).toBeFalse();
	expect(within(link).getByRole("heading", { name: "Attach a listed thread" })).toBeTruthy();
});

test("keeps a registered unbound signed-out pane and its recovery in the frame", async () => {
	paneOneInitialTransport = signedOutTransport.transport;
	const user = userEvent.setup();
	render(<Shell />);
	const frame = await screen.findByRole("region", { name: "Agent" });
	expect(frame.getAttribute("data-pane-count")).toBe("1");
	await user.click(screen.getByRole("button", { name: "Expand" }));
	await user.click(screen.getByRole("button", { name: "Open Agent settings" }));
	const link = screen.getByRole("region", { name: "No thread link" });
	expect(within(link).getByRole("link", { name: "Sign in again" })).toBeTruthy();
});

test("registers one exact pane source, routes fullscreen Stop, and replaces it without disturbing the canvas", async () => {
	const restoreFullscreen = installFullscreen();
	const user = userEvent.setup();
	const mounted = render(<Shell />);
	try {
		const frame = await screen.findByRole("region", { name: "Agent" });
		expect(frame.getAttribute("data-pane-count")).toBe("1");
		expect(screen.getByText("Excalidraw canvas")).toBeTruthy();
		expect(screen.getAllByText("7 elements")).toHaveLength(1);

		let request = screen.getByRole("region", { name: "Application-wide Codex requests" });
		expect(request.querySelector("dd")?.textContent).toBe("Pane A");
		expect(request.textContent).toContain("bun test first");

		await user.click(screen.getByRole("button", { name: "Present Pane A fullscreen" }));
		const dock = await screen.findByRole("toolbar", { name: "Presentation controls" });
		const stop = within(dock).getByRole("button", { name: "Stop" });
		await user.click(stop);
		await waitFor(() => expect(transports[0]!.commands).toHaveLength(1));
		expect(transports[0]!.commands[0]).toMatchObject({
			command: "interrupt",
			threadId: transports[0]!.threadId,
			turnId: transports[0]!.turnId,
		});
		await user.click(screen.getByRole("button", { name: "Reload workbench transport" }));
		await waitFor(() => {
			request = screen.getByRole("region", { name: "Application-wide Codex requests" });
			expect(request.textContent).toContain("bun test reloaded");
		});
		expect(document.querySelectorAll("[data-workbench-frame]")).toHaveLength(1);
		expect(transports[0]!.listenerCount()).toBe(0);
		expect(within(dock).getByLabelText("Active text workbench").textContent).toContain(
			transports[1]!.turnId,
		);

		mounted.unmount();
		expect(transports[1]!.listenerCount()).toBe(0);
	} finally {
		restoreFullscreen();
	}
});

test("transfers fullscreen when the workbench selects Pane B and stops only Pane B", async () => {
	const restoreFullscreen = installFullscreen();
	const user = userEvent.setup();
	render(<Shell />);
	try {
		await screen.findByRole("region", { name: "Agent" });
		await user.click(screen.getByRole("button", { name: "Split" }));
		await waitFor(() =>
			expect(
				document.querySelector("[data-workbench-frame]")?.getAttribute("data-pane-count"),
			).toBe("2"),
		);
		await user.click(screen.getByRole("button", { name: "Present Pane A fullscreen" }));
		const dock = await screen.findByRole("toolbar", { name: "Presentation controls" });
		await user.click(screen.getByRole("button", { name: "Pane B" }));
		await waitFor(() =>
			expect(
				within(dock).getByRole("button", { name: "Present Pane B" }).getAttribute("aria-pressed"),
			).toBe("true"),
		);
		expect(
			document.querySelector("[data-canvas-pane='pane-2']")?.getAttribute("data-presentation"),
		).toBe("current");
		const textSource = within(dock).getByLabelText("Active text workbench");
		expect(textSource.textContent).toContain(paneBTransport.threadId);
		expect(textSource.textContent).toContain(paneBTransport.turnId);
		await user.click(within(dock).getByRole("button", { name: "Stop" }));
		await waitFor(() => expect(paneBTransport.commands).toHaveLength(1));
		expect(paneBTransport.commands[0]).toMatchObject({
			command: "interrupt",
			threadId: paneBTransport.threadId,
			turnId: paneBTransport.turnId,
		});
		expect(transports[0]!.commands).toHaveLength(0);
	} finally {
		restoreFullscreen();
	}
});

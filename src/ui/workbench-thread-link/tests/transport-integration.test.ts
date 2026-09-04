import { describe, expect, test } from "bun:test";

import { createBrowserWorkbenchTransport } from "../../workbench-transport/index.js";
import type { BrowserWorkbenchSocket } from "../../workbench-transport/index.js";
import {
	createThreadLinkController,
	projectThreadLinkPanel,
	THREAD_LINK_MODULE_COMMANDS,
} from "../index.js";
import { executableLink, listed, record, snapshot, threadA, unboundLink } from "./fixtures.js";

type Request = Record<string, unknown>;

/**
 * The smallest socket the real transport will talk to. This owner exists
 * because a hand-listed capability double cannot catch the transport refusing a
 * command the module offers: here the real transport decides.
 */
class GatewaySocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: Request[] = [];
	readyState = 1;
	published = snapshot({ threadLink: unboundLink });
	sequence = 1;
	private leaseId = 0;

	send(raw: string): void {
		const request = JSON.parse(raw) as Request;
		this.sent.push(request);
		queueMicrotask(() => {
			this.answer(request);
		});
	}

	commands(): Request[] {
		return this.sent
			.filter((request) => request.action === "command")
			.map((request) => request.command as Request);
	}

	/** Every published change advances the sequence, the way the gateway does. */
	private publish(next: typeof this.published): void {
		this.published = next;
		this.sequence += 1;
	}

	private reply(request: Request, value: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: true,
					value,
				}),
			}),
		);
	}

	private answer(request: Request): void {
		if (request.action === "subscribe" || request.action === "snapshot") {
			this.reply(request, { kind: "snapshot", sequence: this.sequence, snapshot: this.published });
			return;
		}
		if (request.action === "claimLease") {
			this.leaseId += 1;
			// The gateway publishes the lease in its snapshot too, and the transport
			// treats that as authoritative, so the fake must do the same.
			const lease = {
				kind: "command_lease",
				commandId: `command-${this.leaseId}`,
				paneId: "pane-a",
				childId: "child-a",
				epoch: "epoch-a",
				state: "active",
				expiresAtMs: Date.now() + 60_000,
			} as const;
			this.publish({ ...this.published, lease } as typeof this.published);
			this.reply(request, lease);
			return;
		}
		if (request.action !== "command") return;
		const command = request.command as Request;
		// The gateway answers a refresh by publishing the discovered inventory and
		// a bind by publishing the link it produced.
		if (command.command === "threadLinkRefresh")
			this.publish({ ...this.published, threadCandidates: listed([record()]) });
		if (command.command === "threadLinkAttach")
			this.publish({ ...this.published, threadLink: executableLink(threadA) });
		this.reply(request, {
			kind: "command_result",
			commandId: command.commandId,
			outcome: "delivered",
			code: null,
			message: null,
			snapshot: this.published,
		});
	}

	close(): void {
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

describe("thread link over the real browser transport", () => {
	test("refreshes the list and binds the chosen row on a pane holding no link", async () => {
		const transport = createBrowserWorkbenchTransport();
		const socket = new GatewaySocket();
		try {
			await transport.attach(socket);
			await transport.claimLease();
			const controller = createThreadLinkController({
				capturePane: () => ({ paneId: "pane-a", transport, hostRecoveryIntents: [] }),
			});
			const panel = () =>
				projectThreadLinkPanel({
					paneId: "pane-a",
					state: transport.state(),
					capabilities: transport.capabilities(),
					hostRecoveryIntents: [],
					action: controller.snapshot(),
				});

			// The transport, not a double, decides what a pane with no link may run.
			for (const command of THREAD_LINK_MODULE_COMMANDS)
				expect([command, transport.capabilities().supportsCommand(command)]).toEqual([
					command,
					true,
				]);
			const before = panel();
			expect(before.selection.state).toBe("unknown");
			expect(before.selection.recovery.available).toBeTrue();
			expect(before.create.enabled).toBeTrue();

			expect(await controller.refreshInventory()).toMatchObject({ state: "applied" });
			expect(controller.snapshot().state).toBe("succeeded");
			const listedPanel = panel();
			expect(listedPanel.selection.state).toBe("listed");
			const row = listedPanel.selection.rows[0];
			if (row === undefined) throw new Error("the refreshed list published no row");
			expect(row).toMatchObject({ intent: "attach", outcome: "executable", enabled: true });

			expect(await controller.bind(row)).toMatchObject({ state: "applied" });
			expect(controller.snapshot().state).toBe("succeeded");
			expect(socket.commands().map((command) => command.command)).toEqual([
				"threadLinkRefresh",
				"threadLinkAttach",
			]);
			// The bind named the row the person chose and the lease it was offered
			// under, not a thread id the browser resolved on its own.
			expect(socket.commands()[1]).toMatchObject({
				command: "threadLinkAttach",
				selectionId: row.selectionId,
				threadId: threadA,
				paneId: "pane-a",
				childId: "child-a",
				epoch: "epoch-a",
			});
			expect(panel().currentLink.state).toBe("executable");
		} finally {
			await transport.dispose();
		}
	});

	test("offers no thread-link command before the workbench is thread-capable", async () => {
		const transport = createBrowserWorkbenchTransport();
		const socket = new GatewaySocket();
		socket.published = snapshot({
			threadLink: unboundLink,
			readiness: { kind: "readiness", state: "signed_out" },
			account: { kind: "account", state: "signed_out" },
		});
		try {
			await transport.attach(socket);
			await transport.claimLease();
			const controller = createThreadLinkController({
				capturePane: () => ({ paneId: "pane-a", transport, hostRecoveryIntents: [] }),
			});
			const projected = projectThreadLinkPanel({
				paneId: "pane-a",
				state: transport.state(),
				capabilities: transport.capabilities(),
				hostRecoveryIntents: [],
				action: controller.snapshot(),
			});
			expect(projected.create.enabled).toBeFalse();
			expect(projected.selection.recovery.available).toBeFalse();
			expect(projected.selection.recovery.owner).toBe("none");

			await controller.refreshInventory();
			const settled = controller.snapshot();
			expect(settled.state).toBe("failed");
			expect(settled.state === "failed" ? settled.announcement : "").toContain(
				"not ready for threadLinkRefresh",
			);
			expect(socket.commands()).toEqual([]);
		} finally {
			await transport.dispose();
		}
	});
});

import { afterAll, expect, test } from "bun:test";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";

registerHappyDom();
const { render, screen, userEvent, waitFor } = await loadRenderedUiTools();
const { WorkbenchApprovals } = await import("../index.js");
const { commandApproval, permissionsApproval } = await import("./fixtures.js");
const { commandTarget, connected, NOW, snapshot } = await import("./model.js");

afterAll(unregisterHappyDom);

const fixedNow = (): number => NOW;

type Transport = Parameters<typeof WorkbenchApprovals>[0]["transport"];

function capabilities(): ReturnType<Transport["capabilities"]> {
	return {
		connected: true,
		readiness: "thread_capable",
		canReadAccount: true,
		canClaimLease: true,
		canRenewLease: true,
		canReleaseLease: true,
		canCommand: true,
		canThreadCommands: true,
		canRealtime: true,
		supportsCommand: () => true,
	};
}

function result(): Awaited<ReturnType<Transport["command"]>> {
	return {
		kind: "command_result",
		commandId: commandTarget().commandId,
		outcome: "delivered",
		code: null,
		message: null,
		snapshot: snapshot(),
	};
}

const deferred: { resolve: (() => void) | null } = { resolve: null };

const immediateTransport: Transport = {
	capabilities,
	captureCommandTarget: commandTarget,
	command: async () => result(),
};

const deferredTransport: Transport = {
	capabilities,
	captureCommandTarget: commandTarget,
	command: async () => {
		await new Promise<void>((resolve) => {
			deferred.resolve = resolve;
		});
		return result();
	},
};

/**
 * The one mounted owner for the surface: focus must come back to the heading
 * when a decision the person was standing in stops accepting one, and the
 * reviewed answers must stop being editable while their decision is in flight.
 */
test("returns focus to the approvals heading when the decision it held is settled", async () => {
	const user = userEvent.setup();
	const pending = commandApproval();
	const pendingState = connected(snapshot({ approvals: [pending] }));
	const view = render(
		<WorkbenchApprovals now={fixedNow} state={pendingState} transport={immediateTransport} />,
	);

	const approve = screen.getByRole("button", { name: "Approve" });
	await user.click(approve);
	expect(document.activeElement).toBe(approve);

	const settled = commandApproval({
		requestId: pending.requestId,
		lifecycle: {
			state: "settled",
			decision: "approved",
			outcome: "delivered",
			reason: "Delivered.",
		},
		spoken: { eligible: false, reason: "not_pending" },
	});
	const settledState = connected(snapshot({ approvals: [settled] }));
	view.rerender(
		<WorkbenchApprovals now={fixedNow} state={settledState} transport={immediateTransport} />,
	);

	const heading = screen.getByRole("heading", { name: "Approval requests" });
	await waitFor(() => {
		expect(document.activeElement).toBe(heading);
	});
	expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
	expect(document.querySelector('[data-approvals-focus-return="true"]')?.textContent).toContain(
		"Focus returned to the approvals heading.",
	);
});

test("stops the reviewed answers being edited while their decision is in flight", async () => {
	const user = userEvent.setup();
	const state = connected(snapshot({ approvals: [permissionsApproval()] }));
	render(<WorkbenchApprovals now={fixedNow} state={state} transport={deferredTransport} />);

	const fields = document.querySelector("fieldset");
	expect(fields?.getAttribute("data-approval-fields")).toBe("editable");
	expect(fields?.hasAttribute("disabled")).toBe(false);

	await user.click(screen.getByRole("button", { name: "Grant the reviewed permissions" }));

	await waitFor(() => {
		expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(true);
	});
	expect(document.querySelector("fieldset")?.getAttribute("data-approval-fields")).toBe(
		"read_only",
	);

	deferred.resolve?.();
	await waitFor(() => {
		expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false);
	});
	expect(document.querySelector('[data-approval-result="sent"]')?.textContent).toContain(
		"The host delivered your decision.",
	);
});

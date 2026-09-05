import { expect } from "bun:test";
import { writeFileSync } from "node:fs";

import {
	makeIdentity,
	renderBoardNote,
	vaultPathFor,
} from "../../../../src/runtime/engine/board.ts";
import type { ServerElement } from "../../../../src/runtime/engine/types.ts";
import type { JsonRequestOptions, JsonResponse } from "../../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../../boards/support/pane-websocket.ts";
import { completeElement } from "./elements.ts";

type Request = <T>(path: string, options?: JsonRequestOptions) => Promise<JsonResponse<T>>;

function boundNode(id: string, binding: { repo: string; path: string }): ServerElement {
	return completeElement({
		id,
		type: "rectangle",
		x: 20,
		y: 20,
		width: 160,
		height: 80,
		customData: { archboard: { binding } },
	});
}

export async function assertIntroducedBindingPresentation(options: {
	api: Request;
	base: string;
	vault: string;
	binding: { repo: string; path: string };
}): Promise<void> {
	const { api, base, vault, binding } = options;
	for (const board of ["create-bound", "update-bound", "batch-bound"]) {
		const created = await api("/api/boards/new", { method: "POST", body: { board } });
		expect(created.status, `${board}: ${JSON.stringify(created.body)}`).toBe(200);
	}
	const created = await api<{ element: ServerElement }>("/api/elements?board=create-bound", {
		method: "POST",
		body: boundNode("created-bound", binding),
	});
	expect(created.status, JSON.stringify(created.body)).toBe(200);
	expect(created.body.element.link).toBe(
		"/api/code-targets/open?board=create-bound&element=created-bound",
	);

	const unbound = completeElement({
		id: "updated-bound",
		type: "rectangle",
		x: 20,
		y: 20,
		width: 160,
		height: 80,
	});
	const seeded = await api("/api/elements?board=update-bound", {
		method: "POST",
		body: unbound,
	});
	expect(seeded.status, JSON.stringify(seeded.body)).toBe(200);
	const updated = await api<{ element: ServerElement }>(
		"/api/elements/updated-bound?board=update-bound",
		{
			method: "PUT",
			body: { customData: { archboard: { binding } } },
		},
	);
	expect(updated.status, JSON.stringify(updated.body)).toBe(200);
	expect(updated.body.element.link).toBe(
		"/api/code-targets/open?board=update-bound&element=updated-bound",
	);

	const batch = await api<{ elements: ServerElement[] }>("/api/elements/batch?board=batch-bound", {
		method: "POST",
		body: { elements: [boundNode("batch-created-bound", binding)] },
	});
	expect(batch.status, JSON.stringify(batch.body)).toBe(200);
	expect(batch.body.elements.find(({ id }) => id === "batch-created-bound")?.link).toBe(
		"/api/code-targets/open?board=batch-bound&element=batch-created-bound",
	);

	const identity = makeIdentity({ board: "first-open-bound" });
	writeFileSync(
		vaultPathFor(identity, vault),
		renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				elements: [boundNode("first-open-node", binding)],
				appState: {},
				files: {},
			},
			null,
			identity,
		),
	);
	const pane = await openTestPane(base, api, "first-open-pane", 0, { board: "targets" });
	try {
		const start = pane.since();
		const opened = await api("/api/boards/open", {
			method: "POST",
			body: { board: "first-open-bound", pane: pane.clientId },
		});
		expect(opened.status, JSON.stringify(opened.body)).toBe(200);
		const switched = await waitForPaneMessage(pane, start, "board_switched");
		const elements = (switched?.["elements"] as ServerElement[] | undefined) ?? [];
		expect(elements.find(({ id }) => id === "first-open-node")?.link).toBe(
			"/api/code-targets/open?board=first-open-bound&element=first-open-node",
		);
	} finally {
		await pane.close();
	}
}

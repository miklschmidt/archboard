import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { registerLibraryRoutes } from "../index.js";
import type { LibraryChangedNotification } from "../index.js";

let server: Server | undefined;

afterEach(async () => {
	if (server === undefined) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- Node owns this mutable callback error.
		server?.close((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
	server = undefined;
});

async function startLibraryServer(
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- The test records notifications observed through the public callback.
	notifications: LibraryChangedNotification[],
): Promise<string> {
	const application = express();
	application.use(express.json());
	registerLibraryRoutes(application, {
		// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- The public notification retains its mutable wire shape.
		notifyLibraryChanged(notification) {
			notifications.push(notification);
		},
	});
	server = application.listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => {
		server?.once("listening", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("missing live test port");
	}
	return `http://127.0.0.1:${address.port}`;
}

describe("library routes", () => {
	test("writes canonical items and notifies immediately through the public route", async () => {
		const notifications: LibraryChangedNotification[] = [];
		const baseUrl = await startLibraryServer(notifications);
		const response = await fetch(`${baseUrl}/api/library`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				items: [{ id: "stencil-1", elements: [{ type: "rectangle" }], name: "Service" }],
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true, count: 1 });
		expect(notifications).toHaveLength(1);
		expect(notifications[0]).toMatchObject({
			type: "library_changed",
			items: [{ id: "stencil-1", status: "published", name: "Service" }],
		});
		expect(Number.isNaN(Date.parse(notifications[0]?.timestamp ?? ""))).toBeFalse();

		const readResponse = await fetch(`${baseUrl}/api/library`);
		expect(readResponse.status).toBe(200);
		expect(await readResponse.json()).toMatchObject({
			success: true,
			items: [{ id: "stencil-1", status: "published", name: "Service" }],
		});
	});

	test("rejects malformed writes without notifying", async () => {
		const notifications: LibraryChangedNotification[] = [];
		const baseUrl = await startLibraryServer(notifications);
		const response = await fetch(`${baseUrl}/api/library`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ items: [{ id: 42, elements: [] }] }),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ success: false });
		expect(notifications).toEqual([]);
	});
});

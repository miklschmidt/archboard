import { afterAll, afterEach, describe, expect, test } from "bun:test";
import express from "express";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { LibraryChangedNotification } from "../index.js";

const inheritedVault = process.env["ARCHBOARD_VAULT"];
const selectedVault = mkdtempSync(path.join(tmpdir(), "archboard-library-routes-"));
process.env["ARCHBOARD_VAULT"] = selectedVault;
const expectedLibraryFile = path.join(selectedVault, ".archboard", "library.excalidrawlib");
const { libraryFilePath } = await import("../../../runtime/engine/library.js");
if (libraryFilePath() !== expectedLibraryFile) {
	throw new Error("Library route test did not select its disposable vault before module evaluation.");
}
const { createLibraryRouter } = await import("../index.js");

let server: Server | undefined;

afterEach(async () => {
	if (server === undefined) {
		return;
	}
	const closed = once(server, "close");
	server.close();
	await closed;
	server = undefined;
});

afterAll(() => {
	if (inheritedVault === undefined) {
		delete process.env["ARCHBOARD_VAULT"];
	} else {
		process.env["ARCHBOARD_VAULT"] = inheritedVault;
	}
	if (!selectedVault.startsWith(path.join(tmpdir(), "archboard-library-routes-"))) {
		throw new Error("Refusing to remove an unrecognised library route test directory.");
	}
	rmSync(selectedVault, { recursive: true, force: true });
});

function createNotificationRecorder(): {
	record: (notification: LibraryChangedNotification) => void;
	snapshot: () => readonly LibraryChangedNotification[];
} {
	const notifications: LibraryChangedNotification[] = [];
	return {
		record(notification) {
			notifications.push(notification);
		},
		snapshot() {
			return [...notifications];
		},
	};
}

async function startLibraryServer(
	notifyLibraryChanged: (notification: LibraryChangedNotification) => void,
): Promise<string> {
	const application = express();
	application.use(express.json());
	application.use(createLibraryRouter({ notifyLibraryChanged }));
	server = application.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("missing live test port");
	}
	return `http://127.0.0.1:${address.port}`;
}

describe("library routes", () => {
	test("writes canonical items and notifies immediately through the public route", async () => {
		const recorder = createNotificationRecorder();
		const baseUrl = await startLibraryServer(recorder.record);
		const response = await fetch(`${baseUrl}/api/library`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				items: [{ id: "stencil-1", elements: [{ type: "rectangle" }], name: "Service" }],
			}),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true, count: 1 });
		const notifications = recorder.snapshot();
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
			file: expectedLibraryFile,
			items: [{ id: "stencil-1", status: "published", name: "Service" }],
		});
		expect(existsSync(expectedLibraryFile)).toBeTrue();
	});

	test("rejects malformed writes without notifying", async () => {
		const recorder = createNotificationRecorder();
		const baseUrl = await startLibraryServer(recorder.record);
		const response = await fetch(`${baseUrl}/api/library`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ items: [{ id: 42, elements: [] }] }),
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ success: false });
		expect(recorder.snapshot()).toEqual([]);
	});
});

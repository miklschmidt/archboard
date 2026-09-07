// The Vite server that serves the fixture page and the canonical persisted
// board it renders, acquired and released with the same audit discipline as
// the renderer.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createServer, type ViteDevServer } from "vite";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { projectPreviewSnapshot } from "@/ui/board-preview";
import { readNote } from "@/runtime/engine/board-io";
import { isBlockId } from "@/shared/ids/ids";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { fixtureNote, fixtureRoot } from "./proof-environment.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { errorMessage, isRecord, type JsonRecord } from "./proof-values.ts";
import {
	injectAcquisitionFailure,
	loopbackPortIsAvailable,
	reserveLoopbackPort,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./renderer-process.ts";

type FixtureAcquisitionFailure = "before-vite-create" | "after-vite-create" | "after-vite-listen";

interface FixtureCleanupAudit {
	port: number;
	portReleased: boolean;
	serverCreated: boolean;
	closeCalled: boolean;
	serverListening: boolean;
	watcherWatchedPaths: number;
	closeError: string | null;
	clean: boolean;
}

/** Fixture acquisition failed at a stage, after cleanup ran. */
class FixtureAcquisitionError extends Error {
	readonly stage: string;
	readonly cleanup: FixtureCleanupAudit;

	/**
	 * Describe the failed acquisition.
	 * @param stage The stage that failed.
	 * @param cleanup The cleanup audit that followed.
	 * @param cause The underlying error.
	 */
	constructor(stage: string, cleanup: FixtureCleanupAudit, cause: unknown) {
		super(`Fixture acquisition failed at ${stage}; cleanup=${JSON.stringify(cleanup)}`, { cause });
		this.name = "FixtureAcquisitionError";
		this.stage = stage;
		this.cleanup = cleanup;
	}
}

/**
 * Whether a persisted file entry is a complete PNG export file under its id.
 * @param id The file id it is stored under.
 * @param file The persisted file record.
 * @returns Whether every export field is present and consistent.
 */
function isPngExportFile(id: string, file: JsonRecord): boolean {
	const dataUrl = file["dataURL"];
	return (
		file["id"] === id &&
		file["mimeType"] === "image/png" &&
		typeof dataUrl === "string" &&
		dataUrl.startsWith("data:image/png;base64,") &&
		typeof file["created"] === "number"
	);
}

/**
 * Validate persisted files as Excalidraw export files.
 * @param files The persisted files keyed by id.
 * @returns The same files typed for export.
 * @throws {Error} When any file is incomplete.
 */
function exportFiles(files: Record<string, unknown>): BinaryFiles {
	for (const [id, raw] of Object.entries(files)) {
		if (!isRecord(raw)) {
			throw new Error(`Persisted file ${id} is invalid.`);
		}
		if (!isPngExportFile(id, raw)) {
			throw new Error(`Persisted file ${id} is not a complete PNG export file.`);
		}
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every entry was validated above; Excalidraw brands FileId and DataURL nominally
	return files as unknown as BinaryFiles;
}

/**
 * Whether the fixture's service, label and arrow kept their bindings through the read.
 * @param elements The projected scene elements.
 * @returns Whether the label is bound to the service and the arrow joins service to store.
 */
function hasBoundFixtureRelationships(elements: readonly NonDeletedExcalidrawElement[]): boolean {
	const byId = new Map(elements.map((element) => [element.id, element]));
	return (
		hasLabelBinding(byId.get("svc"), byId.get("label")) && joinsServiceToStore(byId.get("arrow"))
	);
}

/**
 * Whether the fixture's label is a text element contained by the service, bound both ways.
 * @param service The service element, when present.
 * @param label The label element, when present.
 * @returns Whether the container binding survived the read.
 */
function hasLabelBinding(
	service: NonDeletedExcalidrawElement | undefined,
	label: NonDeletedExcalidrawElement | undefined,
): boolean {
	return (
		service?.boundElements?.some((binding) => binding.id === "label") === true &&
		label?.type === "text" &&
		label.containerId === "svc"
	);
}

/**
 * Whether the fixture's arrow still binds the service to the store.
 * @param arrow The arrow element, when present.
 * @returns Whether both endpoint bindings survived the read.
 */
function joinsServiceToStore(arrow: NonDeletedExcalidrawElement | undefined): boolean {
	return (
		arrow?.type === "arrow" &&
		arrow.startBinding?.elementId === "svc" &&
		arrow.endBinding?.elementId === "store"
	);
}

/**
 * Read the canonical persisted board and project it to the render input the
 * fixture page fetches.
 * @returns The elements, files and app state.
 * @throws {Error} When the fixture is unreadable or lost elements, ids or bindings.
 */
function loadPersistedRenderInput(): JsonRecord {
	const content = readNote(fixtureNote);
	if (!content) {
		throw new Error(`Canonical persisted board fixture cannot be read: ${fixtureNote}`);
	}
	const snapshot = projectPreviewSnapshot({
		board: "render-proof",
		fingerprint: "canonical-fixture",
		elements: Array.from(content.elements.values()),
		files: exportFiles(Object.fromEntries(content.files)),
	});
	if (snapshot.elements.length !== 9 || Object.keys(snapshot.files).length !== 1) {
		throw new Error("Canonical board read did not preserve the expected elements and file.");
	}
	if (!snapshot.elements.every((element) => isBlockId(element.id))) {
		throw new Error("Canonical persisted board fixture contains an invalid block id.");
	}
	if (!hasBoundFixtureRelationships(snapshot.elements)) {
		throw new Error(
			"Canonical persisted board fixture lost its bound label or arrow relationship.",
		);
	}
	return {
		elements: snapshot.elements,
		files: exportFiles(snapshot.files),
		appState: { exportBackground: true, viewBackgroundColor: "#f8fafc" },
	};
}

/**
 * Prove the note reader refuses a board with an unknown element type.
 * @param output The proof's output directory, where the malformed copy is written.
 * @returns The name of the error the reader threw.
 * @throws {Error} When the malformed board was accepted.
 */
async function rejectMalformedPersistedBoard(output: string): Promise<string> {
	const malformed = join(output, "malformed-board.excalidraw.md");
	const source = readFileSync(fixtureNote, "utf8");
	await Bun.write(malformed, source.replace('"type": "rectangle"', '"type": "not-a-shape"'));
	try {
		readNote(malformed);
		throw new Error("Malformed persisted board was accepted.");
	} catch (error) {
		if (error instanceof Error && error.message === "Malformed persisted board was accepted.") {
			throw error;
		}
		return error instanceof Error ? error.name : String(error);
	} finally {
		rmSync(malformed, { force: true });
	}
}

/** The Vite server serving the fixture page, and its audited close. */
class FixtureServerOwner {
	#closed = false;
	readonly server: ViteDevServer;
	readonly port: number;

	/**
	 * Own a created server.
	 * @param server The Vite server.
	 * @param port The port it was told to bind.
	 */
	constructor(server: ViteDevServer, port: number) {
		this.server = server;
		this.port = port;
	}

	/**
	 * The fixture page URL.
	 * @returns The loopback URL of chromium.html.
	 */
	get url(): string {
		return `http://127.0.0.1:${this.port}/chromium.html`;
	}

	/**
	 * Close the server and prove it stopped listening, watching and holding its port.
	 * @returns The cleanup audit.
	 */
	async close(): Promise<FixtureCleanupAudit> {
		let closeError: string | null = null;
		try {
			await this.server.close();
			this.#closed = true;
		} catch (error) {
			closeError = errorMessage(error);
		}
		return this.audit(closeError);
	}

	/**
	 * Inspect the server after closing.
	 * @param closeError The close failure, if any.
	 * @returns The cleanup audit.
	 */
	private audit(closeError: string | null): FixtureCleanupAudit {
		const serverListening = Boolean(this.server.httpServer?.listening);
		const watcherWatchedPaths = Object.keys(this.server.watcher.getWatched()).length;
		const portReleased = loopbackPortIsAvailable(this.port);
		const clean =
			this.#closed &&
			!serverListening &&
			watcherWatchedPaths === 0 &&
			portReleased &&
			closeError === null;
		return {
			port: this.port,
			portReleased,
			serverCreated: true,
			closeCalled: this.#closed,
			serverListening,
			watcherWatchedPaths,
			closeError,
			clean,
		};
	}
}

/**
 * The cleanup audit for a fixture that failed before its server existed.
 * @param port The reserved port.
 * @returns The audit; clean when the port is free again.
 */
function unownedFixtureCleanup(port: number): FixtureCleanupAudit {
	const portReleased = loopbackPortIsAvailable(port);
	return {
		port,
		portReleased,
		serverCreated: false,
		closeCalled: false,
		serverListening: false,
		watcherWatchedPaths: 0,
		closeError: null,
		clean: portReleased,
	};
}

/**
 * Serve the render input, dropping the embedded image for the missing-image case.
 * @param input The render input.
 * @param request The HTTP request.
 * @param response The HTTP response.
 * @param next Passes a non-GET request on.
 */
function serveRenderInput(
	input: JsonRecord,
	request: IncomingMessage,
	response: ServerResponse,
	next: () => void,
): void {
	if (request.method !== "GET") {
		next();
		return;
	}
	const missingImage =
		new URL(request.url ?? "/", "http://localhost").searchParams.get("case") === "missing-image";
	response.statusCode = 200;
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(missingImage ? { ...input, files: {} } : input));
}

/**
 * Create the Vite server for the fixture directory on a reserved port.
 * @param input The render input to serve at /render-input.json.
 * @param port The reserved port.
 * @returns The created (not yet listening) server.
 */
async function createFixtureServer(input: JsonRecord, port: number): Promise<ViteDevServer> {
	return await createServer({
		root: fixtureRoot,
		logLevel: "error",
		server: { host: "127.0.0.1", port, strictPort: true },
		plugins: [
			{
				name: "archboard-server-rendering-input",
				/**
				 * Mount the render-input route.
				 * @param vite The server being configured.
				 */
				configureServer(vite) {
					vite.middlewares.use("/render-input.json", (request, response, next) => {
						serveRenderInput(input, request, response, next);
					});
				},
			},
		],
	});
}

/**
 * Acquire the fixture server, cleaning up when a stage fails.
 * @param input The render input to serve.
 * @param injectedFailure The acquisition stage the proof asked to fail, if any.
 * @returns The listening server.
 * @throws {FixtureAcquisitionError} When a stage fails and cleanup was clean.
 * @throws {AggregateError} When a stage fails and cleanup leaked.
 */
async function startFixtureServer(
	input: JsonRecord,
	injectedFailure?: FixtureAcquisitionFailure,
): Promise<FixtureServerOwner> {
	const port = reserveLoopbackPort();
	let owner: FixtureServerOwner | null = null;
	let stage = "before-vite-create";
	try {
		injectAcquisitionFailure("before-vite-create", injectedFailure);
		stage = "vite-create";
		owner = new FixtureServerOwner(await createFixtureServer(input, port), port);
		stage = "after-vite-create";
		injectAcquisitionFailure("after-vite-create", injectedFailure);
		stage = "vite-listen";
		await owner.server.listen();
		stage = "after-vite-listen";
		injectAcquisitionFailure("after-vite-listen", injectedFailure);
		return owner;
	} catch (error) {
		const cleanup = owner ? await owner.close() : unownedFixtureCleanup(port);
		const acquisitionFailure = new FixtureAcquisitionError(stage, cleanup, error);
		if (!cleanup.clean) {
			throw new AggregateError(
				[
					acquisitionFailure,
					new Error(`Partial fixture acquisition leaked: ${JSON.stringify(cleanup)}`),
				],
				"Partial fixture acquisition cleanup failed.",
				{ cause: error },
			);
		}
		throw acquisitionFailure;
	}
}

export {
	FixtureAcquisitionError,
	FixtureServerOwner,
	loadPersistedRenderInput,
	rejectMalformedPersistedBoard,
	startFixtureServer,
	type FixtureAcquisitionFailure,
	type FixtureCleanupAudit,
};

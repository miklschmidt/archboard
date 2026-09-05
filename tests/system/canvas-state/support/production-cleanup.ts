import { expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import {
	createServer as createNetServer,
	type Server as NetServer,
	type Socket as NetSocket,
} from "node:net";

import { processExists, waitForProcessExit } from "../../support/owned-canvas.ts";

interface ProcessRecord {
	readonly kind?: string;
	readonly pid?: number;
}

function processRecords(logPath: string): ProcessRecord[] {
	if (!existsSync(logPath)) {
		return [];
	}
	return readFileSync(logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as ProcessRecord);
}

async function assertProcessesStopped(records: readonly ProcessRecord[]): Promise<void> {
	const pids = [
		...new Set(records.flatMap((record) => (record.pid === undefined ? [] : [record.pid]))),
	];
	for (const pid of pids) {
		if (processExists(pid)) {
			await waitForProcessExit(pid);
		}
		expect(processExists(pid), `pid ${pid}`).toBeFalse();
	}
}

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) {
		return;
	}
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) =>
		server.close((error) =>
			error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
				? reject(error)
				: resolve(),
		),
	);
}

interface LoopbackPeer {
	readonly base: string;
	readonly server: NetServer;
	readonly close: () => Promise<void>;
}

function baseFor(server: NetServer): string {
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("The loopback peer has no TCP port.");
	}
	return `http://127.0.0.1:${address.port}`;
}

async function listenLoopbackPeer(
	onConnection: (socket: NetSocket) => void,
): Promise<LoopbackPeer> {
	const sockets = new Set<NetSocket>();
	const server = createNetServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		onConnection(socket);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	return {
		base: baseFor(server),
		server,
		close: async () => {
			for (const socket of sockets) {
				socket.destroy();
			}
			if (!server.listening) {
				return;
			}
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error === undefined ? resolve() : reject(error))),
			);
		},
	};
}

async function closedLoopbackEndpoint(): Promise<string> {
	const reservation = await listenLoopbackPeer((socket) => socket.destroy());
	const base = reservation.base;
	await reservation.close();
	return base;
}

const pane = (clientId: string, primary: boolean, focused: boolean) => ({
	clientId,
	paneId: `${clientId}-pane`,
	primary,
	focused,
	elementCount: 0,
	board: "scratch",
	rect: { x: 0, y: 0, width: 1280, height: 800 },
	viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
});

export {
	type ProcessRecord,
	processRecords,
	assertProcessesStopped,
	closeServer,
	type LoopbackPeer,
	listenLoopbackPeer,
	closedLoopbackEndpoint,
	pane,
};

import { createServer } from "node:net";
import { join } from "node:path";
import { holdBoard } from "#runtime/store/lock/acquisition.ts";
import { releaseHold } from "#runtime/store/lock/lease-state.ts";
async function lockMode(): Promise<void> {
	const vault = process.env["ARCHBOARD_TEST_LOCK_VAULT"];
	if (!vault) {
		throw new Error("ARCHBOARD_TEST_LOCK_VAULT is required.");
	}
	const board = process.env["ARCHBOARD_TEST_LOCK_BOARD"] ?? "resource-cleanup";
	const holderId = process.env["ARCHBOARD_TEST_LOCK_HOLDER"] ?? "resource-owner";
	const hold = await holdBoard({
		vault,
		board,
		holder: { id: holderId, kind: "agent" },
		waitMs: 0,
	});
	const lockFile = join(vault, ".archboard/locks", `${board}.lock`);
	const port = Number(process.env["ARCHBOARD_TEST_STUBBORN_PORT"]) || undefined;
	const server = port ? createServer((socket) => socket.end()) : undefined;
	if (server) {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, "127.0.0.1", resolve);
		});
	}
	// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
	console.log(JSON.stringify({ pid: process.pid, lockFile, process: hold.holder.process, port }));
	const renewal = setInterval(() => {
		void holdBoard({ vault, board, holder: { id: holderId, kind: "agent" }, waitMs: 0 });
	}, 800);
	const stop = () => {
		clearInterval(renewal);
		releaseHold(vault, board, holderId);
		if (server) {
			server.close(() => process.exit(0));
		} else {
			process.exit(0);
		}
	};
	process.on("SIGTERM", process.env["ARCHBOARD_TEST_IGNORE_TERM"] === "1" ? () => {} : stop);
	process.on("SIGINT", stop);
}

await lockMode();

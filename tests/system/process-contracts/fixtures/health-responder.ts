import { createServer } from "node:http";

interface HealthRequest {
	readonly url?: string;
}

interface HealthResponse {
	readonly writeHead: (statusCode: number, headers?: Readonly<Record<string, string>>) => HealthResponse;
	readonly end: (chunk?: string) => HealthResponse;
}

const port = Number(process.env["PORT"]);
const reportedPid = Number(process.env["REPORTED_PID"] ?? process.pid);
const lateHeldBoard = process.env["ARCHBOARD_TEST_LATE_HELD_BOARD"];
let stopWasRefused = false;
const server = createServer((...args: readonly [HealthRequest, HealthResponse]) => {
	const [request, response] = args;
	if (request.url === "/health") {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(
			JSON.stringify({
				pid: reportedPid,
				service: "mcp-excalidraw-canvas",
					...(lateHeldBoard !== undefined && lateHeldBoard.length > 0 && stopWasRefused
					? {
							held_boards: [
								{
									board: lateHeldBoard,
									message:
										`"${lateHeldBoard}" stopped saving. Pick one:\n` +
										`  reload     -> archboard browser show ${lateHeldBoard} --pane <spec> --reload\n` +
										`  overwrite  -> archboard board save --board ${lateHeldBoard} --force\n` +
										`  elsewhere  -> archboard board save --board ${lateHeldBoard} --name <new-name>`,
								},
							],
						}
					: {}),
			}),
		);
		return;
	}
	response.writeHead(404).end();
});
server.listen(port, "127.0.0.1", () => {
	process.stdout.write(`${JSON.stringify({ pid: process.pid, port })}\n`);
});
const stop = (): void => {
	server.close(() => process.exit(0));
};
process.on("SIGTERM", () => {
	if (lateHeldBoard !== undefined && lateHeldBoard.length > 0 && !stopWasRefused) {
		stopWasRefused = true;
		return;
	}
	stop();
});
process.on("SIGINT", () => {
	stop();
});

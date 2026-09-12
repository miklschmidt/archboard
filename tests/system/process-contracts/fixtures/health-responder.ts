import { createServer } from "node:http";
import type { RequestListener } from "node:http";

const port = Number(process.env["PORT"]);
const reportedPid = Number(process.env["REPORTED_PID"] ?? process.pid);
const respondToHealth: RequestListener = (request, response) => {
	if (request.url === "/health") {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(
			JSON.stringify({
				pid: reportedPid,
				service: "mcp-excalidraw-canvas",
			}),
		);
		return;
	}
	response.writeHead(404).end();
};
const server = createServer(respondToHealth);
server.listen(port, "127.0.0.1", () => {
	process.stdout.write(`${JSON.stringify({ pid: process.pid, port })}\n`);
});
const stop = (): void => {
	server.close(() => process.exit(0));
};
process.on("SIGTERM", () => {
	stop();
});
process.on("SIGINT", () => {
	stop();
});

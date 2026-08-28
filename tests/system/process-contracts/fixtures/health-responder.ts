import { createServer } from "node:http";

const port = Number(process.env.PORT);
const reportedPid = Number(process.env.REPORTED_PID ?? process.pid);
const server = createServer((request, response) => {
	if (request.url === "/health") {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify({ pid: reportedPid, service: "mcp-excalidraw-canvas" }));
		return;
	}
	response.writeHead(404).end();
});
server.listen(port, "127.0.0.1", () =>
	// eslint-disable-next-line no-console -- stdout is the peer readiness protocol.
	console.log(JSON.stringify({ pid: process.pid, port })),
);
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

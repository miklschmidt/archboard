import { createServer } from "node:net";

// A picked port stays free only by luck, because a server takes it after the probe lets it go. So
// these ports sit below the range the kernel hands to port 0 and to outgoing connections, and each
// process has its own, which keeps workers and gates of other checkouts apart.
const FIRST_PORT = 20_000;
const PORTS_EACH = 10;
const PROCESSES = 1_276;

let turn = 0;

/**
 * Whether a loopback port takes a listener now.
 * @param port The port.
 * @returns True when it does.
 */
async function binds(port: number): Promise<boolean> {
	const probe = createServer();
	const bound = await new Promise<boolean>((resolve) => {
		probe.once("error", () => resolve(false));
		probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => resolve(true));
	});
	if (bound) await new Promise((resolve) => probe.close(resolve));
	return bound;
}

/**
 * The next loopback port of this process that is free.
 * @returns The port.
 */
async function freeLoopbackPort(): Promise<number> {
	const slot = turn++ % PORTS_EACH;
	const port = FIRST_PORT + (process.pid % PROCESSES) * PORTS_EACH + slot;
	return (await binds(port)) ? port : freeLoopbackPort();
}

export { freeLoopbackPort };

import { createServer } from "node:net";
import path from "node:path";

import { z } from "zod";

const HealthSchema = z.looseObject({ pid: z.number().int().positive() });
const ReadySchema = z.looseObject({ pid: z.number().int().positive() });

type ChildEnvironment = Record<string, string | undefined>;

/**
 * The environment of a child that owns nothing of the caller's: its own home,
 * state directory (and so its own registry) and log under the root.
 * @param root The directory the child owns.
 * @param inherited The environment the child would otherwise inherit; only its PATH is kept.
 * @returns The environment.
 */
function sanitizedEnvironment(
	root: string,
	inherited: Readonly<ChildEnvironment> = process.env,
): ChildEnvironment {
	const env: ChildEnvironment = inherited["PATH"] === undefined ? {} : { PATH: inherited["PATH"] };
	return {
		...env,
		HOME: path.join(root, "home"),
		XDG_STATE_HOME: path.join(root, "state"),
		LOG_FILE_PATH: path.join(root, "archboard.log"),
		LOG_LEVEL: "error",
		NO_COLOR: "1",
	};
}

async function availablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Port probe returned no TCP port.");
	}
	await new Promise<void>((resolve, reject) => {
		server.close((...errors: readonly [Readonly<Error>?]) => {
			const [error] = errors;
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
	return address.port;
}

async function portIsReusable(port: number): Promise<boolean> {
	const server = createServer();
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
		});
		return true;
	} catch {
		return false;
	} finally {
		if (server.listening) {
			await new Promise<void>((resolve) => {
				server.close(() => {
					resolve();
				});
			});
		}
	}
}

export { HealthSchema, ReadySchema, availablePort, portIsReusable, sanitizedEnvironment };
export type { ChildEnvironment };

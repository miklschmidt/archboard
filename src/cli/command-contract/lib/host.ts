import fs from "fs";
import path from "path";
import { boardHoldSeen } from "../../../runtime/engine/canvas-client.js";
import type { PendingArtifact } from "../contract.js";

export interface CommandHost {
	readStdin(): Promise<string>;
	readTextFile(file: string): string;
	readOptionalTextFile(file: string): string | undefined;
	resolvePath(file: string): string;
	writeArtifact(artifact: PendingArtifact): void;
	writeStdout(value: string | Uint8Array): void;
	writeStderr(value: string): void;
	held(): unknown;
}

export const processCommandHost: CommandHost = {
	async readStdin() {
		if (process.stdin.isTTY) return "";
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks).toString("utf8");
	},
	readTextFile(file) {
		return fs.readFileSync(file, "utf8");
	},
	readOptionalTextFile(file) {
		try {
			return fs.readFileSync(file, "utf8");
		} catch {
			return undefined;
		}
	},
	resolvePath(file) {
		return path.resolve(file);
	},
	writeArtifact(artifact) {
		if (artifact.encoding === "binary") {
			fs.writeFileSync(artifact.path, artifact.content);
			return;
		}
		fs.writeFileSync(artifact.path, String(artifact.content), "utf8");
	},
	writeStdout(value) {
		process.stdout.write(value);
	},
	writeStderr(value) {
		process.stderr.write(value);
	},
	held() {
		return boardHoldSeen();
	},
};

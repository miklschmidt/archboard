import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { boardHoldSeen } from "../../../runtime/engine/canvas-client.js";
import { writeFileAtomic } from "../../../runtime/engine/atomic-write.js";
import type { PendingArtifact } from "../contract.js";

export const processCommandHost = {
	async readStdin() {
		if (process.stdin.isTTY) return "";
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks).toString("utf8");
	},
	readTextFile(file: string) {
		return fs.readFileSync(file, "utf8");
	},
	readOptionalTextFile(file: string) {
		try {
			return fs.readFileSync(file, "utf8");
		} catch {
			return undefined;
		}
	},
	resolvePath(file: string) {
		return path.resolve(file);
	},
	async prompt(question: string, fallback: string) {
		if (!process.stdin.isTTY) return fallback;
		const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
		try {
			const answer = (await rl.question(`${question}\n  [${fallback}]: `)).trim();
			return answer || fallback;
		} finally {
			rl.close();
		}
	},
	writeArtifact(artifact: PendingArtifact) {
		if (artifact.encoding === "files") {
			for (const file of artifact.files) {
				writeFileAtomic(path.join(artifact.path, file.name), Buffer.from(file.content));
			}
			writeFileAtomic(path.join(artifact.path, artifact.manifest.name), artifact.manifest.content);
			return;
		}
		if (artifact.encoding === "binary") {
			fs.writeFileSync(artifact.path, artifact.content);
			return;
		}
		fs.writeFileSync(artifact.path, String(artifact.content), "utf8");
	},
	writeStdout(value: string | Uint8Array) {
		process.stdout.write(value);
	},
	writeStderr(value: string) {
		process.stderr.write(value);
	},
	setExitCode(value: number) {
		process.exitCode = value;
	},
	held() {
		return boardHoldSeen();
	},
};

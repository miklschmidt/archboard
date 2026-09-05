import { launchOpener } from "../../../../src/server/code-opener/index.ts";

const [encoded] = process.argv.slice(2);
if (encoded === undefined || encoded.length === 0) {
	throw new Error("launcher-owner requires one JSON command argument");
}
const parsed: unknown = JSON.parse(encoded);
if (
	typeof parsed !== "object" ||
	parsed === null ||
	!("executable" in parsed) ||
	typeof parsed.executable !== "string" ||
	!("argv" in parsed) ||
	!Array.isArray(parsed.argv) ||
	!parsed.argv.every((argument: unknown) => typeof argument === "string")
) {
	throw new Error("launcher-owner received an invalid JSON command argument");
}
const command = { executable: parsed.executable, argv: parsed.argv };
const result = await launchOpener(command);
if (!result.ok) {
	throw new Error(`${result.code}: ${result.error}`);
}

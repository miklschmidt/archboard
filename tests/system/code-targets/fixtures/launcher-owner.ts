import { launchOpener } from "../../../../src/server/code-opener/index.ts";

const encoded = process.argv[2];
if (!encoded) throw new Error("launcher-owner requires one JSON command argument");
const command = JSON.parse(encoded) as { executable: string; argv: string[] };
const result = await launchOpener(command);
if (!result.ok) throw new Error(`${result.code}: ${result.error}`);

import { requestOf } from "#tests/runtime/support/reply.ts";
import { readFileSync } from "node:fs";
import { installArchitectureModel } from "@archboard/model-store";
const vault = process.argv[2];
const file = process.argv[3];
if (vault === undefined || file === undefined) throw new Error("Fixture arguments are required.");
process.stdout.write(
	JSON.stringify(
		await installArchitectureModel(
			vault,
			requestOf("import", JSON.parse(readFileSync(file, "utf8"))),
		),
	) + "\n",
);

import { readFileSync } from "node:fs";
import { importArchitectureModel } from "@archboard/board/store-write";
import { ArchitectureImportRequestSchema } from "@archboard/board/model";
const vault = process.argv[2];
const file = process.argv[3];
if (vault === undefined || file === undefined) throw new Error("Fixture arguments are required.");
process.stdout.write(
	JSON.stringify(
		await importArchitectureModel(
			vault,
			ArchitectureImportRequestSchema.parse(JSON.parse(readFileSync(file, "utf8"))),
		),
	) + "\n",
);

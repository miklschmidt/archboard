import { readFileSync } from "node:fs";
import { editArchitectureModule } from "@archboard/board/store-write";
import { ArchitectureModuleEditSchema } from "@archboard/board/model";
const vault = process.argv[2];
const request = process.argv[3];
if (vault === undefined || request === undefined) throw new Error("Fixture arguments are required");
console.log(
	JSON.stringify(
		await editArchitectureModule(
			vault,
			ArchitectureModuleEditSchema.parse(JSON.parse(readFileSync(request, "utf8"))),
		),
	),
);

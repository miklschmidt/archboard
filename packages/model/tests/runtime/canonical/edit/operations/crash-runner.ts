import { readFileSync } from "node:fs";
import { editArchitectureModule } from "@archboard/model/store-write";
import { architectureModuleEditSchema } from "@archboard/model/contract";
const vault = process.argv[2];
const request = process.argv[3];
if (vault === undefined || request === undefined) throw new Error("Fixture arguments are required");
process.stdout.write(
	JSON.stringify(
		await editArchitectureModule(
			vault,
			architectureModuleEditSchema().parse(JSON.parse(readFileSync(request, "utf8"))),
		),
	) + "\n",
);

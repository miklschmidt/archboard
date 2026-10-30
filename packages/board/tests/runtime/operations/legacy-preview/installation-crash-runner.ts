import { readFileSync } from "node:fs";
import { migrateArchitectureModel } from "@archboard/board/store-write";
const result = await migrateArchitectureModel(
	process.argv[2]!,
	JSON.parse(readFileSync(process.argv[3]!, "utf8")),
);
process.stdout.write(JSON.stringify(result));

import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "apps/workbench-example");
const output = path.join(root, "dist/workbench-example");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await Bun.build({
	entrypoints: [path.join(source, "src/main.tsx")],
	target: "browser",
	outdir: output,
	naming: "app.js",
	minify: true,
	define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) throw new AggregateError(result.logs, "The workbench browser build failed.");
await copyFile(path.join(source, "index.html"), path.join(output, "index.html"));
await copyFile(path.join(source, "src/ui/theme/app.css"), path.join(output, "app.css"));
console.log(`Built the standalone workbench browser in ${output}.`);

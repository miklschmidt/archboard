import path from "node:path";
import { API } from "typescript/unstable/async";
import type * as ts from "typescript/unstable/ast";

export async function parseModuleSources(
	repoRoot: string,
	openFiles: string[],
): Promise<Map<string, ts.SourceFile>> {
	const parsed = new Map<string, ts.SourceFile>();
	const compiler = new API({ cwd: repoRoot });
	try {
		const snapshot = await compiler.updateSnapshot({
			openProjects: [path.join(repoRoot, "tsconfig.json")],
			openFiles,
		});
		for (const project of snapshot.getProjects())
			for (const file of await project.program.getSourceFileNames()) {
				const source = await project.program.getSourceFile(file);
				if (source) parsed.set(path.resolve(file), source);
			}
	} finally {
		void compiler.close();
	}
	return parsed;
}

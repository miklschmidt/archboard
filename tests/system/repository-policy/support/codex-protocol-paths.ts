import path from "node:path";
import type { ConfiguredAliases } from "./codex-protocol-aliases.js";
import { aliasResolutions } from "./codex-protocol-aliases.js";

function normalize(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function generatedPathFromRaw(
	repoRoot: string,
	generatedRoot: string,
	importer: string,
	rawPath: string,
): string | undefined {
	if (rawPath.startsWith("file:")) {
		try {
			rawPath = decodeURIComponent(new URL(rawPath).pathname);
		} catch {
			return undefined;
		}
	}
	const marker = "__archboard_dynamic__";
	rawPath = rawPath.replaceAll("*", marker);
	const absolute = path.isAbsolute(rawPath)
		? path.normalize(rawPath)
		: rawPath.startsWith(".")
			? path.resolve(repoRoot, path.dirname(importer), rawPath)
			: path.resolve(repoRoot, rawPath);
	const relative = normalize(path.relative(repoRoot, absolute));
	const withoutExtension = relative.replace(/\.(?:[cm]?js|tsx?)$/u, "").replaceAll(marker, "*");
	if (withoutExtension.startsWith(generatedRoot)) return withoutExtension;
	return withoutExtension.includes("/codex-protocol/") && withoutExtension.includes("/generated/")
		? withoutExtension
		: undefined;
}

export function generatedPathsFromImport(
	repoRoot: string,
	generatedRoot: string,
	importer: string,
	specifier: string,
	aliases: ConfiguredAliases,
): string[] {
	const paths = [
		specifier,
		...aliasResolutions(aliases, importer, specifier).map(({ target }) => target),
	];
	return [
		...new Set(
			paths.flatMap((target) => {
				const generated = generatedPathFromRaw(repoRoot, generatedRoot, importer, target);
				return generated ? [generated] : [];
			}),
		),
	];
}

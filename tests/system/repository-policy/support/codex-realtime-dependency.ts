import path from "node:path";

const NODE_BUILTINS = new Set(
	"assert assert/strict buffer child_process cluster console constants crypto dgram diagnostics_channel dns dns/promises domain events fs fs/promises http http2 https module net os path path/posix path/win32 perf_hooks process punycode querystring readline readline/promises repl stream stream/consumers stream/promises stream/web string_decoder sys timers timers/promises tls trace_events tty url util util/types v8 vm wasi worker_threads zlib".split(
		" ",
	),
);

interface ModuleReference {
	readonly specifier: string;
	readonly kind: string;
}

function resolvedTarget(file: string, specifier: string, repoRoot: string): string | undefined {
	const clean = specifier.split("?", 1)[0]!;
	if (clean.startsWith("file://")) {
		try {
			return path.resolve(new URL(clean).pathname);
		} catch {
			return undefined;
		}
	}
	if (path.isAbsolute(clean)) return path.resolve(clean);
	if (clean.startsWith("src/")) return path.resolve(repoRoot, clean);
	return clean.startsWith(".") ? path.resolve(path.dirname(file), clean) : undefined;
}

export function forbiddenRealtimeModuleFinding(
	file: string,
	reference: ModuleReference,
	repoRoot: string,
): { file: string; reason: string; message: string } | undefined {
	const normalized = reference.specifier.split("?", 1)[0]!.toLowerCase();
	const root = normalized.split("/")[0] ?? "";
	if (normalized.startsWith("node:") || NODE_BUILTINS.has(normalized) || NODE_BUILTINS.has(root))
		return {
			file,
			reason: "forbidden dependency",
			message: `remove ${reference.kind} ${reference.specifier}; browser realtime code cannot import Node`,
		};
	const hostIndex = path.join(repoRoot, "src/shared/codex-realtime-host/index.ts");
	if (resolvedTarget(file, reference.specifier, repoRoot)?.replace(/\.jsx?$/u, ".ts") === hostIndex)
		return undefined;
	if (/^(?:react|@assistant-ui(?:\/|$))/.test(normalized))
		return {
			file,
			reason: "forbidden dependency",
			message: `remove ${reference.kind} ${reference.specifier}; the realtime module is framework-free`,
		};
	if (/(?:archboard|codex|generated|runtime|stores?|fakes?)/u.test(normalized))
		return {
			file,
			reason: "forbidden dependency",
			message: `remove ${reference.kind} ${reference.specifier}; use the framework-free realtime contract`,
		};
	return undefined;
}

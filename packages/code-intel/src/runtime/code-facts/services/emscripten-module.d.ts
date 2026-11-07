// web-tree-sitter 0.27.0 publishes declarations that name the global type
// `EmscriptenModule`, which `@types/emscripten` declares. That package is a
// development dependency of web-tree-sitter, so it is not installed with it,
// and the declarations do not compile without it. Code facts passes only
// `locateFile` to `Parser.init`, the one place that names the type, so the type
// needs only that member. Installing `@types/emscripten` would replace this file.
interface EmscriptenModule {
	locateFile(path: string, prefix: string): string;
}

// Code facts imports its grammar files `with { type: "file" }`, which gives the
// path of the file, and its queries `with { type: "text" }` (grammar-files.ts).
declare module "*.wasm" {
	const path: string;
	export = path;
}
declare module "*.scm" {
	const text: string;
	export = text;
}

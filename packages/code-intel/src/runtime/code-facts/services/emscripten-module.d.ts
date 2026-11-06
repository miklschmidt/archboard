// web-tree-sitter 0.27.0 publishes declarations that name the global type
// `EmscriptenModule`, which `@types/emscripten` declares. That package is a
// development dependency of web-tree-sitter, so it is not installed with it,
// and the declarations do not compile without it. Code facts never passes
// options to `Parser.init`, the one place that names the type, so the type
// needs only to exist. Installing `@types/emscripten` would replace this file.
interface EmscriptenModule {
	locateFile(path: string, prefix: string): string;
}

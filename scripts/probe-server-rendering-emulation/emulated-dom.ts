// The emulated browser the emulation proof renders in: happy-dom globals,
// native canvases behind DOM canvas elements, and the bundled Excalifont.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;
type AnyFunction = (...values: unknown[]) => unknown;

/**
 * Whether a value is a non-null object, viewed as a string-keyed record.
 * @param value The value to test.
 * @returns Whether record access is safe on it.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null;
}

/**
 * A record-valued member of a record, refusing anything else.
 * @param record The containing record.
 * @param key The member name.
 * @returns The member as a record.
 * @throws {Error} When the member is not an object.
 */
function requireRecord(record: JsonRecord, key: string): JsonRecord {
	const value = record[key];
	if (!isRecord(value)) {
		throw new Error(`Emulation dependency exposes no ${key} object.`);
	}
	return value;
}

/**
 * A callable member of a record, refusing anything else.
 * @param record The containing record.
 * @param key The member name.
 * @returns The member as a function of unknown values, bound to the record.
 * @throws {Error} When the member is not callable.
 */
function requireFunction(record: JsonRecord, key: string): AnyFunction {
	const value = record[key];
	if (typeof value !== "function") {
		throw new Error(`Emulation dependency exposes no ${key} function.`);
	}
	return (...values: unknown[]): unknown => Reflect.apply(value, record, values);
}

/**
 * Import a module from the disposable dependency tree.
 * @param dependencyRoot The install directory.
 * @param relativePath The module path below node_modules.
 * @returns The module namespace as a record.
 * @throws {Error} When the module is not an object.
 */
async function importDependency(dependencyRoot: string, relativePath: string): Promise<JsonRecord> {
	const loaded: unknown = await import(
		pathToFileURL(join(dependencyRoot, "node_modules", relativePath)).href
	);
	if (!isRecord(loaded)) {
		throw new Error(`Emulation dependency ${relativePath} did not load as a module.`);
	}
	return loaded;
}

/**
 * Every `.woff2` file below a directory.
 * @param directory The directory to search.
 * @returns The font file paths.
 */
function fontFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return fontFiles(path);
		}
		return path.endsWith(".woff2") ? [path] : [];
	});
}

interface FontRegistration {
	discovered: number;
	registered: number;
	removeAll(): void;
}

/**
 * Register the bundled Excalifont files with the native canvas.
 * @param canvas The `@napi-rs/canvas` module.
 * @param fontDirectory The directory holding Excalidraw's Excalifont files.
 * @returns The font counts and the registry's `removeAll`.
 * @throws {Error} When no fonts are found or one fails to register.
 */
function registerFonts(canvas: JsonRecord, fontDirectory: string): FontRegistration {
	const fonts = fontFiles(fontDirectory);
	const fontRegistry = requireRecord(canvas, "GlobalFonts");
	const registerFromPath = requireFunction(fontRegistry, "registerFromPath");
	const removeAll = requireFunction(fontRegistry, "removeAll");
	const registered = fonts.filter((font) => registerFromPath(font, "Excalifont") === true);
	if (fonts.length === 0 || registered.length !== fonts.length) {
		throw new Error(
			`Emulation font preflight failed: discovered ${fonts.length}, registered ${registered.length}.`,
		);
	}
	return {
		discovered: fonts.length,
		registered: registered.length,
		/** Unregister every font. */
		removeAll: () => {
			removeAll();
		},
	};
}

interface GlobalRestore {
	installed: string[];
	restore(): boolean;
}

const DOM_GLOBAL_NAMES = [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLCanvasElement",
	"HTMLImageElement",
	"SVGElement",
	"SVGSVGElement",
	"CSSStyleSheet",
	"CSSStyleDeclaration",
	"Element",
	"Node",
	"Document",
	"DOMParser",
	"XMLSerializer",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"ResizeObserver",
	"MutationObserver",
	"CustomEvent",
	"Event",
	"EventTarget",
	"File",
	"FileReader",
	"FontFace",
	"localStorage",
	"sessionStorage",
	"location",
	"matchMedia",
	"devicePixelRatio",
];

/** A `FontFace` that reports itself loaded, for windows without one. */
class LoadedFontFace {
	readonly style: string;
	readonly weight: string;
	readonly stretch: string;
	readonly unicodeRange: string;
	readonly status = "loaded";
	readonly family: string;
	readonly source: string;
	readonly descriptors: Record<string, string>;

	/**
	 * Record a face as already loaded.
	 * @param family The font family name.
	 * @param source The font source.
	 * @param descriptors The optional CSS descriptors.
	 */
	constructor(family: string, source: string, descriptors: Record<string, string> = {}) {
		this.family = family;
		this.source = source;
		this.descriptors = descriptors;
		this.style = descriptors["style"] ?? "normal";
		this.weight = descriptors["weight"] ?? "normal";
		this.stretch = descriptors["stretch"] ?? "normal";
		this.unicodeRange = descriptors["unicodeRange"] ?? "U+0-10FFFF";
	}

	/**
	 * Resolve immediately: the face is treated as loaded.
	 * @returns This face.
	 */
	async load(): Promise<this> {
		return this;
	}
}

/**
 * Give the document a `fonts` set that reports every face as ready.
 * @param document The happy-dom document.
 */
function installFontSet(document: JsonRecord): void {
	const faces = new Set<unknown>();
	document["fonts"] = {
		/**
		 * Register a face.
		 * @param face The face to add.
		 * @returns The face set.
		 */
		add: (face: unknown) => faces.add(face),
		/**
		 * Whether a face is registered.
		 * @param face The face to look for.
		 * @returns Whether it was added.
		 */
		has: (face: unknown) => faces.has(face),
		/**
		 * Unregister a face.
		 * @param face The face to remove.
		 * @returns Whether it was registered.
		 */
		delete: (face: unknown) => faces.delete(face),
		/** Unregister every face. */
		clear: () => {
			faces.clear();
		},
		/**
		 * Report every font as available.
		 * @returns Always true.
		 */
		check: () => true,
		ready: Promise.resolve(),
	};
}

/**
 * Create the native canvas standing in for a DOM canvas element.
 * @param createCanvas The `@napi-rs/canvas` factory.
 * @param element The DOM canvas element.
 * @returns The native canvas with the element methods Excalidraw touches.
 * @throws {Error} When the factory returns no object.
 */
function createNativeCanvas(createCanvas: AnyFunction, element: JsonRecord): JsonRecord {
	const native = createCanvas(Number(element["width"]) || 300, Number(element["height"]) || 150);
	if (!isRecord(native)) {
		throw new Error("Emulation dependency createCanvas returned no canvas.");
	}
	Object.assign(native, {
		/** Attributes are ignored on the native canvas. */
		setAttribute: () => {
			// Nothing to record.
		},
		/** Attributes are ignored on the native canvas. */
		removeAttribute: () => {
			// Nothing to record.
		},
		style: {},
	});
	return native;
}

/**
 * Route happy-dom canvas elements to native canvases so exports rasterise.
 * @param window The happy-dom window.
 * @param canvas The `@napi-rs/canvas` module.
 */
function installNativeCanvas(window: JsonRecord, canvas: JsonRecord): void {
	const backing = new WeakMap<object, JsonRecord>();
	const createCanvas = requireFunction(canvas, "createCanvas");
	/**
	 * The native canvas backing a DOM canvas element, created on first use.
	 * @param element The DOM canvas element.
	 * @returns The native canvas.
	 */
	const nativeFor = (element: JsonRecord): JsonRecord => {
		const present = backing.get(element);
		if (present) {
			return present;
		}
		const native = createNativeCanvas(createCanvas, element);
		backing.set(element, native);
		return native;
	};
	const htmlCanvas = requireRecord(window, "HTMLCanvasElement");
	Object.assign(requireRecord(htmlCanvas, "prototype"), {
		/**
		 * The native drawing context of this element.
		 * @param type The context type.
		 * @param args The context attributes.
		 * @returns The native context.
		 */
		getContext(this: JsonRecord, type: string, ...args: unknown[]) {
			return requireFunction(nativeFor(this), "getContext")(type, ...args);
		},
		/**
		 * Encode this element's native canvas.
		 * @param type The image MIME type.
		 * @returns The data URL.
		 */
		toDataURL(this: JsonRecord, type = "image/png") {
			return requireFunction(nativeFor(this), "toDataURL")(type);
		},
		/**
		 * Encode this element's native canvas as a blob.
		 * @param callback Receives the encoded blob.
		 * @param type The image MIME type.
		 */
		toBlob(this: JsonRecord, callback: (blob: Blob) => void, type = "image/png") {
			const buffer = requireFunction(nativeFor(this), "toBuffer")(type);
			if (!(buffer instanceof Uint8Array)) {
				throw new Error("Emulation dependency toBuffer returned no bytes.");
			}
			const copy = new ArrayBuffer(buffer.byteLength);
			new Uint8Array(copy).set(buffer);
			callback(new Blob([copy], { type }));
		},
	});
}

/**
 * Define a global, remembering how to restore it.
 * @param before The descriptors to restore, filled as globals are replaced.
 * @param name The global name.
 * @param replacement The new value.
 */
function defineGlobal(
	before: Map<string, PropertyDescriptor | undefined>,
	name: string,
	replacement: unknown,
): void {
	if (!before.has(name)) {
		before.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	}
	Object.defineProperty(globalThis, name, {
		configurable: true,
		writable: true,
		value: replacement,
	});
}

/**
 * Put every replaced global back and check the result.
 * @param before The descriptors recorded before replacement.
 * @returns Whether every descriptor now matches its original.
 */
function restoreGlobals(before: Map<string, PropertyDescriptor | undefined>): boolean {
	for (const [name, descriptor] of before) {
		if (descriptor) {
			Object.defineProperty(globalThis, name, descriptor);
		} else {
			Reflect.deleteProperty(globalThis, name);
		}
	}
	return [...before].every(([name, descriptor]) => {
		const restored = Object.getOwnPropertyDescriptor(globalThis, name);
		return JSON.stringify(restored) === JSON.stringify(descriptor);
	});
}

/**
 * Install the DOM and canvas globals Excalidraw needs, returning the means to
 * put the process's own globals back and prove they were restored.
 * @param window The happy-dom window.
 * @param canvas The `@napi-rs/canvas` module.
 * @returns The installed names and the restore step.
 */
function installDom(window: JsonRecord, canvas: JsonRecord): GlobalRestore {
	if (!window["FontFace"]) {
		window["FontFace"] = LoadedFontFace;
	}
	installFontSet(requireRecord(window, "document"));
	installNativeCanvas(window, canvas);
	const before = new Map(
		DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	);
	for (const name of DOM_GLOBAL_NAMES) {
		const replacement = window[name];
		if (replacement !== undefined) {
			defineGlobal(before, name, replacement);
		}
	}
	for (const name of ["Image", "Path2D", "ImageData", "CanvasRenderingContext2D"]) {
		defineGlobal(before, name, canvas[name]);
	}
	return {
		installed: [...before.keys()],
		/**
		 * Put every replaced global back.
		 * @returns Whether every descriptor now matches its original.
		 */
		restore: () => restoreGlobals(before),
	};
}

export {
	importDependency,
	installDom,
	isRecord,
	registerFonts,
	requireFunction,
	type FontRegistration,
	type GlobalRestore,
	type JsonRecord,
};

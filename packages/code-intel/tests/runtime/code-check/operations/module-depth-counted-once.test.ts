// What a module's width counts once (TASK-651): a name however many public
// paths reach it, and a contract's methods however many exported types
// implement them.
//
// `Scene` passes `Colour` on through `pub mod colour` and `pub use`. `Paint`
// exports the trait `Canvas`, which `Cpu` and `Gpu` implement, `Gpu` also
// `From<u8>`, and `Cpu` has a method of its own. `Api` exports `read` by name,
// through `export * as io` and, from a second entry, as `load`. `Draw` (Go),
// `Ink` (Swift) and `Brush` (C#) each export a contract that `Cpu` and `Gpu`
// implement, and `Cpu` has a method of its own.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { depthByModule, depthCheckout } from "#tests/runtime/support/code-check/depth-checkout.ts";

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	shop = await depthCheckout(
		{
			"scene/Cargo.toml": '[package]\nname = "scene"\nversion = "0.1.0"\n',
			"scene/src/lib.rs": "pub mod colour;\npub use colour::Colour;\n",
			"scene/src/colour.rs": [
				"pub struct Colour(u8);",
				"impl Colour {",
				"    pub fn new(n: u8) -> Self {",
				"        Colour(n)",
				"    }",
				"    pub fn token(&self) -> u8 {",
				"        self.0",
				"    }",
				"}",
				"",
			].join("\n"),
			"paint/Cargo.toml": '[package]\nname = "paint"\nversion = "0.1.0"\n',
			"paint/src/lib.rs": [
				"pub trait Canvas {",
				"    fn fill(&mut self, n: u8);",
				"    fn stroke(&mut self, n: u8);",
				"}",
				"pub struct Cpu {",
				"    pub n: u8,",
				"}",
				"pub struct Gpu {",
				"    pub n: u8,",
				"}",
				"impl Canvas for Cpu {",
				"    fn fill(&mut self, n: u8) {",
				"        self.n = n;",
				"    }",
				"    fn stroke(&mut self, n: u8) {",
				"        self.n = n + 1;",
				"    }",
				"}",
				"impl Canvas for Gpu {",
				"    fn fill(&mut self, n: u8) {",
				"        self.n = n;",
				"    }",
				"    fn stroke(&mut self, n: u8) {",
				"        self.n = n + 1;",
				"    }",
				"}",
				"impl From<u8> for Gpu {",
				"    fn from(n: u8) -> Self {",
				"        Gpu { n }",
				"    }",
				"}",
				"impl Cpu {",
				"    pub fn size(&self) -> u8 {",
				"        self.n * 2",
				"    }",
				"}",
				"",
			].join("\n"),
			"web/api/package.json": JSON.stringify({
				name: "api",
				exports: { ".": "./index.ts", "./more": "./more.ts" },
			}),
			"web/api/read.ts": [
				"export function read(n: number): number {",
				"\treturn n + 1;",
				"}",
				"export function write(n: number): number {",
				"\treturn n - 1;",
				"}",
				"",
			].join("\n"),
			"web/api/index.ts":
				'export { read, write } from "./read.ts";\nexport * as io from "./read.ts";\n',
			"web/api/more.ts": 'export { read as load } from "./read.ts";\n',
			"go.mod": "module example.com/shop\n\ngo 1.22\n",
			"draw/draw.go": [
				"package draw",
				"",
				"type Canvas interface {",
				"\tFill(n int)",
				"\tStroke(n int)",
				"}",
				"",
				"type Cpu struct{ N int }",
				"",
				"func (c *Cpu) Fill(n int)   { c.N = n }",
				"func (c *Cpu) Stroke(n int) { c.N = n + 1 }",
				"func (c *Cpu) Size() int    { return c.N * 2 }",
				"",
				"type Gpu struct{ N int }",
				"",
				"func (g *Gpu) Fill(n int)   { g.N = n }",
				"func (g *Gpu) Stroke(n int) { g.N = n + 1 }",
				"",
			].join("\n"),
			"app/app.go": [
				"package app",
				"",
				'import "example.com/shop/draw"',
				"",
				"func Run() int {",
				"\tvar c draw.Canvas = &draw.Cpu{}",
				"\tc.Fill(1)",
				"\tg := &draw.Gpu{}",
				"\tg.Stroke(2)",
				"\treturn (&draw.Cpu{}).Size()",
				"}",
				"",
			].join("\n"),
			"Package.swift": [
				"// swift-tools-version:5.9",
				"import PackageDescription",
				"",
				"let package = Package(",
				'    name: "Shop",',
				'    targets: [.target(name: "Ink")]',
				")",
				"",
			].join("\n"),
			"Sources/Ink/Ink.swift": [
				"public protocol Canvas {",
				"    func fill(_ n: Int)",
				"    func stroke(_ n: Int)",
				"}",
				"public final class Cpu: Canvas {",
				"    public func fill(_ n: Int) { print(n) }",
				"    public func stroke(_ n: Int) { print(n + 1) }",
				"    public func size() -> Int { 2 }",
				"}",
				"public final class Gpu {}",
				"extension Gpu: Canvas {",
				"    public func fill(_ n: Int) { print(n) }",
				"    public func stroke(_ n: Int) { print(n + 1) }",
				"}",
				"",
			].join("\n"),
			"cs/Brush.csproj": '<Project Sdk="Microsoft.NET.Sdk">\n</Project>\n',
			"cs/Brush.cs": [
				"namespace Shop.Brush;",
				"",
				"public interface ICanvas",
				"{",
				"    void Fill(int n);",
				"    void Stroke(int n);",
				"}",
				"",
				"public class Cpu : ICanvas",
				"{",
				"    public void Fill(int n) { System.Console.WriteLine(n); }",
				"    public void Stroke(int n) { System.Console.WriteLine(n + 1); }",
				"    public int Size() { return 2; }",
				"}",
				"",
				"public class Gpu : ICanvas",
				"{",
				"    public void Fill(int n) { System.Console.WriteLine(n); }",
				"    public void Stroke(int n) { System.Console.WriteLine(n + 1); }",
				"}",
				"",
			].join("\n"),
		},
		{
			Scene: "scene",
			Paint: "paint",
			Api: "web/api",
			Draw: "draw",
			App: "app",
			Ink: "Sources/Ink",
			Brush: "cs",
		},
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

/**
 * One module's exports by kind.
 * @param name The module.
 * @returns The counts.
 */
function exportsOf(name: string) {
	return depthByModule(answer).get(name)?.exports;
}

test("a Rust name that both `pub mod` and `pub use` reach counts once", () => {
	expect(exportsOf("Scene")).toEqual({
		functions: 1,
		classes: 1,
		methods: 1,
		values: 0,
		types: 0,
	});
});

test("a Rust trait's methods count once, for the trait, and a type's implementation of a trait adds nothing", () => {
	// `Canvas.fill`, `Canvas.stroke` and `Cpu.size`; `Gpu`, with no method of its own, is a type.
	expect(exportsOf("Paint")).toEqual({
		functions: 0,
		classes: 1,
		methods: 3,
		values: 0,
		types: 2,
	});
});

test("a TypeScript function that several entries pass on, renamed or through a namespace, counts once", () => {
	expect(exportsOf("Api")).toEqual({ functions: 2, classes: 0, methods: 0, values: 0, types: 0 });
});

test("a Go interface, a Swift protocol and a C# interface count their methods once, and the types that implement them add only their own", () => {
	// Two methods of the contract and `Cpu`'s own; `Gpu` holds data with no method of its own.
	expect(exportsOf("Draw")).toEqual({ functions: 0, classes: 1, methods: 3, values: 0, types: 2 });
	// A Swift or C# class is a class, whatever its methods.
	const classes = { functions: 0, classes: 2, methods: 3, values: 0, types: 1 };
	expect(exportsOf("Ink")).toEqual(classes);
	expect(exportsOf("Brush")).toEqual(classes);
});

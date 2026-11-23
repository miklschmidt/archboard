// Whether each adapter reads a call site as awaited, started or plain
// (TASK-663.09, call-timing.ts), and which callables it marks async, so an
// unawaited call resolves through its callee.

import { expect, test } from "bun:test";
import { factsOf, timingsOf } from "#tests/runtime/support/code-facts/uses.ts";

test("TypeScript awaits with await and then, starts with a timer, and leaves a bare call to its callee", async () => {
	expect(
		await timingsOf("shop.ts", [
			"async function checkout() {",
			"  await ledger.post();",
			"  load().then(show);",
			"  setTimeout(() => notify(), delay());",
			"  setTimeout(makeCallback(), 0);",
			"  queueMicrotask(refresh);",
			"  audit();",
			"  new Receipt();",
			"}",
		]),
	).toMatchObject({
		"ledger.post": "awaited",
		load: "awaited",
		notify: "started",
		delay: "unawaited",
		makeCallback: "unawaited",
		refresh: "started",
		audit: "unawaited",
		Receipt: "plain",
	});
});

test("TypeScript marks async and promised callables, and synchronous ones that say so", async () => {
	const { definitions } = await factsOf("ledger.ts", [
		"export async function post() {}",
		"export function load(): Promise<void> { return later(); }",
		"export function size(): number { return 1; }",
		"export function log() { console.log(1); }",
		"export function read() { return later(); }",
		"export class Ledger { async save() {} total() {} }",
	]);
	expect(Object.fromEntries(definitions.map((each) => [each.symbol, each.async]))).toEqual({
		post: true,
		load: true,
		size: false,
		log: false,
		read: undefined,
		Ledger: undefined,
		"Ledger.save": true,
		"Ledger.total": false,
	});
});

test("Rust awaits with .await, starts with a spawn, and marks async functions", async () => {
	expect(
		await timingsOf("src/lib.rs", [
			"async fn checkout() {",
			"    ledger::post().await;",
			"    tokio::spawn(notify());",
			"    std::thread::spawn(move || audit());",
			"    total();",
			"}",
			"fn total() -> u8 { 1 }",
			"fn later() -> impl Future<Output = u8> { ready(1) }",
		]),
	).toMatchObject({
		"ledger.post": "awaited",
		notify: "started",
		audit: "started",
		total: "unawaited",
	});
	const { definitions } = await factsOf("src/lib.rs", [
		"async fn post() {}",
		"fn later() -> impl Future<Output = u8> { ready(1) }",
		"fn total() -> u8 { 1 }",
	]);
	expect(Object.fromEntries(definitions.map((each) => [each.symbol, each.async]))).toEqual({
		post: true,
		later: true,
		total: false,
	});
});

test("Python awaits with await, starts with create_task and a thread, and marks async def", async () => {
	expect(
		await timingsOf("shop.py", [
			"async def checkout():",
			"    await ledger.post()",
			"    asyncio.create_task(notify())",
			"    threading.Thread(target=audit).start()",
			"    total()",
			"def total():",
			"    return 1",
		]),
	).toMatchObject({
		"ledger.post": "awaited",
		notify: "started",
		audit: "started",
		total: "unawaited",
	});
	const { definitions } = await factsOf("ledger.py", [
		"async def post(): pass",
		"def total(): pass",
	]);
	expect(Object.fromEntries(definitions.map((each) => [each.symbol, each.async]))).toEqual({
		post: true,
		total: false,
	});
});

test("Go starts with go, and every other call is plain", async () => {
	expect(
		await timingsOf("shop.go", [
			"package shop",
			"func Checkout() {",
			"\tgo notify(format())",
			"\tgo func(value int) { audit(value) }(count())",
			"\tdefer total()",
			"\tledger.Post()",
			"}",
		]),
	).toMatchObject({
		notify: "started",
		format: "plain",
		audit: "started",
		count: "plain",
		total: "plain",
		"ledger.Post": "plain",
	});
});

test("C# awaits with await, starts with Task.Run and a thread, and marks async and task methods", async () => {
	expect(
		await timingsOf("Shop.cs", [
			"class Shop {",
			"  async Task Checkout() {",
			"    await ledger.Post().ConfigureAwait(false);",
			"    Task.Run(() => Notify());",
			"    new Thread(Audit).Start();",
			"    Total();",
			"    new Receipt();",
			"  }",
			"}",
		]),
	).toMatchObject({
		"ledger.Post": "awaited",
		Notify: "started",
		Audit: "started",
		Total: "unawaited",
		Receipt: "plain",
	});
	const { definitions } = await factsOf("Ledger.cs", [
		"public class Ledger {",
		"  public async Task Post() {}",
		"  public Task<int> Load() { return null; }",
		"  public int Total() { return 1; }",
		"}",
	]);
	expect(Object.fromEntries(definitions.map((each) => [each.symbol, each.async]))).toMatchObject({
		"Ledger.Post": true,
		"Ledger.Load": true,
		"Ledger.Total": false,
	});
});

test("Swift awaits with await, starts with Task, a queue and async let, and a call outside await is plain", async () => {
	expect(
		await timingsOf("Shop.swift", [
			"func checkout() async throws {",
			"    try await post()",
			"    Task { notify() }",
			"    DispatchQueue.main.async { audit() }",
			"    async let receipt = print()",
			"    total()",
			"    await send(format())",
			"}",
		]),
	).toMatchObject({
		post: "awaited",
		notify: "started",
		audit: "started",
		print: "started",
		total: "plain",
		format: "unknown",
	});
});

test("Objective-C starts with dispatch_async and a background selector, leaves a completion unknown, and a send is plain", async () => {
	expect(
		await timingsOf("Shop.m", [
			"void checkout(Ledger *ledger) {",
			"    dispatch_async(queue, ^{ notify(); });",
			"    [self performSelectorInBackground:@selector(audit) withObject:nil];",
			"    [ledger loadWithCompletion:^(id x) {}];",
			"    [ledger post];",
			"    total();",
			"}",
		]),
	).toMatchObject({
		notify: "started",
		".audit": "started",
		"Ledger::loadWithCompletion:": "unknown",
		"Ledger::post": "plain",
		total: "plain",
	});
});

test("C starts with pthread_create, and every other call is plain", async () => {
	expect(
		await timingsOf("shop.c", [
			"void checkout(void) {",
			"    pthread_create(&thread, NULL, worker, NULL);",
			"    post();",
			"}",
		]),
	).toMatchObject({ worker: "started", post: "plain" });
});

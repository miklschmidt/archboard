import { Buffer } from "node:buffer";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { z } from "zod";
import { IMAGE_CLIPBOARD_MS } from "@archboard/timing";
import {
	ImageClipboardInputSchema,
	ImageClipboardReplySchema,
} from "#runtime/protocol/clipboard/protocol.ts";

/** A native clipboard failure that the CLI maps to a stable refusal. */
class ImageClipboardError extends Error {
	/**
	 * Preserve the failure category at the command boundary.
	 * @param code The stable refusal code.
	 * @param message The actionable diagnostic.
	 */
	constructor(
		readonly code: Extract<z.infer<typeof ImageClipboardReplySchema>, { status: "failed" }>["code"],
		message: string,
	) {
		super(message);
		this.name = "ImageClipboardError";
	}
}

/**
 * Wait only for publication, while the child retains Linux clipboard ownership.
 * @param child The newly forked native clipboard owner.
 * @param payload The single image in both formats.
 * @param signal The bounded startup signal.
 * @returns The native write acknowledgement.
 */
async function publication(
	child: ChildProcess,
	payload: z.infer<typeof ImageClipboardInputSchema>,
	signal: AbortSignal,
): Promise<void> {
	signal.throwIfAborted();
	const finished = new AbortController();
	const bounded = AbortSignal.any([signal, finished.signal]);
	try {
		const reply = once(child, "message", { signal: bounded });
		const stopped = once(child, "exit", { signal: bounded }).then(
			/** Refuse a helper that ends without acknowledging its write. */
			() => {
				throw new Error("The clipboard helper exited before it accepted the image.");
			},
		);
		child.send(
			payload,
			/**
			 * Refuse a request that never reaches the helper.
			 * @param cause The transport error, when IPC delivery fails.
			 */
			(cause) => {
				if (cause) finished.abort(cause);
			},
		);
		const [value] = await Promise.race([reply, stopped]);
		const result = ImageClipboardReplySchema.parse(value);
		if (result.status === "failed") throw new ImageClipboardError(result.code, result.message);
	} finally {
		finished.abort();
	}
}

/**
 * Copy one image in both native representations on the invoking desktop.
 * @param image The encoded PNG, its dimensions and self-contained HTML.
 * @param signal The caller's cancellation signal.
 * @returns After the native clipboard accepts both formats.
 * @throws {ImageClipboardError} When the helper cannot publish the copy.
 */
async function copyPngAndHtml(
	image: Omit<z.infer<typeof ImageClipboardInputSchema>, "png"> & { png: Uint8Array },
	signal: AbortSignal,
): Promise<void> {
	signal.throwIfAborted();
	const payload = {
		...image,
		png: Buffer.from(image.png).toString("base64"),
		// A second copy of identical pixels must retire the first Linux owner.
		html: `${image.html}<!-- archboard-copy:${crypto.randomUUID()} -->`,
	};
	const child = fork(new URL("./owner.ts", import.meta.url), [], {
		detached: true,
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	const exited = new Promise<void>((resolve) => {
		child.once("exit", () => resolve());
		child.once("error", () => {
			if (child.pid === undefined) resolve();
		});
	});
	try {
		const ready = publication(
			child,
			payload,
			AbortSignal.any([signal, AbortSignal.timeout(IMAGE_CLIPBOARD_MS.startup)]),
		);
		await ready;
		child.unref();
	} catch (cause) {
		child.kill("SIGKILL");
		await exited;
		signal.throwIfAborted();
		if (cause instanceof ImageClipboardError) throw cause;
		throw new ImageClipboardError(
			"CLIPBOARD_FAILED",
			`The native clipboard did not accept the image. Run the command in your desktop session. ${cause instanceof Error ? cause.message : String(cause)}`,
		);
	}
}

export { copyPngAndHtml };

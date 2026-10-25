// Linux owns clipboard data in a living process. This helper receives one
// image, acknowledges publication, then outlives the CLI until the next copy.
// macOS retains the data itself and needs no process after acknowledgement.

import { Buffer } from "node:buffer";
import type { ClipboardManager } from "@teddyzhu/clipboard";
import type { z } from "zod";
import { IMAGE_CLIPBOARD_MS } from "@archboard/timing";
import {
	ImageClipboardInputSchema,
	ImageClipboardReplySchema,
} from "#runtime/protocol/clipboard/protocol.ts";

let acknowledged = false;

/**
 * Report a refusal and flush the IPC reply before ending the failed owner.
 * @param code The command's stable refusal code.
 * @param message The actionable local-desktop diagnostic.
 */
function refuse(
	code: Extract<z.infer<typeof ImageClipboardReplySchema>, { status: "failed" }>["code"],
	message: string,
): void {
	const exit = code === "CLIPBOARD_UNAVAILABLE" ? 4 : 1;
	if (!process.send) process.exit(exit);
	process.send(
		{ status: "failed", code, message } satisfies z.infer<typeof ImageClipboardReplySchema>,
		/** End after the failure reply has left this process. */
		(): void => {
			process.exit(exit);
		},
	);
}

/**
 * Keep Linux's native manager alive while this particular copy is current.
 * @param manager The native clipboard owner.
 * @param html The exact HTML, including this copy's unique inert marker.
 */
function retainUntilReplaced(manager: ClipboardManager, html: string): void {
	setInterval(
		/** Release ownership after another copy or a disconnected desktop. */
		() => {
			try {
				if (manager.getHtml() !== html) process.exit(0);
			} catch {
				process.exit(0);
			}
		},
		IMAGE_CLIPBOARD_MS.ownerPoll,
	);
}

/** Flush success before accepting IPC disconnection and platform-specific retirement. */
function acknowledge(): void {
	if (!process.send) process.exit(1);
	process.send(
		{ status: "ready" } satisfies z.infer<typeof ImageClipboardReplySchema>,
		/**
		 * Detach only after the acknowledgement has reached the IPC transport.
		 * @param error A failed IPC write, or null after a successful flush.
		 */
		(error) => {
			if (error) process.exit(1);
			acknowledged = true;
			if (process.connected) process.disconnect?.();
			if (process.platform === "darwin") process.exit(0);
		},
	);
}

/**
 * Publish one PNG and HTML image through the native clipboard library.
 * @param message The parent's sole IPC payload.
 */
async function publish(message: unknown): Promise<void> {
	const input = ImageClipboardInputSchema.safeParse(message);
	if (!input.success) {
		refuse("CLIPBOARD_FAILED", "The image clipboard owner received an invalid image payload.");
		return;
	}
	let manager: ClipboardManager;
	try {
		const native = await import("@teddyzhu/clipboard");
		manager = new native.ClipboardManager();
	} catch (error) {
		refuse(
			"CLIPBOARD_UNAVAILABLE",
			`The local desktop clipboard is unavailable. Run --clipboard in a Linux or macOS desktop session with the native clipboard dependency installed. ${String(error)}`,
		);
		return;
	}
	try {
		const data = Buffer.from(input.data.png, "base64");
		manager.setContents({
			availableFormats: ["image/png", "text/html"],
			html: input.data.html,
			image: { width: input.data.width, height: input.data.height, size: data.length, data },
		});
	} catch (error) {
		refuse(
			"CLIPBOARD_FAILED",
			`The local desktop did not accept the PNG and HTML image. Check the desktop clipboard connection and try again. ${String(error)}`,
		);
		return;
	}
	if (process.platform === "linux") retainUntilReplaced(manager, input.data.html);
	acknowledge();
}

/** Stop an unacknowledged owner when its requesting CLI disappears. */
function disconnected(): void {
	if (!acknowledged) process.exit(1);
}

/**
 * Receive exactly one request; subsequent clipboard operations get their own owner.
 * @param message The parent's image payload.
 */
function receive(message: unknown): void {
	void publish(message);
}

if (!process.send) process.exit(4);
process.on("disconnect", disconnected);
process.once("message", receive);

// The design questions' route, `GET /api/vault/design-questions[?board=<name>]...`
// (ADR 0044, ADR 0059).
//
// `archboard semantic questions` asks it. It answers pass-through entry
// points, containers with no hidden part and containers with no entry point
// over the current variant of every board of the vault, or of the boards that
// `board` names, once or repeated. It names the boards it read and the boards
// it skipped with the reason. A `board` that matches no board is refused, so a
// misspelt name never reads as a board with nothing to ask.
//
// It reads the board files and nothing else, as `GET /api/semantic-boards`
// does, and keeps no answer. A reading changes nothing, so the route is a GET.

import type { Express, Request, Response } from "express";
import { listSemanticBoards, readDesignQuestions } from "@archboard/board/store-read";
import { errorMessage } from "@archboard/diagnostics/errno";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

/**
 * The boards a request names.
 * @param request The request.
 * @returns Each `board`, in order; none when the request names none.
 */
function boardsOf(request: Request): string[] {
	const named = request.query["board"];
	const each = Array.isArray(named) ? named : [named];
	return each.filter((one): one is string => typeof one === "string");
}

/**
 * Answer one request with the design questions of the vault it names.
 * @param request The request.
 * @param response Its response.
 */
function answerQuestions(request: Request, response: Response): void {
	try {
		const vault = vaultOfRequest(request);
		const read = readDesignQuestions(vault, boardsOf(request));
		if (read.ok) {
			response.json(read.reply);
			return;
		}
		const exists = listSemanticBoards(vault).map((one) => one.name);
		response.status(404).json({
			success: false,
			code: "BOARD_MISSING",
			error:
				`No board named ${read.missing.map((name) => JSON.stringify(name)).join(", ")} in this vault. ` +
				(exists.length === 0 ? "The vault holds no board." : `It holds ${exists.join(", ")}.`),
			missing: read.missing,
		});
	} catch (error) {
		response.status(500).json({ success: false, error: errorMessage(error) });
	}
}

/**
 * Mount `GET /api/vault/design-questions`.
 * @param app The application.
 */
function mountDesignQuestionsRoute(app: Express): void {
	app.get("/api/vault/design-questions", requireVault, answerQuestions);
}

export { mountDesignQuestionsRoute };

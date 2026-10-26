// Faults run after real durable filesystem operations. No runtime collaborator is replaced.
import fs from "node:fs";
const rename = fs.renameSync;
const sync = fs.fsyncSync;
const unlink = fs.unlinkSync;
let renamed = "";
fs.renameSync = (from, to) => {
	rename(from, to);
	renamed = String(to);
};
fs.fsyncSync = (fd) => {
	sync(fd);
	if (!fs.fstatSync(fd).isDirectory()) return;
	const point = process.env["ARCHBOARD_EDIT_CRASH"];
	if (renamed.endsWith("/transaction.json")) {
		const phase = JSON.parse(fs.readFileSync(renamed, "utf8")).phase;
		if (point === phase) process.exit(86);
	}
	if (point === "file" && renamed.endsWith("/gateway.module.json")) process.exit(86);
};
fs.unlinkSync = (path) => {
	if (
		process.env["ARCHBOARD_EDIT_CRASH"] === "cleanup" &&
		String(path).endsWith("/transaction.json")
	)
		throw new Error("fixture cleanup refusal");
	unlink(path);
};

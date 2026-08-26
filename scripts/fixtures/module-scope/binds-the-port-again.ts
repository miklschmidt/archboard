// Binding at evaluation time binds again on every reload. The second bind
// fails on EADDRINUSE against this very process, which the canvas's own
// loopback guard reads as a second server and exits over.

import { createServer } from "node:http";
import { kept } from "../../../src/core/hot.js";

const server = kept("fixture-server", () => createServer());

server.listen(3000, "127.0.0.1");

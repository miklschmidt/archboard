import express from "express";
import { createServerHttpServer } from "#server/http/listener/wiring/http-server.ts";

/** The one Express application every server route and middleware mounts on. */
const app = express();

/** The HTTP server the application listens through; the lifetime owns its start and stop. */
const server = createServerHttpServer(app);

export { app, server };

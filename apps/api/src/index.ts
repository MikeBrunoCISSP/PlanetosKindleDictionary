import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import corsPlugin from "./plugins/cors.js";
import securityPlugin from "./plugins/security.js";
import sessionPlugin from "./plugins/session.js";
import rateLimitPlugin from "./plugins/rateLimit.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import seriesRoutes from "./routes/series.js";
import entriesRoutes from "./routes/entries.js";
import turnstileRoutes from "./routes/turnstile.js";
import searchRoutes from "./routes/search.js";
import entryEditProposalRoutes from "./routes/entryEditProposals.js";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(corsPlugin);
await app.register(securityPlugin);
await app.register(sessionPlugin);
await app.register(rateLimitPlugin);
await app.register(errorHandlerPlugin);

await app.register(authRoutes, { prisma });
await app.register(adminRoutes, { prisma });
await app.register(seriesRoutes, { prisma });
await app.register(entriesRoutes, { prisma });
await app.register(turnstileRoutes, { prisma });
await app.register(searchRoutes, { prisma });
await app.register(entryEditProposalRoutes, { prisma });

app.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env["PORT"] ?? 3000);
await app.listen({ port, host: "0.0.0.0" });

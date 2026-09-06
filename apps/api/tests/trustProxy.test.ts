import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./helpers.js";

const EDGE_IP = "10.0.0.1"; // simulated Railway edge - the raw socket peer
const REAL_CLIENT_IP = "203.0.113.7";
const ATTACKER_CLAIMED_IP = "198.51.100.99";

// Trusts exactly one hop back from the socket peer, mirroring
// apps/api/src/index.ts's `trustProxy` (openspec: security/input-hardening).
// See openspec/changes/add-trusted-proxy-config/design.md for why a hop
// count alone can't distinguish the trusted edge from a client that reached
// the app directly - that guarantee comes from network topology, not this
// function or these tests.
const TRUST_ONE_HOP = (_address: string, hop: number) => hop < 1;

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

async function buildEchoApp(trustProxy?: typeof TRUST_ONE_HOP) {
  const built = await buildApp(trustProxy ? { trustProxy } : {});
  app = built.app;
  app.get("/ip", async (request) => ({ ip: request.ip }));
  await app.ready();
  return built;
}

describe("trustProxy", () => {
  it("resolves the real client through a trusted single hop", async () => {
    await buildEchoApp(TRUST_ONE_HOP);

    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: EDGE_IP,
      headers: { "x-forwarded-for": REAL_CLIENT_IP },
    });

    expect(res.json()).toEqual({ ip: REAL_CLIENT_IP });
  });

  it("ignores a client-supplied forwarded-for entry beyond the trusted hop", async () => {
    await buildEchoApp(TRUST_ONE_HOP);

    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: EDGE_IP,
      headers: { "x-forwarded-for": `${ATTACKER_CLAIMED_IP}, ${REAL_CLIENT_IP}` },
    });

    expect(res.json()).toEqual({ ip: REAL_CLIENT_IP });
  });

  it("without trustProxy configured, ignores forwarded-for entirely (baseline)", async () => {
    await buildEchoApp();

    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: EDGE_IP,
      headers: { "x-forwarded-for": REAL_CLIENT_IP },
    });

    expect(res.json()).toEqual({ ip: EDGE_IP });
  });
});

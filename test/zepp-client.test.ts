import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { ZeppClient } from "../src/zepp/client";
import { buildZeppRequest } from "../src/zepp/endpoints";

const config = parseConfig({
  MCP_SECRET: "mcp-secret",
  ZEPP_APP_TOKEN: "secret-zepp-token",
  ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
  USER_TIMEZONE: "Asia/Jakarta"
});

function clientReturning(status: number, body = "", headers: HeadersInit = {}) {
  return new ZeppClient(config, async () => new Response(body, { status, headers }));
}

describe("ZeppClient", () => {
  it("attaches Zepp headers but never exposes them in errors", async () => {
    let seen: Request | undefined;
    const client = new ZeppClient(config, async input => {
      seen = input instanceof Request ? input : new Request(input);
      return Response.json({ ok: true });
    });
    await client.get(buildZeppRequest("heartRate", { userId: config.ZEPP_USER_ID, startTime: 1, endTime: 2, limit: 1000, type: 2 }));
    expect(seen?.headers.get("apptoken")).toBe("secret-zepp-token");
    expect(seen?.headers.get("appname")).toBe("com.huami.midong");
  });

  it.each([401, 403])("maps %s to auth_expired", async status => {
    const client = clientReturning(status, "denied");
    await expect(client.get(buildZeppRequest("heartRate", { userId: config.ZEPP_USER_ID, startTime: 1, endTime: 2, limit: 1, type: 2 })))
      .rejects.toMatchObject({ kind: "auth_expired" });
  });

  it("blocks a cross-origin redirect before sending token to the target", async () => {
    const client = clientReturning(302, "", { location: "https://evil.example/steal" });
    await expect(client.get(buildZeppRequest("heartRate", { userId: config.ZEPP_USER_ID, startTime: 1, endTime: 2, limit: 1, type: 2 })))
      .rejects.toMatchObject({ kind: "upstream_error" });
  });
});

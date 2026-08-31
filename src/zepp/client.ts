import type { AppConfig } from "../config";
import { ZeppError } from "../errors";
import type { ZeppRequest } from "./endpoints";

const ZEP_HEADERS: Record<string, string> = {
  appname: "com.huami.midong",
  appplatform: "ios_phone",
  accept: "*/*",
  v: "2.0",
  vn: "10.2.5",
  cv: "1722_10.2.5",
  vb: "202604132257",
  lang: "en",
  country: "",
  timezone: "UTC"
};

const BACKOFF_MS = [50, 150] as const;
const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class ZeppClient {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async get(request: ZeppRequest): Promise<unknown> {
    let url = this.makeUrl(request);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await this.fetchOnce(url);
      } catch {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
          continue;
        }
        throw new ZeppError("upstream_error", "Zepp request failed after retry budget");
      }

      if (response.status >= 300 && response.status <= 399) {
        url = this.validateRedirect(url, response.headers.get("location"));
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new ZeppError("auth_expired", "Zepp authentication expired", response.status);
      }
      if (response.status === 429) {
        throw new ZeppError(
          "upstream_rate_limited",
          "Zepp rate limited the request",
          429,
          response.headers.get("retry-after") ?? undefined
        );
      }
      if (response.status >= 500 && response.status <= 599) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
          continue;
        }
        throw new ZeppError("upstream_error", "Zepp service unavailable", response.status);
      }
      if (!response.ok) {
        throw new ZeppError("upstream_error", `Unexpected Zepp HTTP status ${response.status}`, response.status);
      }
      try {
        return await response.json();
      } catch {
        throw new ZeppError("unrecognized_payload", "Zepp returned invalid JSON", response.status);
      }
    }
    throw new ZeppError("upstream_error", "Zepp retry budget exhausted");
  }

  private makeUrl(request: ZeppRequest): URL {
    const url = new URL(request.path, this.config.ZEPP_REGION_HOST);
    for (const [key, value] of Object.entries(request.query)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("r", `ZEPPMCP-${crypto.randomUUID()}`);
    return url;
  }

  private fetchOnce(url: URL): Promise<Response> {
    return this.fetchImpl(new Request(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        ...ZEP_HEADERS,
        apptoken: this.config.ZEPP_APP_TOKEN,
        "user-agent": "zepp-cloud-mcp/0.1.0"
      },
      signal: AbortSignal.timeout(35_000)
    }));
  }

  private validateRedirect(current: URL, location: string | null): URL {
    if (!location) throw new ZeppError("upstream_error", "Zepp redirect omitted Location");
    const next = new URL(location, current);
    const base = new URL(this.config.ZEPP_REGION_HOST);
    if (next.protocol !== "https:" || next.hostname !== base.hostname || next.port !== base.port) {
      throw new ZeppError("upstream_error", "Zepp redirect left approved origin");
    }
    return next;
  }
}

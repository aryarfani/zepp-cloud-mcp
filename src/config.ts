export interface SecretEnv {
  MCP_SECRET: string;
  ZEPP_APP_TOKEN: string;
  ZEPP_USER_ID: string;
  ZEPP_REGION_HOST: string;
  USER_TIMEZONE: string;
}

export interface AppConfig extends SecretEnv {
  regionLabel: string;
}

declare global {
  interface Env {
    MCP_SECRET: string;
    ZEPP_APP_TOKEN: string;
    ZEPP_USER_ID: string;
    ZEPP_REGION_HOST: string;
    USER_TIMEZONE: string;
  }
}

export function parseConfig(env: SecretEnv): AppConfig {
  if (!env.MCP_SECRET || !env.ZEPP_APP_TOKEN) {
    throw new Error("Required Worker secrets are missing");
  }
  if (!/^\d+$/.test(env.ZEPP_USER_ID)) {
    throw new Error("ZEPP_USER_ID must be numeric");
  }
  const url = new URL(env.ZEPP_REGION_HOST);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("ZEPP_REGION_HOST must be a bare HTTPS origin");
  }
  if (!/^api-mifit(?:-[a-z0-9]+)?\.(?:zepp|huami)\.com$/i.test(url.hostname)) {
    throw new Error("ZEPP_REGION_HOST is not an approved Zepp/Huami API host");
  }
  const match = url.hostname.match(/^api-mifit-([a-z0-9]+)\.zepp\.com$/i);
  return { ...env, regionLabel: match?.[1] ?? "global" };
}

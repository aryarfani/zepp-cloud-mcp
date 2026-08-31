interface Env {
  ZEPP_USER_ID: string;
  ZEPP_REGION_HOST: string;
  USER_TIMEZONE: string;
  MCP_SECRET: string;
  ZEPP_APP_TOKEN: string;
}

type ExportedHandler<Environment = Env> = {
  fetch?: (request: Request, env: Environment, ctx: ExecutionContext) => Response | Promise<Response>;
};

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

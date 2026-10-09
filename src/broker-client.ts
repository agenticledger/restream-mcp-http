import jwt from "jsonwebtoken";
import {
  ConnectionRequired,
  SafeError,
  type CredentialResolver,
} from "./api-client.js";
export interface BrokerConfig {
  baseUrl: string;
  namespace: string;
  bearer: string;
  key: string;
}
export function brokerConfig(
  env: NodeJS.ProcessEnv = process.env,
): BrokerConfig {
  return {
    baseUrl:
      env.BROKER_BASE_URL ?? "https://connectionsbroker.agenticledger.ai",
    namespace: env.BROKER_CLIENT_NAMESPACE ?? "",
    bearer: env.BROKER_INSTALL_BEARER ?? "",
    key: env.BROKER_JWT_KEY ?? "",
  };
}
export function configured(c: BrokerConfig) {
  return !!(c.namespace && c.bearer && c.key);
}
export function brokerResolver(
  principal: string,
  account: string,
  config: BrokerConfig = brokerConfig(),
  fetcher: typeof fetch = fetch,
): CredentialResolver {
  return async () => {
    if (!configured(config) || !principal)
      throw new SafeError(
        "broker_unconfigured",
        "Broker installation identity and a caller principal are required.",
      );
    const base = new URL(config.baseUrl);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new SafeError(
        "broker_unconfigured",
        "Broker URL must be HTTPS without credentials, query or fragment.",
      );
    const call = async (path: string) => {
      try {
        const response = await fetcher(new URL(path, base), {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.bearer}`,
            "X-Broker-Token": jwt.sign(
              { clientNamespace: config.namespace, principal },
              config.key,
              { algorithm: "HS256", expiresIn: 60 },
            ),
          },
          body: JSON.stringify({
            provider: "restream",
            ...(account ? { account } : {}),
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          return {
            status: response.status,
            data: {} as Record<string, unknown>,
          };
        }
        const raw = await response.text();
        if (raw.length > 100000) throw new Error("oversized");
        return {
          status: response.status,
          data: JSON.parse(raw) as Record<string, unknown>,
        };
      } catch {
        throw new SafeError(
          "broker_unavailable",
          "Connections Broker is unavailable. Retry later.",
        );
      }
    };
    const token = await call("/token");
    if (token.status === 404) {
      const connect = await call("/connect");
      const link = connect.data.authorizeUrl;
      if (
        connect.status >= 200 &&
        connect.status < 300 &&
        typeof link === "string"
      ) {
        const url = new URL(link);
        if (url.protocol !== "https:" || url.hostname !== "api.restream.io")
          throw new SafeError(
            "invalid_connect_url",
            "Broker returned an unexpected consent URL.",
          );
        throw new ConnectionRequired(link);
      }
      throw new SafeError(
        "provider_unconfigured",
        "Restream connection cannot start; ask the broker operator to check the OAuth app configuration.",
      );
    }
    if (
      token.status !== 200 ||
      typeof token.data.accessToken !== "string" ||
      !token.data.accessToken
    )
      throw new SafeError(
        "broker_token_unavailable",
        "Broker could not resolve a Restream token. Reconnect or retry later.",
      );
    return token.data.accessToken;
  };
}

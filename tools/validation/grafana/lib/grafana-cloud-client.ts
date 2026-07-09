// Shared HTTP Basic Auth query helper for Grafana Cloud's hosted Loki/Tempo/
// Prometheus APIs. Grafana Cloud has no SDK for any of these — querying is
// plain HTTPS with the per-signal Instance ID as username and a Cloud Access
// Policy token as password (see INVESTIGATE-grafana-cloud-validator.md).

export interface GrafanaCloudCredentials {
  instanceId: string;
  token: string;
}

/**
 * GET a Grafana Cloud query API endpoint with HTTP Basic Auth.
 * Throws with the response body included if the request doesn't return 2xx —
 * never silently swallow a failure the way the original bash query-loki.sh did.
 */
export async function grafanaCloudQuery(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  creds: GrafanaCloudCredentials,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const auth = Buffer.from(`${creds.instanceId}:${creds.token}`).toString('base64');
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Grafana Cloud query failed: ${response.status} ${response.statusText}\nURL: ${url}\nBody: ${text}`,
    );
  }

  return JSON.parse(text);
}

export function credentialsFromEnv(instanceIdVar: string, tokenVar: string): GrafanaCloudCredentials {
  const instanceId = process.env[instanceIdVar];
  const token = process.env[tokenVar];
  if (!instanceId || !token) {
    throw new Error(`Missing required environment variables: ${instanceIdVar}, ${tokenVar}`);
  }
  return { instanceId, token };
}

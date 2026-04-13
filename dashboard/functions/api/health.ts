interface AssetFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface PagesFunctionContext {
  request: Request;
  env: {
    ASSETS: AssetFetcher;
  };
}

async function fetchJson<T>(context: PagesFunctionContext, path: string): Promise<T | null> {
  const url = new URL(path, context.request.url);
  const response = await context.env.ASSETS.fetch(url);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

export const onRequestGet = async (context: PagesFunctionContext): Promise<Response> => {
  const [manifest, overview] = await Promise.all([
    fetchJson<{ generatedAtUtc: string | null; publishVersion: string | null }>(context, "/data/manifest.json"),
    fetchJson<{ latestDailyStatus: string | null; researchRecommendation: string | null }>(context, "/data/overview.json")
  ]);

  const ok = Boolean(manifest && overview);
  return Response.json(
    {
      ok,
      generatedAtUtc: manifest?.generatedAtUtc ?? null,
      publishVersion: manifest?.publishVersion ?? null,
      latestDailyStatus: overview?.latestDailyStatus ?? null,
      headline: overview
        ? `${overview.latestDailyStatus ?? "n/a"} / ${overview.researchRecommendation ?? "n/a"}`
        : "unavailable"
    },
    {
      status: ok ? 200 : 503
    }
  );
};

// @oktis-works/cms - npm Registry Client (search + latest version)

const REGISTRY = 'https://registry.npmjs.org';

export interface NpmSearchResult {
  name: string;
  version: string;
  description: string;
  links?: { npm?: string };
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`npm registry responded with ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

export async function searchExtensions(
  kind: 'plugin' | 'theme',
  query = ''
): Promise<NpmSearchResult[]> {
  const keyword = kind === 'plugin' ? 'okcms-plugin' : 'okcms-theme';
  const text = query ? `${query} keywords:${keyword}` : `keywords:${keyword}`;
  const url = `${REGISTRY}/-/v1/search?text=${encodeURIComponent(text)}&size=15`;

  const payload = await fetchJson<{
    objects: Array<{ package: { name: string; version: string; description?: string; links?: { npm?: string } } }>;
  }>(url);

  return payload.objects.map(({ package: pkg }) => ({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description ?? '',
    links: pkg.links,
  }));
}

export async function getLatestVersion(packageName: string): Promise<string | null> {
  try {
    const payload = await fetchJson<{ 'dist-tags'?: { latest?: string } }>(
      `${REGISTRY}/${encodeURIComponent(packageName).replace('%40', '@')}`
    );
    return payload['dist-tags']?.latest ?? null;
  } catch {
    return null;
  }
}

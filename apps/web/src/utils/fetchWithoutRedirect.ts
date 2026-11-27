const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// A server-side read from the api that must not follow a redirect, so a response cannot
// come from another origin. Cloudflare Workers have no `redirect: 'error'`, so the redirect
// is read with 'manual' and refused here. A 304 is not a redirect and passes.
export async function fetchWithoutRedirect(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (REDIRECT_STATUSES.has(response.status)) {
    throw new TypeError(`The api answered ${url} with a redirect`);
  }
  return response;
}

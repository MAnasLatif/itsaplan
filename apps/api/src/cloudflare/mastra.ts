// Stands in for Mastra in the Cloudflare Workers build of the api (the `alias` block of
// wrangler.jsonc). Internal agents do not run on Workers yet: Mastra's Postgres store keeps a
// pool of its own, which a Worker cannot share across requests. Leaving Mastra out also keeps
// the Worker inside its startup CPU limit; it is about two fifths of the bundle.
//
// Nothing here runs while the Worker loads. Running an agent fails with the error below. With
// no provider registry, getProviderConfig knows no provider: the catalog shows no docs link and
// a key for a provider without a check of its own is recorded as unchecked.

const NOT_ON_WORKERS =
  'Internal AI agents do not run on Cloudflare Workers yet (docs/cloudflare.md)';

class Unavailable {
  constructor() {
    throw new Error(NOT_ON_WORKERS);
  }
}

export class Agent extends Unavailable {}
export class Mastra extends Unavailable {}
export class Memory extends Unavailable {}
export class PostgresStore extends Unavailable {}
export class Observability extends Unavailable {}
export class MastraStorageExporter extends Unavailable {}

export function createTool(): never {
  throw new Error(NOT_ON_WORKERS);
}

export function getProviderConfig(): undefined {
  return undefined;
}

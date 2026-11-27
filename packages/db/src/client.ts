import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function connect(connectionString: string) {
  return drizzle(postgres(connectionString, { prepare: false }), { schema });
}

type Db = ReturnType<typeof connect>;

// A Cloudflare Worker may not use a socket that another request opened, so each request
// there gets its own client (runWithDb). Hyperdrive keeps the pooled connections to
// Postgres, so a client per request costs no new Postgres connection.
const requestDb = new AsyncLocalStorage<Db>();
let processDb: Db | undefined;

// One client per process everywhere else. postgres-js manages the pool internally.
function processClient(): Db {
  if (processDb) return processDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Check your .env (see .env.example at the monorepo root).',
    );
  }
  return (processDb = connect(connectionString));
}

export const db = new Proxy({} as Db, {
  get(_, key) {
    const target = requestDb.getStore() ?? processClient();
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export function runWithDb<T>(connectionString: string, fn: () => T): T {
  return requestDb.run(connect(connectionString), fn);
}

// Either the plain db or a transaction, for a function whose caller may need to
// share one transaction across several reads/writes that must observe the same
// snapshot (a lock taken, then a read, then a write, all inside one db.transaction).
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

import { bindings, defineConfig, defineWorker } from 'cf/config';

// The web on Cloudflare Workers, built by vinext (vite.config.ts). This file drives `vite dev`
// and the build; the deploy reads wrangler.deploy.jsonc. In dev the values come from the
// shell, the api on localhost by default. nodejs_compat puts them on process.env, where
// utils/runtimeEnv reads them per request.
const text = (name: string, fallback = '') => bindings.text(process.env[name] || fallback);

export default defineConfig({
  worker: defineWorker({
    name: 'itsaplan-web',
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-06-01',
    compatibilityFlags: ['nodejs_compat'],
    observability: { enabled: true },
    assets: {
      htmlHandling: 'none',
      notFoundHandling: 'none',
      runWorkerFirst: ['/*', '!/_next/static/*', '!/*/_next/static/*'],
    },
    env: {
      ASSETS: bindings.assets(),
      API_URL: text('API_URL', 'http://localhost:8787'),
      SERVICE_URL_API: text('SERVICE_URL_API'),
      PRIVACY_URL: text('PRIVACY_URL'),
      TERMS_URL: text('TERMS_URL'),
    },
  }),
});

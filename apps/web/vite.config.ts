import { defineConfig, type Plugin } from 'vite';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';
import { createHash } from 'node:crypto';
import { patchCssModules } from 'vite-css-modules';
import path from 'node:path';

// The Cloudflare Workers build of the web (vinext). `next build` stays the Docker build.

// These modules are loaded only through next/dynamic with `ssr: false`, so the server never
// runs them. `next build` leaves such an import out of the server bundle; vinext keeps it,
// and their WebAssembly and font data would put the Worker over its 10 MB limit. On the
// server each one is replaced by a module that renders nothing, under the names its
// importers read.
const CLIENT_ONLY: Record<string, string[]> = {
  'src/components/extend/pdf-viewer.tsx': ['PDFViewer'],
  'src/components/extend/docx-viewer.tsx': ['DocxViewerPreview'],
  'src/components/extend/xlsx-viewer.tsx': ['XlsxViewerPreview'],
  'src/components/extend/pptx-viewer.tsx': ['PptxViewerPreview'],
  'src/features/api-docs/components/ScalarReference.tsx': ['default'],
};

function clientOnlyOnServer(): Plugin {
  return {
    name: 'itsaplan:client-only-on-server',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name !== 'client',
    load(id) {
      const file = path
        .relative(import.meta.dirname, id.replace(/\?.*$/, ''))
        .replaceAll('\\', '/');
      const names = CLIENT_ONLY[file];
      if (!names) return;
      return [
        'const Nothing = () => null;',
        ...names.map((name) =>
          name === 'default' ? 'export default Nothing;' : `export const ${name} = Nothing;`,
        ),
      ].join('\n');
    },
  };
}

export default defineConfig({
  plugins: [
    clientOnlyOnServer(),
    patchCssModules({ exportMode: 'default' }),
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
  css: {
    modules: {
      generateScopedName(name: string, filename: string) {
        const relativePath = path
          .relative(import.meta.dirname, filename.replace(/\?.*$/, ''))
          .replaceAll('\\', '/');
        return `_${name}_${createHash('sha256').update(relativePath).digest('hex').slice(0, 7)}`;
      },
    },
  },
});

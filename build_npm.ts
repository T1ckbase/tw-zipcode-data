import { build, emptyDir } from '@deno/dnt';
import denoJson from './deno.json' with { type: 'json' };

await emptyDir('./npm');

await build({
  entryPoints: ['./data/zipcode-data.csv.json'],
  outDir: './npm',
  skipNpmInstall: true,
  test: false,
  compilerOptions: {
    lib: ['ESNext'],
  },
  shims: {
    // see JS docs for overview and more options
    deno: true,
  },
  package: {
    // package.json properties
    name: '@t1ckbase/tw-zipcode-data',
    version: denoJson.version,
    description: '中華郵政的3+3郵遞區號資料',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/T1ckbase/tw-zipcode-data.git',
    },
    bugs: {
      url: 'https://github.com/T1ckbase/tw-zipcode-data/issues',
    },
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync('LICENSE', 'npm/LICENSE');
    Deno.copyFileSync('README.md', 'npm/README.md');
  },
});

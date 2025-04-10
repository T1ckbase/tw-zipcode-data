import denoJson from '../deno.json' with { type: 'json' };
import { download } from './download.ts';

function incrementVersion(version: string, position = 2) {
  const parts = version.split('.').map(Number);
  parts[position]++;
  for (let i = position + 1; i < parts.length; i++) {
    parts[i] = 0;
  }
  return parts.join('.');
}

await download();

const newJson = {
  ...denoJson,
  version: incrementVersion(denoJson.version, 1),
};

await Deno.writeTextFile('./deno.json', JSON.stringify(newJson, null, 2));

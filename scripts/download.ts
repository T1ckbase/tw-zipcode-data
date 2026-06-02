import path from 'node:path';

import { format } from 'oxfmt';

import type { Address } from '../index.d.ts';
import packageJson from '../package.json' with { type: 'json' };
import { fetchAddressesByCity, fetchPageData } from './utils/downloader.ts';

const distPath = path.resolve(import.meta.dirname, '../dist');
const packageJsonPath = path.resolve(import.meta.dirname, '../package.json');

const { cities, updateDate } = await fetchPageData();

const addresses: Address[] = [];
for (const city of cities) {
  const cityAddresses = await fetchAddressesByCity(city);
  addresses.push(...cityAddresses);
  console.log(`${city}: ${cityAddresses.length}`);
}

console.log(`Fetched ${addresses.length} addresses`);

await Bun.write(path.join(distPath, 'data.json'), JSON.stringify(addresses));
await Bun.write(path.join(distPath, 'index.d.ts'), Bun.file(path.resolve(import.meta.dirname, '../index.d.ts')));

if (Bun.argv.includes('--update')) {
  packageJson.updateDate = updateDate;

  const { code, errors } = await format(packageJsonPath, JSON.stringify(packageJson), { sortPackageJson: true });

  if (errors.length !== 0) {
    throw new Error(`Failed to format package.json: ${errors.map((error) => error.message).join(', ')}`);
  }

  await Bun.write(packageJsonPath, code);

  console.info('Updated package.json');
}

import packageJson from '../package.json';
import { Downloader, getPageData } from './downloader';
import { ocr } from './ocr';

const data = await getPageData();

if (data.updateDate === packageJson.metadata.updateDate) {
  process.exit();
}

const vKey = data.captchaUrl.searchParams.get('vKey');
if (!vKey) throw new Error('vKey not found');

const code = await ocr(data.captchaUrl.href);
if (!code) throw new Error('Unable to recognize text');

// const vKey = '116a0aa2-c8e3-4bfb-9642-b64a29c1643e';
// const code = '9731';

const downloader = new Downloader(data.cities, vKey, code);

const addresses = await downloader.download();

console.log(addresses.length);
await Bun.write('dist/data.json', JSON.stringify(addresses));
await Bun.write('dist/types.d.ts', Bun.file('src/types.d.ts'));

await Bun.$`npm version patch -m ${'Update data'}`;

await Bun.write('package.json', JSON.stringify(packageJson, null, 2));

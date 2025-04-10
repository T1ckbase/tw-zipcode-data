import { ensureDir } from '@std/fs';
import { stringify } from '@std/csv';
import { columns, ZipcodeDataDownloader } from './zipcode-data-downloader.ts';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

if (!Deno.env.get('HUGGINGFACE_API_KEY')) throw new Error('Missing HUGGINGFACE_API_KEY');

const huggingface = createOpenAICompatible({
  apiKey: Deno.env.get('HUGGINGFACE_API_KEY')!,
  baseURL: 'https://api-inference.huggingface.co/v1',
  name: 'Hugging Face',
});

const downloader = new ZipcodeDataDownloader(huggingface('meta-llama/Llama-3.2-11B-Vision-Instruct'));
const date = await downloader.getLastUpdateDate();
console.log('Last update date:', date);

// const captcha = await zipcodeDataDownloader.getCaptchaUrl();
// console.log(captcha);

// const countys = await downloader.getCountys();
// console.log(countys);
// await zipcodeDataDownloader.getZips('臺北市');

const data = await downloader.download();
console.log(data.length);

await ensureDir('./data');
await Deno.writeTextFile('./data/zipcode-data.csv.json', JSON.stringify(data));
await Deno.writeTextFile('./data/zipcode-data.csv', stringify(data, { columns }));

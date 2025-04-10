import { ZipcodeDataDownloader } from './zipcode-data-downloader.ts';

async function main() {
  const downloader = new ZipcodeDataDownloader();

  const res = await fetch('https://raw.githubusercontent.com/T1ckbase/tw-zipcode-data/main/data/zipcode-data-date.txt');
  const currentDataDate = (await res.text()).trim();

  const date = await downloader.getLastUpdateDate();
  if (currentDataDate === date) return;
}

Deno.cron('check update', '0 0 * * *', main);

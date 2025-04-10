import { ZipcodeDataDownloader } from './zipcode-data-downloader.ts';

async function main() {
  const downloader = new ZipcodeDataDownloader();

  const date = await downloader.getLastUpdateDate();
}

Deno.cron('check update', '0 0 * * *', main);

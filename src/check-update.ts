import { ZipcodeDataDownloader } from './zipcode-data-downloader.ts';

async function main() {
  if (!Deno.env.has('GITHUB_TOKEN')) throw new Error('Missing GITHUB_TOKEN');

  const downloader = new ZipcodeDataDownloader();

  const res = await fetch('https://raw.githubusercontent.com/T1ckbase/tw-zipcode-data/main/data/zipcode-data-date.txt');
  if (!res.ok) throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);
  const currentDataDate = (await res.text()).trim();

  const date = await downloader.getLastUpdateDate();
  if (currentDataDate === date) {
    console.log('No update');
    return;
  }

  const res2 = await fetch('https://api.github.com/repos/T1ckbase/tw-zipcode-data/actions/workflows/update.yaml/dispatches', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: '{"ref": "main"}',
  });
  if (!res2.ok) throw new Error(`Failed to dispatch workflow: ${res2.status} ${res2.statusText}`);
}

Deno.cron('check update', '0 0 * * *', main);
// await main();

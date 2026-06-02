import type { Address } from '../../index.d.ts';

const URL = 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208';

function parseMinguoDate(minguoDateStr: string): string {
  const match = minguoDateStr.match(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);

  if (!match) throw new Error(`Invalid Minguo date format: "${minguoDateStr}"`);

  const [, minguoYearStr, monthStr, dayStr] = match;

  if (!minguoYearStr || !monthStr || !dayStr) {
    throw new Error('Failed to parse date components');
  }

  const westernYear = parseInt(minguoYearStr, 10) + 1911;
  const formattedMonth = monthStr.padStart(2, '0');
  const formattedDay = dayStr.padStart(2, '0');

  return `${westernYear}-${formattedMonth}-${formattedDay}`;
}

export async function fetchPageData(): Promise<{ cities: string[]; updateDate: string }> {
  const res = await fetch(URL);

  if (!res.ok) {
    throw new Error(`Failed to fetch page data: ${res.status} ${res.statusText}`);
  }

  let spanText = '';
  let minguoDateStr: string | null = null;
  const cities: (string | null)[] = [];

  const rewriter = new HTMLRewriter()
    .on('span', {
      element(element) {
        if (minguoDateStr) return;

        spanText = '';

        element.onEndTag(() => {
          const found = spanText.match(/最近更新日期[\s\S]+?(\d+\s*年\s*\d+\s*月\s*\d+\s*日)/);
          if (found && found[1]) {
            minguoDateStr = found[1].replace(/\s+/g, '');
          }
        });
      },
      text(text) {
        if (minguoDateStr) return;

        spanText += text.text;
      },
    })
    .on('select#city2_zip6 option:not([value="%"])', {
      element(element) {
        const value = element.getAttribute('value');
        cities.push(value);
      },
    });

  await rewriter.transform(res).body!.pipeTo(new WritableStream());

  if (!minguoDateStr) {
    throw new Error('Failed to find update date in page data');
  }

  if (cities.length === 0) {
    throw new Error('Failed to find any cities in page data');
  }

  if (cities.some((value) => value === null)) {
    throw new Error('Page data contains a city option without a value');
  }

  return {
    cities: cities as string[],
    updateDate: parseMinguoDate(minguoDateStr),
  };
}

export async function fetchAddressesByCity(city: string) {
  const payload = {
    list: '5',
    list_type: '2',
    firstView: '4',
    firstView2: '1',
    city2_zip6: city,
    cityarea2_zip6: '%',
    road_zip6: '',
    sec_zip6: '%',
    Submit: '查詢',
  };

  const res = await fetch(URL, { method: 'POST', body: new URLSearchParams(payload) });

  if (!res.ok) {
    throw new Error(`Failed to fetch addresses for ${city}: ${res.status} ${res.statusText}`);
  }

  let spanText = '';
  let tdText = '';
  const addresses: Address[] = [];
  let error: Error | null = null;
  let isDone = false;

  const rewriter = new HTMLRewriter()
    .on('span', {
      element(element) {
        if (error) return;

        spanText = '';

        element.onEndTag(() => {
          // The server returns HTTP 200 even when the captcha is invalid
          if (spanText.includes('驗證碼輸入錯誤')) {
            error = new Error('Invalid captcha');
          }
        });
      },
      text(text) {
        spanText += text.text;
      },
    })
    .on('table.TableStyle_02:not(.pc_cont)', {
      element(element) {
        element.onEndTag(() => {
          isDone = true;
        });
      },
    })
    .on('table.TableStyle_02:not(.pc_cont) > tbody > tr:not(:first-child)', {
      element(element) {
        if (isDone || error) return;

        addresses.push([city] as unknown as Address);

        element.onEndTag(() => {
          if (addresses.at(-1)!.length !== 7) {
            error = new Error(`Invalid address row for ${city}: expected 7 columns`);
          }
        });
      },
    })
    .on('table.TableStyle_02:not(.pc_cont) > tbody > tr:not(:first-child) > td', {
      element(element) {
        if (isDone || error) return;

        tdText = '';

        element.onEndTag(() => {
          addresses.at(-1)!.push(tdText.replace(/\s+/g, ''));
        });
      },
      text(text) {
        if (isDone || error) return;

        tdText += text.text;
      },
    });

  await rewriter.transform(res).body!.pipeTo(new WritableStream());

  if (error) throw error;

  return addresses;
}

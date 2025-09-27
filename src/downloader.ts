import type { Address } from './types';

const BASE_URL = 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208';

interface PageData {
  updateDate: string;
  cities: string[];
  captchaUrl: URL;
}

// /**
//  * Parses a "Minguo" (民國) calendar date string (e.g., "112年10月26日")
//  * into a standard JavaScript Date object.
//  * @param minguoDateStr The date string in Minguo format.
//  * @returns A JavaScript Date object.
//  */
// function parseMinguoDate(minguoDateStr: string): Date {
//   const match = minguoDateStr.match(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
//   if (!match) {
//     throw new Error(`Invalid Minguo date format: "${minguoDateStr}"`);
//   }
//
//   const [, year, month, day] = match.map(Number);
//
//   // Minguo Year + 1911 = Gregorian Year
//   const gregorianYear = year + 1911;
//
//   // Create a UTC date to avoid timezone issues during parsing.
//   const date = new Date(Date.UTC(gregorianYear, month - 1, day));
//
//   if (isNaN(date.getTime())) {
//     throw new Error(`Could not parse Minguo date "${minguoDateStr}" into a valid Date.`);
//   }
//
//   return date;
// }

export async function extractPageData(response: Response): Promise<PageData> {
  let spanText = '';

  let minguoDateStr: string | null = null;
  const cities: string[] = [];
  let captchaSrc: string | null = null;

  const rewriter = new HTMLRewriter()
    .on('span', {
      text(text) {
        spanText += text.text;
        if (minguoDateStr) return;

        if (text.lastInTextNode) {
          const found = spanText.match(/最近更新日期[\s\S]+?(\d+\s*年\s*\d+\s*月\s*\d+\s*日)/);
          if (found && found[1]) {
            minguoDateStr = found[1];
          }

          spanText = '';
        }
      },
    })
    .on('select#city2_zip6 option:not([value="%"])', {
      element(element) {
        const value = element.getAttribute('value');
        if (!value) {
          throw new Error("Found a city <option> tag without a 'value' attribute.");
        }
        cities.push(value);
      },
    })
    .on('img#imgCaptcha2_zip6', {
      element(element) {
        const src = element.getAttribute('src');
        if (!src) {
          throw new Error("Captcha <img> tag is missing the 'src' attribute.");
        }
        captchaSrc = src;
      },
    });

  await rewriter.transform(response).text();

  if (!minguoDateStr) {
    throw new Error('Could not find the update date on the page.');
  }
  if (cities.length === 0) {
    throw new Error('No cities were found.');
  }
  if (!captchaSrc) {
    throw new Error('Could not find the captcha URL on the page.');
  }

  const updateDate = minguoDateStr; // parseMinguoDate(minguoDateStr);

  return {
    updateDate,
    cities,
    captchaUrl: new URL(captchaSrc, BASE_URL),
  };
}

export async function getPageData(): Promise<PageData> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  return extractPageData(res);
}

async function extractAddresses(response: Response, city: string): Promise<Address[]> {
  const keys: (keyof Address)[] = ['zipcode', 'district', 'road', 'section', 'range', 'bulkName'];

  let spanText = '';
  let tdText = '';
  const addresses: Address[] = [];
  let currentKey: keyof Address = 'city';

  let parsingError: Error | undefined = undefined;
  let isDone = false;

  const rewriter = new HTMLRewriter()
    .on('span', {
      text(text) {
        spanText += text.text;
        if (text.lastInTextNode) {
          if (spanText.includes('驗證碼輸入錯誤')) {
            parsingError = new Error('Invalid captcha');
          }

          spanText = '';
        }
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
      element() {
        if (isDone || parsingError) return;
        addresses.push({ city } as Address);
      },
    })
    .on('table.TableStyle_02:not(.pc_cont) > tbody > tr > td', {
      element() {
        if (isDone || parsingError) return;
        const lastAddress = addresses[addresses.length - 1]!;
        const key = keys.find((k) => !(k in lastAddress));
        if (!key) {
          parsingError = new Error('Unable to find a missing key in the last address.');
          return;
        }
        currentKey = key;
        lastAddress[currentKey] = '';
      },
      text(text) {
        if (isDone || parsingError) return;

        tdText += text.text;

        if (text.lastInTextNode) {
          const lastAddress = addresses[addresses.length - 1]!;
          lastAddress[currentKey] = tdText.trim();

          tdText = '';
        }
      },
    });

  await rewriter.transform(response).text();

  if (parsingError) throw parsingError;

  return addresses;
}

export class Downloader {
  constructor(
    public cities: string[],
    public vKey: string,
    public code: string,
  ) {}

  async download(): Promise<Address[]> {
    const addresses: Address[] = [];
    for (const city of this.cities) {
      console.log(`Starting download for city: ${city}...`);
      const data = await this.getAddressesByCity(city);
      console.log(`Downloaded ${data.length} addresses for ${city}`);
      addresses.push(...data);
    }
    if (addresses.some((address) => Object.keys(address).length !== 7)) throw new Error('Address structure validation failed.');

    return addresses;
  }

  async getAddressesByCity(city: string) {
    const formData = {
      list: '5',
      list_type: '2',
      firstView: '4',
      firstView2: '1',
      vKey: `${this.vKey}\r\n`,
      city2_zip6: city,
      cityarea2_zip6: '%',
      road_zip6: '',
      sec_zip6: '%',
      checkImange2_zip6: this.code,
      Submit: '查詢',
    };

    const formDataString = new URLSearchParams(formData).toString();
    // const formDataString = Object.entries(formData)
    //   .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    //   .join('&');

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formDataString,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const addresses = await extractAddresses(res, city);
    return addresses;
  }
}

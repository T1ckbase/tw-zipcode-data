import { DOMParser, type HTMLDocument } from '@b-fuze/deno-dom';
import { generateText, type LanguageModel } from 'ai';

export type Captcha = {
  key: string;
  code: string;
};

export const columns = ['郵遞區號', '縣市', '區域', '路名', '段號', '投遞範圍', '大宗段名稱'] as const;

export type ZipCodeObject = {
  [K in typeof columns[number]]: string;
};

// export type ZipCodeData = [
//   郵遞區號: string,
//   縣市: string,
//   區域: string,
//   路名: string,
//   段號: string,
//   投遞範圍: string,
//   大宗段名稱: string,
// ];

class CaptchaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptchaError';
  }
}

class CaptchaSolver {
  constructor(private model: LanguageModel) {}

  async solve(captchaUrl: string): Promise<string> {
    try {
      const { text } = await generateText({
        model: this.model,
        headers: {
          'x-use-cache': 'false',
        },
        system: 'You are a helpful OCR.',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Only return the 4-digit number in the image.' },
              { type: 'image', image: captchaUrl },
            ],
          },
        ],
      });
      return text;
    } catch (error) {
      throw new CaptchaError(`Failed to solve CAPTCHA: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export class ZipcodeDataDownloader {
  private dom: HTMLDocument | undefined;
  private captchaSolver: CaptchaSolver;
  private maxRetries = 3;

  constructor(
    private model: LanguageModel,
    private postGovUrl: string = 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208',
  ) {
    this.captchaSolver = new CaptchaSolver(model);
  }

  async download(): Promise<ZipCodeObject[]> {
    const captcha = await this.getCaptcha();
    console.log(`Got CAPTCHA: ${captcha.code}`);

    const countys = await this.getCountys();
    // const allData: ZipCodeData[] = [['郵遞區號', '縣市', '區域', '路名', '段號', '投遞範圍', '大宗段名稱']];
    const allData: ZipCodeObject[] = [];

    for (let i = 0; i < countys.length; i++) {
      const county = countys[i];
      console.log(`[${i + 1}/${countys.length}] Downloading ${county}...`);

      const data = await this.getZipsWithRetry(county, captcha);
      console.log(`[${i + 1}/${countys.length}] Downloaded ${data.length} data for ${county}`);

      allData.push(...data);
    }

    return allData;
  }

  async getZipsWithRetry(county: string, captcha: Captcha, retries = 0): Promise<ZipCodeObject[]> {
    try {
      // Pass the captcha info to getZips
      return await this.getZips(county, captcha);
    } catch (error) {
      if (error instanceof CaptchaError && retries < this.maxRetries) {
        const newCaptcha = await this.getCaptcha(true);
        console.log(`CAPTCHA failed for ${county}, retrying (${retries + 1}/${this.maxRetries})...`);
        return this.getZipsWithRetry(county, newCaptcha, retries + 1);
      }
      throw error;
    }
  }

  async fetchHTML(refresh = false): Promise<void> {
    if (this.dom && !refresh) return;

    const res = await fetch(this.postGovUrl);
    if (!res.ok) throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);

    const text = await res.text();
    this.dom = new DOMParser().parseFromString(text, 'text/html');
    if (!this.dom) throw new Error('Failed to parse HTML');
  }

  async getLastUpdateDate(): Promise<string> {
    await this.fetchHTML();
    const div = this.dom?.querySelector('div#ShareNav');
    const lastUpdatedDate = div?.textContent?.match(/最後更新日期：(\d+\/\d+\/\d+)/)?.[1];
    if (!lastUpdatedDate) throw new Error('Failed to find lastUpdated');
    return lastUpdatedDate;
  }

  async getCountys(): Promise<string[]> {
    await this.fetchHTML();
    const select = this.dom?.querySelector('select#city2_zip6');
    if (!select) throw new Error('Failed to find county select element');

    const options = Array.from(select.querySelectorAll('option'));
    // 第一個是"請選擇"，跳過
    options.shift();
    return options.map((option) => option.textContent.trim());
  }

  async getCaptchaUrl(refresh = false): Promise<string> {
    await this.fetchHTML(refresh);
    const img = this.dom?.querySelector('img#imgCaptcha2_zip6');
    if (!img) throw new Error('Failed to find captcha image element');
    const src = img.getAttribute('src');
    if (!src) throw new Error('Failed to find captcha image src');
    return new URL(src, this.postGovUrl).href;
  }

  async getCaptcha(refresh = false): Promise<Captcha> {
    const captchaUrl = await this.getCaptchaUrl(refresh);
    const url = new URL(captchaUrl);
    const key = url.searchParams.get('vKey');
    if (!key) throw new Error('Failed to find captcha key');

    const code = await this.captchaSolver.solve(captchaUrl);
    return { key, code };
  }

  async getZips(county: string, captcha: Captcha): Promise<ZipCodeObject[]> {
    const formData = {
      list: '5',
      list_type: '2',
      firstView: '4',
      firstView2: '1',
      vKey: `${captcha.key}\r\n`,
      city2_zip6: county,
      cityarea2_zip6: '%',
      road_zip6: '',
      sec_zip6: '%',
      checkImange2_zip6: captcha.code,
      Submit: '查詢',
    };

    const formDataString = Object.entries(formData).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');

    const res = await fetch(this.postGovUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formDataString,
    });
    if (!res.ok) throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`);

    const text = await res.text();
    if (text.includes('驗證碼輸入錯誤')) throw new CaptchaError('Captcha code is incorrect');

    const dom = new DOMParser().parseFromString(text, 'text/html');
    const table = dom.querySelector('table.TableStyle_02');
    if (!table) throw new Error('Failed to find table element');

    const rows = Array.from(table.querySelectorAll('tr'));
    // 第一個是表頭，跳過
    rows.shift();
    const data: ZipCodeObject[] = [];
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const zipCode = cells[0].textContent?.trim();
      if (!zipCode) continue;
      data.push({
        '郵遞區號': zipCode,
        '縣市': county,
        '區域': cells[1].textContent?.trim(),
        '路名': cells[2].textContent?.trim(),
        '段號': cells[3].textContent?.trim(),
        '投遞範圍': cells[4].textContent?.trim(),
        '大宗段名稱': cells[5].textContent?.trim(),
      });
    }
    return data;
  }
}

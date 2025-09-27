export async function ocr(imageUrl: string, retries = 3): Promise<string | null> {
  const url = 'https://models.github.ai/inference/chat/completions';
  const body = {
    model: 'openai/gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'You are a OCR' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Only return the 4-digit number in the image.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    // extra_body: {
    //   google: {
    //     thinking_config: {
    //       thinking_budget: 0,
    //     },
    //   },
    // },
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let message = '';
        try {
          message = ((await response.json()) as any)[0].error.message;
        } catch {}
        throw new Error(`HTTP ${response.status}: ${response.statusText}. ${message}`);
      }

      const data = (await response.json()) as any;
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text && /^\d{4}$/.test(text)) {
        return text;
      }

      if (text) {
        throw new Error(`Validation failed: Expected a 4-digit number, but got "${text}"`);
      } else {
        throw new Error('Validation failed: API returned an empty response.');
      }
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error instanceof Error ? error.message : error);

      if (attempt < retries) {
        console.log(`Retrying in 5s...`);
        await new Promise((res) => setTimeout(res, 5000));
      } else {
        return null;
      }
    }
  }

  return null;
}

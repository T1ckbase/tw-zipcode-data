use std/assert
plugin use query

overlay use (if ('.env.nu' | path exists) { '.env.nu' } else { null })

assert ('GITHUB_TOKEN' in $env)
echo $env.GITHUB_TOKEN

const BASE_URL = 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208'

def ocr [imageUrl: string, retries: int = 5] {
  const url = 'https://models.github.ai/inference/chat/completions'
  let headers = { Authorization: $'Bearer ($env.GITHUB_TOKEN)' }
  let body = {
    model: 'openai/gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'You are an OCR engine. Output ONLY the text found in the image. Do not provide explanations.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Output the 4-digit number in this image.' },
          { type: 'image_url', image_url: { url: $imageUrl } },
        ],
      },
    ],
    temperature: 0
  }

  for attempt in 1..$retries {
    try {
      let response = http post --content-type 'application/json' --headers $headers $url $body
      let content = $response | get --optional choices.0.message.content

      if ($content | is-empty) {
        error make {
          msg: 'Validation failed: API returned an empty response.'
        }
      }

      let text = $content | str trim

      if ($text !~ '^\d{4}$') {
        error make {
          msg: $'Validation failed: Expected a 4-digit number, but got $(text)'
        }
      }

      return $text
    } catch { |err|
      print --stderr $'(ansi yellow)Attempt ($attempt)/($retries) failed: ($err)(ansi default)'

      if ($attempt < $retries) {
        let wait_time = (2 ** $attempt * 1sec)
        print --stderr $'Retrying in ($wait_time)...'
        sleep $wait_time
      } else {
        error make {
          msg: $'HTTP POST failed after ($retries) attempts. Final error: ($err)'
        }
      }
    }
  }
}

def get-postal-metadata []: nothing -> record<updateDate: string, cities: list<string>, captchaUrl: string> {
  let response = http get 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208'
  let updateDate = $response | parse -r '最近更新日期[\s\S]+?(?<date>\d+\s*年\s*\d+\s*月\s*\d+\s*日)' | get date.0
  let cities = $response | query web --query 'select#city2_zip6 option:not([value="%"])' --attribute 'value'
  let captchaImg = $response | query web --query 'img#imgCaptcha2_zip6' --attribute 'src' | get 0
  let captchaUrl = $'https://www.post.gov.tw/post/internet/Postal/($captchaImg)'

  {
    updateDate: $updateDate,
    cities: $cities,
    captchaUrl: $captchaUrl
  }
}

def get-addresses-by-city [city: string, vKey: string, code: string] {
  let formDataString = (
    'list=5&list_type=2&firstView=4&firstView2=1&' +
    $'vKey=($vKey)%0A&city2_zip6=($city | url encode)&' +
    'cityarea2_zip6=%25&road_zip6=&sec_zip6=%25&' +
    $'checkImange2_zip6=($code)&Submit=%E6%9F%A5%E8%A9%A2'
  )
  http post --headers { 'Content-Type': 'application/x-www-form-urlencoded' } $BASE_URL $formDataString
    | query web --as-table ['郵遞區號', '區域', '路名', '段號', '投遞範圍', '大宗段名稱']
}

let data = get-postal-metadata
let vKey = $data.captcha_url | url parse | get params | where key == 'vKey' | get value.0
assert ($vKey != null)

let code = ocr $data.captcha_url
assert ($code != null)

let table = $data.cities | each { |city| get-addresses-by-city $city $vKey $code | upsert '縣市' $city} | flatten
# print $table
$table | to json | save --force out.json

import OpenAI from 'openai';

// LLM 프로바이더 설정
const LLM_PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    getApiKey: () => process.env.OPENAI_API_KEY,
  },
  onpremise: {
    baseURL: process.env.ONPREMISE_LLM_URL || 'https://api.kpmgpoc-samsungfire.com/v1',
    model: process.env.ONPREMISE_LLM_MODEL || 'LFM2-2.6B-Exp-Q8_0.gguf',
    getApiKey: () => null,
  },
};

// OpenAI 클라이언트 생성 (OpenAI 전용)
function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// 온프레미스 LLM 호출 함수 (직접 fetch 사용)
async function callOnpremiseLLM(messages, options = {}) {
  const config = LLM_PROVIDERS.onpremise;
  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 1000,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`온프레미스 LLM 호출 실패: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// System Prompt (백엔드에 고정)
const SYSTEM_PROMPT = `당신은 친근하고 따뜻한 일기 작성 도우미입니다. 
사용자가 말한 내용을 바탕으로 구조화된 일기 요약을 생성해주세요.

규칙:
1. 한국어로 작성하세요
2. 1인칭 시점을 유지하세요 (나는, 내가 등)
3. 감정과 느낌을 풍부하게 표현하세요
4. 각 카테고리에 해당하는 내용이 없으면 빈 배열로 반환하세요
5. 각 항목은 간결하게 2-4단어로 표현하세요
6. oneLiner는 오늘 하루를 대표하는 한 문장으로 작성하세요
7. fullDiary는 전체 내용을 자연스럽게 3-5문장으로 정리하세요`;

// JSON Schema 정의
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    oneLiner: {
      type: 'string',
      description: '오늘 하루를 한 문장으로 요약한 내용',
    },
    dailyHighlights: {
      type: 'array',
      items: { type: 'string' },
      description: '오늘의 주요 일상 활동 (예: 출근길 음악, 점심 식사, 산책 등) 최대 3개',
      maxItems: 3,
    },
    goalTracking: {
      type: 'array',
      items: { type: 'string' },
      description: '목표와 관련된 활동이나 진전 (예: 업무 효율 UP, 운동 완료 등) 최대 3개',
      maxItems: 3,
    },
    gratitude: {
      type: 'array',
      items: { type: 'string' },
      description: '감사한 일들 (예: 친구의 도움, 맛있는 식사 등) 최대 3개',
      maxItems: 3,
    },
    emotions: {
      type: 'array',
      items: { type: 'string' },
      description: '오늘 느낀 주요 감정들 (예: 뿌듯함, 여유로움 등) 최대 3개',
      maxItems: 3,
    },
    fullDiary: {
      type: 'string',
      description: '전체 일기 내용을 자연스럽게 정리한 텍스트 (3-5문장)',
    },
  },
  required: [
    'oneLiner',
    'dailyHighlights',
    'goalTracking',
    'gratitude',
    'emotions',
    'fullDiary',
  ],
  additionalProperties: false,
};

export default async function handler(req, res) {
  // CORS 설정 (React Native 앱에서 호출 가능하도록)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight request 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    // Request body 검증
    const { text, llmProvider = 'openai' } = req.body;

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'text 필드가 필요합니다 (음성 전사된 텍스트)',
        example: {
          text: '오늘은 아침 일찍 일어나서 운동을 했어요...',
          llmProvider: 'openai | onpremise (선택, 기본값: openai)'
        }
      });
    }

    // LLM 프로바이더 유효성 검사
    if (!LLM_PROVIDERS[llmProvider]) {
      return res.status(400).json({
        success: false,
        error: `지원하지 않는 llmProvider: ${llmProvider}`,
        availableProviders: Object.keys(LLM_PROVIDERS),
      });
    }

    // OpenAI 선택 시 API 키 확인
    if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다');
      return res.status(500).json({
        success: false,
        error: '서버 설정 오류',
      });
    }

    const model = LLM_PROVIDERS[llmProvider].model;
    console.log(`Organizing diary [${llmProvider}/${model}] for text length:`, text.length);

    let completion;

    if (llmProvider === 'openai') {
      // OpenAI SDK 사용
      const openai = createOpenAIClient();
      completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `다음 내용을 일기로 정리해주세요:\n\n"${text}"` },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'diary_summary',
            strict: true,
            schema: JSON_SCHEMA,
          },
        },
      });
    } else {
      // 온프레미스: 직접 fetch 호출
      const systemPrompt = SYSTEM_PROMPT + `\n\n반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이 JSON만):\n${JSON.stringify(JSON_SCHEMA.properties, null, 2)}`;
      completion = await callOnpremiseLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `다음 내용을 일기로 정리해주세요:\n\n"${text}"` },
      ], { temperature: 0.7, max_tokens: 1000 });
    }

    // 응답 파싱
    let content = completion.choices[0].message.content;
    console.log('Generated diary summary:', content);

    // 온프레미스 LLM이 ```json 코드블록으로 감싸는 경우 처리
    if (content.includes('```json')) {
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    } else if (content.includes('```')) {
      content = content.replace(/```\s*/g, '').trim();
    }

    // JSON 파싱
    const summary = JSON.parse(content);

    // 성공 응답
    return res.status(200).json({
      success: true,
      summary: summary,
      originalTextLength: text.length,
      tokensUsed: completion.usage?.total_tokens || 0,
      llmProvider,
      model,
    });

  } catch (error) {
    console.error('Organize diary error:', error);

    // OpenAI API 에러 처리
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({
        success: false,
        error: 'OpenAI API 할당량 초과',
      });
    }

    if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        success: false,
        error: 'OpenAI API 키가 유효하지 않습니다',
      });
    }

    // 일반 에러
    return res.status(500).json({
      success: false,
      error: '일기 정리 중 오류가 발생했습니다',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

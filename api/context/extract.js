import OpenAI from 'openai';

// LLM 프로바이더 설정
const LLM_PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  onpremise: {
    baseURL: process.env.ONPREMISE_LLM_URL || 'https://api.kpmgpoc-samsungfire.com/v1',
    model: process.env.ONPREMISE_LLM_MODEL || 'LFM2-2.6B-Exp-Q8_0.gguf',
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
      max_tokens: options.max_tokens || 500,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`온프레미스 LLM 호출 실패: ${response.status} - ${errorText}`);
  }

  return response.json();
}

const DEFAULT_PROMPT = `다음 대화 내용을 분석하여 주요 컨텍스트를 추출해주세요:
1. 대화의 주요 주제
2. 사용자의 의도나 목적
3. 중요한 정보나 키워드
4. 감정 상태나 톤
5. 대화의 흐름 요약

결과는 간결하게 불릿 포인트 형식으로 정리해주세요.`;

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const { conversationText, customPrompt, llmProvider = 'openai' } = req.body;

    // 입력 유효성 검사
    if (!conversationText || typeof conversationText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'conversationText 필드가 필요합니다.',
        example: {
          conversationText: '사용자: 안녕?\nAI: 안녕하세요!',
          llmProvider: 'openai | onpremise (선택, 기본값: openai)'
        }
      });
    }

    if (conversationText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '대화 내용이 비어있습니다.',
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
      return res.status(500).json({
        success: false,
        error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다',
      });
    }

    const model = LLM_PROVIDERS[llmProvider].model;

    // 프롬프트 구성
    const prompt = customPrompt || DEFAULT_PROMPT;
    const fullPrompt = `${prompt}\n\n대화 내용:\n${conversationText}`;

    console.log(`Extracting context [${llmProvider}/${model}] for conversation length:`, conversationText.length);

    let completion;

    if (llmProvider === 'openai') {
      // OpenAI SDK 사용
      const openai = createOpenAIClient();
      completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.7,
        max_tokens: 500,
      });
    } else {
      // 온프레미스: 직접 fetch 호출
      completion = await callOnpremiseLLM(
        [{ role: 'user', content: fullPrompt }],
        { temperature: 0.7, max_tokens: 500 }
      );
    }

    const extractedContext = completion.choices[0].message.content;

    return res.status(200).json({
      success: true,
      context: extractedContext,
      conversationLength: conversationText.length,
      tokensUsed: completion.usage?.total_tokens || 0,
      llmProvider,
      model,
    });

  } catch (error) {
    console.error('Context Extraction API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: '컨텍스트 추출 중 오류가 발생했습니다.',
      details: error.message,
    });
  }
}

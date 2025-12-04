import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { conversationText, customPrompt } = req.body;

    // 입력 유효성 검사
    if (!conversationText || typeof conversationText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'conversationText 필드가 필요합니다.',
      });
    }

    if (conversationText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '대화 내용이 비어있습니다.',
      });
    }

    // 프롬프트 구성
    const prompt = customPrompt || DEFAULT_PROMPT;
    const fullPrompt = `${prompt}\n\n대화 내용:\n${conversationText}`;

    // OpenAI API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const extractedContext = completion.choices[0].message.content;

    return res.status(200).json({
      success: true,
      context: extractedContext,
      conversationLength: conversationText.length,
      tokensUsed: completion.usage?.total_tokens || 0,
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

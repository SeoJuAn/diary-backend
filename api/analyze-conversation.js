export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { conversation, model = 'claude' } = req.body;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({ 
        error: 'conversation 배열이 필요합니다',
        example: {
          conversation: [
            { role: 'user', content: '오늘 아침에 커피를 마시면서...' },
            { role: 'assistant', content: '좋은 아침이네요...' }
          ],
          model: 'claude' // or 'oss'
        }
      });
    }

    // 대화 내용을 하나의 텍스트로 합치기
    const conversationText = conversation
      .map(msg => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
      .join('\n\n');

    const prompt = `다음은 사용자와 AI의 대화 내용입니다. 이 대화를 분석하여 일기 작성에 도움이 되는 인사이트를 추출해주세요.

대화 내용:
${conversationText}

다음 JSON 구조로 정확히 응답해주세요:
{
  "todayOneLine": "오늘을 한 줄로 요약",
  "mainActivities": ["주요 일상 활동1", "주요 일상 활동2", "주요 일상 활동3"],
  "goalTracking": {
    "mentioned": true/false,
    "goals": ["언급된 목표1", "언급된 목표2"],
    "progress": "목표 진행 상황 요약"
  },
  "gratefulFor": ["감사한 일1", "감사한 일2", "감사한 일3"],
  "mainMood": {
    "emotion": "happy/sad/excited/tired/normal/anxious/peaceful",
    "intensity": "low/medium/high",
    "reason": "감정의 이유"
  },
  "insights": "전체적인 하루 인사이트 및 의미 있는 패턴"
}

JSON만 응답하고 다른 설명은 추가하지 마세요.`;

    let aiResponse;

    if (model === 'claude') {
      aiResponse = await callClaudeAPI(prompt);
    } else if (model === 'oss') {
      aiResponse = await callGPTOSSAPI(prompt);
    } else {
      return res.status(400).json({ 
        error: 'Invalid model. Use "claude" or "oss"' 
      });
    }

    // JSON 파싱 시도
    try {
      const analysis = JSON.parse(aiResponse);
      return res.status(200).json({
        success: true,
        model: model,
        analysis: analysis,
        conversationLength: conversation.length
      });
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return res.status(500).json({
        error: 'AI 응답을 JSON으로 파싱할 수 없습니다',
        rawResponse: aiResponse
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: '분석 중 오류가 발생했습니다',
      details: error.message 
    });
  }
}

async function callClaudeAPI(prompt) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY 환경변수가 설정되지 않았습니다');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        },
        {
          role: 'assistant', 
          content: '{'
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Claude API 오류: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return '{' + data.content[0].text;
}

async function callGPTOSSAPI(prompt) {
  const serverUrl = process.env.GPT_OSS_SERVER_URL || 'http://20.235.240.180:8080';

  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer dummy-key'
    },
    body: JSON.stringify({
      model: 'gpt-oss-120b',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`GPT-OSS API 오류: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
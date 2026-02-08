import OpenAI from 'openai';

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { userId, sessionConfig, advancedConfig } = req.body;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ① 입력 검증
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (!sessionConfig) {
      return res.status(400).json({
        success: false,
        error: 'sessionConfig is required',
        example: {
          userId: 'user_12345',
          sessionConfig: {
            model: 'gpt-4o-realtime-preview-2024-12-17',
            voice: 'alloy',
            instructions: '당신은 친근한 일기 작성 도우미입니다.',
          },
          advancedConfig: {
            temperature: 0.8,
            speed: 1.0,
            threshold: 0.5,
            // ... 기타 고급 설정
          },
        },
      });
    }

    if (!sessionConfig.model) {
      return res.status(400).json({
        success: false,
        error: 'sessionConfig.model is required',
        availableModels: [
          'gpt-4o-realtime-preview-2024-12-17',
          'gpt-4o-mini-realtime-preview',
        ],
      });
    }

    // 고급 설정 기본값
    const defaultAdvancedConfig = {
      temperature: 0.8,
      speed: 1.0,
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 200,
      idle_timeout_ms: null,
      max_output_tokens: 'inf',
      noise_reduction: null,
      truncation: 'auto',
    };

    // 클라이언트에서 보낸 고급 설정 병합
    const finalAdvancedConfig = { ...defaultAdvancedConfig, ...advancedConfig };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ② OpenAI API 키 확인
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다');
      return res.status(500).json({
        success: false,
        error: '서버 설정 오류',
      });
    }

    console.log('🔐 Creating ephemeral token for user:', userId || 'anonymous');
    console.log('Session config:', {
      model: sessionConfig.model,
      voice: sessionConfig.voice,
      hasInstructions: !!sessionConfig.instructions,
      advancedConfig: finalAdvancedConfig,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ③ OpenAI Ephemeral Token 발급
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // OpenAI API 호출 (공식 엔드포인트)
    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_after: {
            anchor: 'created_at',
            seconds: 1800, // 30분 (1800초)
          },
          session: {
            type: 'realtime',
            model: sessionConfig.model,
            instructions: sessionConfig.instructions || '당신은 친근한 AI 도우미입니다.',
            audio: {
              input: {
                format: {
                  type: 'audio/pcm',
                  rate: 24000,
                },
                transcription: {
                  model: 'whisper-1'
                },
                turn_detection: {
                  type: 'server_vad',
                  threshold: finalAdvancedConfig.threshold,
                  prefix_padding_ms: finalAdvancedConfig.prefix_padding_ms,
                  silence_duration_ms: finalAdvancedConfig.silence_duration_ms,
                  create_response: true,
                },
              },
              output: {
                format: {
                  type: 'audio/pcm',
                  rate: 24000,
                },
                voice: sessionConfig.voice || 'alloy',
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      
      // OpenAI 에러 응답 파싱 시도
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }

      return res.status(response.status).json({
        success: false,
        error: 'OpenAI API 오류',
        details: errorData.error?.message || errorData.message || errorText,
      });
    }

    const data = await response.json();

    console.log('✅ Token created:', {
      sessionId: data.session?.id,
      expiresAt: new Date(data.expires_at * 1000).toISOString(),
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ④ 클라이언트에 응답
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    return res.status(200).json({
      success: true,
      token: data.value, // "ek_xxx" 형식
      sessionId: data.session?.id || 'unknown',
      expiresAt: data.expires_at, // Unix timestamp
      config: {
        model: data.session?.model || sessionConfig.model,
        voice: sessionConfig.voice || 'alloy',
        advancedConfig: finalAdvancedConfig,
      },
    });

  } catch (error) {
    console.error('❌ Failed to create ephemeral token:', error);

    // OpenAI API 에러 처리
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({
        success: false,
        error: 'OpenAI API 할당량 초과',
        details: '사용 가능한 크레딧이 없습니다.',
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
      error: '토큰 생성 중 오류가 발생했습니다',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

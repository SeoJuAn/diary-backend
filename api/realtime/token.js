import { query } from '../../lib/db.js';
import { verifyTokenFromRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    // ── JWT 검증 ──
    let decoded;
    try {
      decoded = verifyTokenFromRequest(req);
    } catch (e) {
      return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
    }
    const userId = decoded.userId;

    const { sessionConfig, advancedConfig } = req.body;

    if (!sessionConfig) {
      return res.status(400).json({
        success: false,
        error: 'sessionConfig is required',
      });
    }

    if (!sessionConfig.model) {
      return res.status(400).json({
        success: false,
        error: 'sessionConfig.model is required',
        availableModels: ['gpt-4o-realtime-preview-2024-12-17', 'gpt-4o-mini-realtime-preview'],
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, error: '서버 설정 오류' });
    }

    // ── DB에서 현재 프롬프트 조회 (sessionConfig.instructions 미제공 시) ──
    let systemInstructions = sessionConfig.instructions;
    if (!systemInstructions) {
      try {
        const promptResult = await query(
          `SELECT prompt FROM prompt_versions WHERE endpoint = 'realtime' AND is_current = true LIMIT 1`
        );
        if (promptResult.rowCount > 0) {
          systemInstructions = promptResult.rows[0].prompt;
        }
      } catch (e) {
        console.warn('프롬프트 조회 실패, 기본값 사용:', e.message);
      }
      systemInstructions = systemInstructions || '당신은 친근한 일기 작성 도우미입니다. 사용자의 하루 이야기를 경청하고 공감하며 대화를 이어가세요.';
    }

    // ── DB에서 현재 고급 설정 조회 ──
    let dbAdvancedConfig = {};
    if (!advancedConfig) {
      try {
        const presetResult = await query(
          `SELECT temperature, speed, threshold, prefix_padding_ms, silence_duration_ms,
                  idle_timeout_ms, max_output_tokens, noise_reduction, truncation
           FROM advanced_presets WHERE endpoint = 'realtime' AND is_current = true LIMIT 1`
        );
        if (presetResult.rowCount > 0) {
          dbAdvancedConfig = presetResult.rows[0];
        }
      } catch (e) {
        console.warn('고급 설정 조회 실패, 기본값 사용:', e.message);
      }
    }

    const defaultAdvancedConfig = {
      temperature: 0.8, speed: 1.0, threshold: 0.5,
      prefix_padding_ms: 300, silence_duration_ms: 200,
      idle_timeout_ms: null, max_output_tokens: 'inf',
      noise_reduction: null, truncation: 'auto',
    };
    const finalAdvancedConfig = { ...defaultAdvancedConfig, ...dbAdvancedConfig, ...(advancedConfig || {}) };

    // ── Tool 정의: get_conversation_history ──
    const tools = [
      {
        type: 'function',
        name: 'get_conversation_history',
        description: '사용자의 이전 일기/대화 기록을 조회합니다. 사용자가 과거 특정 날짜나 주제에 대해 물어볼 때 사용하세요.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: '조회할 날짜 (YYYY-MM-DD 형식). 특정 날짜를 지정할 때 사용.',
            },
            keyword: {
              type: 'string',
              description: '검색할 키워드 또는 주제. 특정 주제/사건에 대한 기록을 찾을 때 사용.',
            },
            limit: {
              type: 'number',
              description: '가져올 최대 개수 (기본값: 5)',
            },
          },
          required: [],
        },
      },
    ];

    console.log('🔐 Creating ephemeral token for user:', userId);

    // ── OpenAI Ephemeral Token 발급 ──
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 1800 },
        session: {
          type: 'realtime',
          model: sessionConfig.model,
          instructions: systemInstructions,
          tools,
          tool_choice: 'auto',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: { model: 'whisper-1' },
              turn_detection: {
                type: 'server_vad',
                threshold: finalAdvancedConfig.threshold,
                prefix_padding_ms: finalAdvancedConfig.prefix_padding_ms,
                silence_duration_ms: finalAdvancedConfig.silence_duration_ms,
                create_response: true,
              },
            },
            output: {
              format: { type: 'audio/pcm', rate: 24000 },
              voice: sessionConfig.voice || 'alloy',
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      let errorData;
      try { errorData = JSON.parse(errorText); } catch (e) { errorData = { message: errorText }; }
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
      userId,
    });

    return res.status(200).json({
      success: true,
      token: data.value,
      sessionId: data.session?.id || 'unknown',
      expiresAt: data.expires_at,
      config: {
        model: data.session?.model || sessionConfig.model,
        voice: sessionConfig.voice || 'alloy',
        advancedConfig: finalAdvancedConfig,
      },
    });

  } catch (error) {
    console.error('❌ Failed to create ephemeral token:', error);

    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ success: false, error: 'OpenAI API 할당량 초과' });
    }
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({ success: false, error: 'OpenAI API 키가 유효하지 않습니다' });
    }

    return res.status(500).json({
      success: false,
      error: '토큰 생성 중 오류가 발생했습니다',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

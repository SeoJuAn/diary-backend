import OpenAI from 'openai';

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
    const { text, voice = 'alloy', instructions, response_format = 'mp3' } = req.body;

    // 입력 유효성 검사
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'text 필드가 필요합니다.',
      });
    }

    if (text.length === 0) {
      return res.status(400).json({
        success: false,
        error: '텍스트가 비어있습니다.',
      });
    }

    // OpenAI TTS API 호출
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: voice, // alloy, echo, fable, onyx, nova, shimmer
      instructions: instructions || '친근하고 밝은 톤으로 말해주세요',
      response_format: response_format, // mp3, opus, aac, flac, wav, pcm
    });

    // ArrayBuffer를 Buffer로 변환
    const buffer = Buffer.from(await response.arrayBuffer());

    // Content-Type 설정
    const contentTypes = {
      mp3: 'audio/mpeg',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
    };

    res.setHeader('Content-Type', contentTypes[response_format] || 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    
    // 오디오 데이터 반환
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('TTS API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'TTS 처리 중 오류가 발생했습니다.',
      details: error.message,
    });
  }
}

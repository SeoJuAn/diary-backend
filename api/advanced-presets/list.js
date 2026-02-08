import { query } from '../../lib/db.js';

/**
 * GET /api/advanced-presets/list?endpoint=realtime
 * 고급 설정 프리셋 목록 조회
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.',
    });
  }

  try {
    const { endpoint } = req.query;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'endpoint query parameter is required',
      });
    }

    const result = await query(
      `SELECT 
        id,
        endpoint,
        preset_name as "presetName",
        temperature,
        speed,
        threshold,
        prefix_padding_ms as "prefixPaddingMs",
        silence_duration_ms as "silenceDurationMs",
        idle_timeout_ms as "idleTimeoutMs",
        max_output_tokens as "maxOutputTokens",
        noise_reduction as "noiseReduction",
        truncation,
        is_system as "isSystem",
        is_current as "isCurrent",
        created_at as "createdAt"
      FROM advanced_presets
      WHERE endpoint = $1
      ORDER BY is_system DESC, created_at ASC`,
      [endpoint]
    );

    return res.status(200).json({
      success: true,
      presets: result.rows,
    });

  } catch (error) {
    console.error('❌ Error fetching advanced presets:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch advanced presets',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

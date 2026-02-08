import { transaction } from '../../lib/db.js';

/**
 * PUT /api/advanced-presets/switch
 * 현재 활성 프리셋 전환
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use PUT.',
    });
  }

  try {
    const { endpoint, presetId } = req.body;

    if (!endpoint || !presetId) {
      return res.status(400).json({
        success: false,
        error: 'endpoint and presetId are required',
      });
    }

    const result = await transaction(async (client) => {
      // 1. 대상 프리셋 확인
      const checkResult = await client.query(
        `SELECT id, preset_name FROM advanced_presets WHERE id = $1 AND endpoint = $2`,
        [presetId, endpoint]
      );

      if (checkResult.rows.length === 0) {
        throw new Error('Preset not found');
      }

      // 2. 기존 current 플래그 제거
      await client.query(
        `UPDATE advanced_presets SET is_current = FALSE WHERE endpoint = $1 AND is_current = TRUE`,
        [endpoint]
      );

      // 3. 새 프리셋을 current로 설정
      const updateResult = await client.query(
        `UPDATE advanced_presets SET is_current = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING 
          id, preset_name as "presetName", temperature, speed, threshold,
          prefix_padding_ms as "prefixPaddingMs", silence_duration_ms as "silenceDurationMs",
          idle_timeout_ms as "idleTimeoutMs", max_output_tokens as "maxOutputTokens",
          noise_reduction as "noiseReduction", truncation, is_current as "isCurrent"`,
        [presetId]
      );

      return updateResult.rows[0];
    });

    console.log(`✅ Switched to preset: ${result.presetName}`);

    return res.status(200).json({
      success: true,
      message: `Switched to preset: ${result.presetName}`,
      preset: result,
    });

  } catch (error) {
    console.error('❌ Error switching advanced preset:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to switch advanced preset',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

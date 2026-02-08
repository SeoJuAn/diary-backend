import { query } from '../../lib/db.js';

/**
 * POST /api/advanced-presets/create
 * 커스텀 고급 설정 프리셋 생성
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const { endpoint, presetName, config } = req.body;

    if (!endpoint || !presetName || !config) {
      return res.status(400).json({
        success: false,
        error: 'endpoint, presetName, and config are required',
      });
    }

    const result = await query(
      `INSERT INTO advanced_presets (
        endpoint, preset_name,
        temperature, speed, threshold,
        prefix_padding_ms, silence_duration_ms, idle_timeout_ms,
        max_output_tokens, noise_reduction, truncation,
        is_system, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, false)
      RETURNING 
        id,
        preset_name as "presetName",
        temperature, speed, threshold,
        created_at as "createdAt"`,
      [
        endpoint,
        presetName,
        config.temperature,
        config.speed,
        config.threshold,
        config.prefix_padding_ms,
        config.silence_duration_ms,
        config.idle_timeout_ms,
        config.max_output_tokens,
        config.noise_reduction,
        config.truncation
      ]
    );

    console.log(`✅ Created advanced preset: ${presetName}`);

    return res.status(201).json({
      success: true,
      message: 'Advanced preset created successfully',
      preset: result.rows[0],
    });

  } catch (error) {
    console.error('❌ Error creating advanced preset:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Preset name already exists',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to create advanced preset',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

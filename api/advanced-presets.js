import { query, transaction } from '../lib/db.js';

/**
 * Unified Advanced Presets API
 * 
 * GET    /api/advanced-presets?endpoint=realtime       - List all presets
 * POST   /api/advanced-presets                         - Create preset
 * PUT    /api/advanced-presets                         - Switch preset
 * DELETE /api/advanced-presets                         - Delete preset
 */
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Route based on HTTP method
    switch (req.method) {
      case 'GET':
        return await handleList(req, res);
      case 'POST':
        return await handleCreate(req, res);
      case 'PUT':
        return await handleSwitch(req, res);
      case 'DELETE':
        return await handleDelete(req, res);
      default:
        return res.status(405).json({
          success: false,
          error: `Method ${req.method} not allowed`,
        });
    }
  } catch (error) {
    console.error('❌ Error in advanced-presets API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * GET - List all presets for an endpoint
 */
async function handleList(req, res) {
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
}

/**
 * POST - Create a new preset
 */
async function handleCreate(req, res) {
  const { endpoint, presetName, config } = req.body;

  if (!endpoint || !presetName || !config) {
    return res.status(400).json({
      success: false,
      error: 'endpoint, presetName, and config are required',
    });
  }

  try {
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
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Preset name already exists',
      });
    }
    throw error;
  }
}

/**
 * PUT - Switch active preset
 */
async function handleSwitch(req, res) {
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
}

/**
 * DELETE - Delete a preset
 */
async function handleDelete(req, res) {
  const { endpoint, presetId } = req.body;

  if (!endpoint || !presetId) {
    return res.status(400).json({
      success: false,
      error: 'endpoint and presetId are required',
    });
  }

  // 1. 프리셋 존재 여부 및 삭제 가능 여부 확인
  const presetCheck = await query(
    `SELECT id, preset_name, is_system, is_current 
     FROM advanced_presets 
     WHERE id = $1 AND endpoint = $2`,
    [presetId, endpoint]
  );

  if (presetCheck.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Preset not found',
    });
  }

  const preset = presetCheck.rows[0];

  // 2. 시스템 프리셋은 삭제 불가
  if (preset.is_system) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete system preset',
    });
  }

  // 3. 현재 활성 프리셋인 경우 삭제 불가
  if (preset.is_current) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete currently active preset. Please switch to another preset first.',
    });
  }

  // 4. 프리셋 삭제
  await query(
    `DELETE FROM advanced_presets WHERE id = $1 AND endpoint = $2`,
    [presetId, endpoint]
  );

  console.log(`✅ Deleted preset: ${preset.preset_name} (${presetId})`);

  return res.status(200).json({
    success: true,
    message: `Preset "${preset.preset_name}" deleted successfully`,
    deletedPreset: {
      id: preset.id,
      name: preset.preset_name,
    },
  });
}

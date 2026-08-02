import { query, transaction } from '../lib/db.js';
import { verifyTokenFromRequest } from '../lib/auth.js';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let userId;
  try {
    userId = verifyTokenFromRequest(req).userId;
  } catch (e) {
    return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
  }

  try {
    // Route based on HTTP method
    switch (req.method) {
      case 'GET':
        return await handleList(req, res, userId);
      case 'POST':
        return await handleCreate(req, res, userId);
      case 'PUT':
        return await handleSwitch(req, res, userId);
      case 'DELETE':
        return await handleDelete(req, res, userId);
      default:
        return res.status(405).json({
          success: false,
          error: `Method ${req.method} not allowed`,
        });
    }
  } catch (error) {
    console.error('❌ Error in advanced-presets API:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * GET - List all presets for an endpoint (own + system presets only)
 */
async function handleList(req, res, userId) {
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
      user_id as "userId",
      created_at as "createdAt"
    FROM advanced_presets
    WHERE endpoint = $1 AND (user_id = $2 OR user_id IS NULL)
    ORDER BY is_system DESC, created_at ASC`,
    [endpoint, userId]
  );

  return res.status(200).json({
    success: true,
    presets: result.rows,
  });
}

/**
 * POST - Create a new preset (always owned by the requesting user)
 */
async function handleCreate(req, res, userId) {
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
        is_system, is_current, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, false, $12)
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
        config.truncation,
        userId,
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
 * PUT - Switch active preset (own preset or system default only)
 */
async function handleSwitch(req, res, userId) {
  const { endpoint, presetId } = req.body;

  if (!endpoint || !presetId) {
    return res.status(400).json({
      success: false,
      error: 'endpoint and presetId are required',
    });
  }

  const result = await transaction(async (client) => {
    // 1. 대상 프리셋 확인 + 소유권 검증 (본인 프리셋이거나 시스템 기본값만 허용)
    const checkResult = await client.query(
      `SELECT id, preset_name, user_id FROM advanced_presets WHERE id = $1 AND endpoint = $2`,
      [presetId, endpoint]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Preset not found');
    }
    const target = checkResult.rows[0];
    if (target.user_id !== null && String(target.user_id) !== String(userId)) {
      const err = new Error('본인의 프리셋만 활성화할 수 있습니다.');
      err.statusCode = 403;
      throw err;
    }

    // 2. 기존 current 플래그 제거 (본인 프리셋 또는 시스템 기본값 범위만)
    await client.query(
      `UPDATE advanced_presets SET is_current = FALSE
       WHERE endpoint = $1 AND (user_id = $2 OR (user_id IS NULL AND is_current = TRUE))`,
      [endpoint, userId]
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
 * DELETE - Delete a preset (own, non-system presets only)
 */
async function handleDelete(req, res, userId) {
  const { endpoint, presetId } = req.body;

  if (!endpoint || !presetId) {
    return res.status(400).json({
      success: false,
      error: 'endpoint and presetId are required',
    });
  }

  // 1. 프리셋 존재 여부 및 삭제 가능 여부 확인
  const presetCheck = await query(
    `SELECT id, preset_name, is_system, is_current, user_id
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

  // 2b. 본인 프리셋만 삭제 가능
  if (String(preset.user_id) !== String(userId)) {
    return res.status(403).json({
      success: false,
      error: 'You can only delete your own presets',
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

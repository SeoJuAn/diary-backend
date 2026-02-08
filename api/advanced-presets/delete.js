import { query } from '../../lib/db.js';

/**
 * DELETE /api/advanced-presets/delete
 * 커스텀 고급 설정 프리셋 삭제
 * 
 * Body:
 * {
 *   "endpoint": "realtime",
 *   "presetId": "uuid"
 * }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use DELETE.',
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

  } catch (error) {
    console.error('❌ Error deleting preset:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete preset',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

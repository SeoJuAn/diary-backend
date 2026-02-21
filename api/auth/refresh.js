import { query } from '../../lib/db.js';
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'refreshToken is required' });
    }

    // refresh token 검증
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, error: 'Refresh token이 유효하지 않거나 만료되었습니다.' });
    }

    // 사용자 존재 확인
    const result = await query(
      'SELECT id, email, nickname FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
    }

    const user = result.rows[0];
    const payload = { userId: user.id, email: user.email, nickname: user.nickname };

    // 새 토큰 발급
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, email: user.email, nickname: user.nickname },
    });

  } catch (error) {
    console.error('❌ Refresh error:', error);
    return res.status(500).json({ success: false, error: '토큰 갱신 중 오류가 발생했습니다.' });
  }
}

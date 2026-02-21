import { query } from '../../lib/db.js';
import { comparePassword, signAccessToken, signRefreshToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const { email, password } = req.body;

    // ── 입력 검증 ──
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email과 password는 필수입니다.' });
    }

    // ── 사용자 조회 ──
    const result = await query(
      'SELECT id, email, password_hash, nickname FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = result.rows[0];

    // ── 비밀번호 검증 ──
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // ── JWT 발급 ──
    const payload = { userId: user.id, email: user.email, nickname: user.nickname };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    console.log('✅ User logged in:', user.email);

    return res.status(200).json({
      success: true,
      message: '로그인 성공',
      user: { id: user.id, email: user.email, nickname: user.nickname },
      accessToken,
      refreshToken,
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({
      success: false,
      error: '로그인 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

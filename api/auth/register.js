import { query } from '../../lib/db.js';
import { hashPassword, signAccessToken, signRefreshToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const { email, password, nickname } = req.body;

    // ── 입력 검증 ──
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'email과 password는 필수입니다.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: '이메일 형식이 올바르지 않습니다.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: '비밀번호는 6자 이상이어야 합니다.' });
    }

    // ── 중복 이메일 확인 ──
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ success: false, error: '이미 사용 중인 이메일입니다.' });
    }

    // ── 비밀번호 해시 후 저장 ──
    const passwordHash = await hashPassword(password);
    const result = await query(
      'INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname, created_at',
      [email.toLowerCase().trim(), passwordHash, nickname || null]
    );

    const user = result.rows[0];

    // ── JWT 발급 ──
    const payload = { userId: user.id, email: user.email, nickname: user.nickname };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    console.log('✅ User registered:', user.email);

    return res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      user: { id: user.id, email: user.email, nickname: user.nickname },
      accessToken,
      refreshToken,
    });

  } catch (error) {
    console.error('❌ Register error:', error);
    return res.status(500).json({
      success: false,
      error: '회원가입 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

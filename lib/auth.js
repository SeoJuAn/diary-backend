import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'diary_access_secret_key_2026';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'diary_refresh_secret_key_2026';
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '1h';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Access Token 발급 (1시간)
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

/**
 * Refresh Token 발급 (7일)
 */
export function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/**
 * Access Token 검증
 * @returns {{ userId, email, nickname }} 검증된 페이로드
 * @throws Error 토큰이 없거나 유효하지 않을 때
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Refresh Token 검증
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/**
 * req 헤더에서 Bearer 토큰 추출 후 검증
 * Authorization: Bearer <token>
 * @returns {{ userId, email, nickname }}
 * @throws Error
 */
export function verifyTokenFromRequest(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization 헤더가 없거나 형식이 잘못되었습니다');
  }
  const token = authHeader.slice(7);
  return verifyAccessToken(token);
}

/**
 * 비밀번호 해시 생성 (bcrypt, salt 12)
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * 비밀번호 검증
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

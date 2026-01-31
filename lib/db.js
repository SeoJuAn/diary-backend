import pg from 'pg';

const { Pool } = pg;

// PostgreSQL 연결 풀 생성
const pool = new Pool({
  host: process.env.DB_HOST || '0.tcp.ap.ngrok.io',
  port: process.env.DB_PORT || 16287,
  database: process.env.DB_NAME || 'tjkimdb',
  user: process.env.DB_USER || 'tjkim',
  password: process.env.DB_PASSWORD || '1111',
  max: 20, // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 연결 테스트
pool.on('connect', () => {
  console.log('✅ Database pool connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

/**
 * 쿼리 실행 헬퍼 함수
 * @param {string} text - SQL 쿼리
 * @param {Array} params - 쿼리 파라미터
 * @returns {Promise<object>} - 쿼리 결과
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('⚡ Query executed', { duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('❌ Query error:', error);
    throw error;
  }
}

/**
 * 트랜잭션 헬퍼 함수
 * @param {Function} callback - 트랜잭션 내에서 실행할 함수
 * @returns {Promise<any>} - 트랜잭션 결과
 */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 연결 풀 종료
 */
export async function end() {
  await pool.end();
  console.log('👋 Database pool closed');
}

export default { query, transaction, end };

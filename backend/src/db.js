const { Pool, types } = require('pg');
require('dotenv').config();

// timestamp(시간대 없음) 컬럼을 JS Date 객체로 자동 변환하지 않고 DB에 저장된 문자열 그대로 반환.
// (Date 객체로 변환 시 Node 프로세스의 시스템 시간대가 한 번 더 적용되어
//  실제 저장된 한국시간과 어긋나는 문제가 있었음)
types.setTypeParser(1114, (str) => str); // timestamp without time zone
types.setTypeParser(1082, (str) => str); // date

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'qa_management',
});

module.exports = pool;

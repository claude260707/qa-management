const { Pool, types } = require('pg');
require('dotenv').config();
// timestamp(시간대 없음) 컬럼을 JS Date 객체로 자동 변환하지 않고 DB에 저장된 문자열 그대로 반환.
// (Date 객체로 변환 시 Node 프로세스의 시스템 시간대가 반영되어
//  실제 저장된 한국시간과 어긋나는 문제가 있었음)
types.setTypeParser(1114, (str) => str); // timestamp without time zone
types.setTypeParser(1082, (str) => str); // date

// 배포 환경(Neon, Render 등)에서는 DATABASE_URL 하나로 접속 정보를 제공하는 경우가 많음.
// 로컬 개발 환경과의 호환을 위해 기존 개별 env 변수 방식도 그대로 지원.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'qa_management',
    });

module.exports = pool;

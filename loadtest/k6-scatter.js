import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:3000';
const N = Number(__ENV.N || 1000000);       // seeded rows
const MODE = __ENV.MODE || 'country';        // country | range
const SPAN = Number(__ENV.SPAN || 1000);     // ids per range query
const LIMIT = Number(__ENV.LIMIT || 50);
const PEAK = Number(__ENV.PEAK_VUS || 50);

const COUNTRIES = ['PK', 'US', 'IN', 'GB', 'DE', 'AE', 'CA', 'FR', 'BR', 'JP'];
const NAME = MODE === 'range' ? 'GET /users/range' : 'GET /users?country';

export const options = {
  stages: [
    { duration: '30s', target: PEAK },
    { duration: '60s', target: PEAK },
    { duration: '15s', target: PEAK * 3 },
    { duration: '30s', target: PEAK * 3 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    [`http_req_duration{name:${NAME}}`]: ['p(95)<1000'],
  },
};

export function setup() {
  const r = http.get(`${BASE}/health`);
  if (r.status !== 200) throw new Error(`API not reachable at ${BASE}`);
  console.log(`API: ${r.body} | mode=${MODE} | peak_vus=${PEAK}`);
}

export default function () {
  let url;
  if (MODE === 'range') {
    const from = 1 + Math.floor(Math.random() * (N - SPAN));
    url = `${BASE}/users/range?from=${from}&to=${from + SPAN - 1}&limit=${LIMIT}`;
  } else {
    const c = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
    url = `${BASE}/users?country=${c}&limit=${LIMIT}`;
  }
  const res = http.get(url, { tags: { name: NAME } });
  check(res, { 'status 200': (r) => r.status === 200 });
}
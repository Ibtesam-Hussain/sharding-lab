import http from 'k6/http';
import { check, sleep } from 'k6';

// All tunable from the command line with -e NAME=value
const BASE = __ENV.BASE || 'http://localhost:3000';
const N = Number(__ENV.N || 1000000);              // rows you seeded (ids 1..N)
const READ_RATIO = Number(__ENV.READ_RATIO || 0.9); // 90% reads / 10% writes
const SKEW = __ENV.SKEW || 'uniform';               // uniform | zipf
const PEAK = Number(__ENV.PEAK_VUS || 50);          // virtual users at steady load
const THINK = Number(__ENV.THINK || 0);             // seconds of pause between requests

export const options = {
  // ramp up, steady, spike, hold the spike, ramp down
  stages: [
    { duration: '30s', target: PEAK },
    { duration: '60s', target: PEAK },
    { duration: '15s', target: PEAK * 3 },
    { duration: '30s', target: PEAK * 3 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /users/:id}': ['p(95)<500'],
    'http_req_duration{name:POST /users}': ['p(95)<500'],
  },
};

// Pick which existing user to read.
// uniform: every id equally likely.
// zipf: a few ids get most of the traffic (id 1 ~5%, top 10 ids ~17%),
//       which creates a hot shard for whichever shard owns those ids.
function pickId() {
  if (SKEW === 'zipf') {
    return Math.min(N, Math.floor(Math.pow(N, Math.random())));
  }
  return 1 + Math.floor(Math.random() * N);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const r = http.get(`${BASE}/health`);
  if (r.status !== 200) throw new Error(`API not reachable at ${BASE}`);
  console.log(`API: ${r.body} | skew=${SKEW} | read_ratio=${READ_RATIO} | peak_vus=${PEAK}`);
}

export default function () {
  if (Math.random() < READ_RATIO) {
    const res = http.get(`${BASE}/users/${pickId()}`, {
      tags: { name: 'GET /users/:id' },
    });
    check(res, { 'read 200': (r) => r.status === 200 });
  } else {
    const body = JSON.stringify({
      name: `load_${__VU}_${__ITER}`,
      email: `load_${__VU}_${__ITER}@example.com`,
      country: 'PK',
    });
    const res = http.post(`${BASE}/users`, body, {
      headers: JSON_HEADERS,
      tags: { name: 'POST /users' },
    });
    check(res, { 'write 201': (r) => r.status === 201 });
  }
  if (THINK > 0) sleep(THINK);
}
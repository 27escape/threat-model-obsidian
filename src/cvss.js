// CVSS 3.0 / 3.1 base score from a vector such as "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".
// The formula is the one in the CVSS 3.1 specification (section 7.1), including its "round up" rule.

const TM_CVSS_WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR: { N: 0.85, L: 0.62, H: 0.27 }, // with S:C, L is 0.68 and H is 0.5
  UI: { N: 0.85, R: 0.62 },
  S: { U: 'U', C: 'C' },
  C: { H: 0.56, L: 0.22, N: 0 },
  I: { H: 0.56, L: 0.22, N: 0 },
  A: { H: 0.56, L: 0.22, N: 0 },
};

/** CVSS 3.1 "Roundup": the smallest number with one decimal place that is not less than x. */
function tmCvssRoundUp(x) {
  const i = Math.round(x * 100000);
  return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10;
}

/** { score } for a readable vector, otherwise { error }. */
function tmCvss(vector) {
  const v = String(vector || '').trim();
  const parts = v.split('/');
  const head = parts.shift() || '';
  if (!/^CVSS:3\.[01]$/.test(head)) {
    return { error: /^CVSS:4/.test(head) ? 'CVSS 4.0 vectors are not supported yet: use a 3.1 vector, or likelihood and impact' : `"${v}" isn't a CVSS 3.1 vector (it should start "CVSS:3.1/")` };
  }
  const m = {};
  for (const p of parts) {
    const [k, val] = p.split(':');
    if (!TM_CVSS_WEIGHTS[k]) continue; // temporal and environmental metrics are allowed and ignored
    if (!(val in TM_CVSS_WEIGHTS[k])) return { error: `CVSS vector: "${p}" isn't a valid value` };
    m[k] = val;
  }
  const missing = Object.keys(TM_CVSS_WEIGHTS).filter((k) => !(k in m));
  if (missing.length) return { error: `CVSS vector: missing ${missing.join(', ')}` };

  const changed = m.S === 'C';
  const pr = changed ? { N: 0.85, L: 0.68, H: 0.5 }[m.PR] : TM_CVSS_WEIGHTS.PR[m.PR];
  const iss = 1 - (1 - TM_CVSS_WEIGHTS.C[m.C]) * (1 - TM_CVSS_WEIGHTS.I[m.I]) * (1 - TM_CVSS_WEIGHTS.A[m.A]);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploitability = 8.22 * TM_CVSS_WEIGHTS.AV[m.AV] * TM_CVSS_WEIGHTS.AC[m.AC] * pr * TM_CVSS_WEIGHTS.UI[m.UI];
  if (impact <= 0) return { score: 0 };
  const score = changed ? tmCvssRoundUp(Math.min(1.08 * (impact + exploitability), 10)) : tmCvssRoundUp(Math.min(impact + exploitability, 10));
  return { score };
}

// what each base metric and value means, for readers who don't know CVSS
const TM_CVSS_NAMES = {
  AV: ['Attack vector', { N: 'network', A: 'adjacent network', L: 'local', P: 'physical' }],
  AC: ['Attack complexity', { L: 'low', H: 'high' }],
  PR: ['Privileges required', { N: 'none', L: 'low', H: 'high' }],
  UI: ['User interaction', { N: 'none', R: 'required' }],
  S: ['Scope', { U: 'unchanged', C: 'changed' }],
  C: ['Confidentiality', { H: 'high', L: 'low', N: 'none' }],
  I: ['Integrity', { H: 'high', L: 'low', N: 'none' }],
  A: ['Availability', { H: 'high', L: 'low', N: 'none' }],
};

// CVSS's own scale for the base score (CVSS 3.1 specification, section 5)
const TM_CVSS_BANDS = [
  [9, 'critical', '9.0 to 10.0'],
  [7, 'high', '7.0 to 8.9'],
  [4, 'medium', '4.0 to 6.9'],
  [0.1, 'low', '0.1 to 3.9'],
  [0, 'none', '0.0'],
];

/** What a CVSS base score means, in a sentence: its place on CVSS's scale, and what it does and doesn't measure. */
function tmCvssMeaning(score) {
  if (typeof score !== 'number') return '';
  const [, band, range] = TM_CVSS_BANDS.find(([from]) => score >= from);
  return `A CVSS base score of ${score} out of 10 is ${band} severity on CVSS's scale (${range}). It rates how severe the vulnerability is in itself, from how it can be attacked and what an attack would do; it isn't the risk in your setting.`;
}

/** A vector's base metrics in words: "Attack vector: network · Attack complexity: low · …", or "" if unreadable. */
function tmCvssExplain(vector) {
  if (tmCvss(vector).error) return '';
  const m = Object.fromEntries(String(vector).trim().split('/').slice(1).map((p) => p.split(':')));
  return Object.entries(TM_CVSS_NAMES)
    .map(([k, [name, values]]) => `${name}: ${values[m[k]]}`)
    .join(' · ');
}

/**
 * FIRST's CVSS calculator (FIRST publishes CVSS) with the vector filled in, or "" if it can't be read. The vector
 * goes after "#", which browsers don't send to the website; the plugin itself never opens it.
 */
function tmCvssLink(vector) {
  if (tmCvss(vector).error) return '';
  const v = String(vector).trim();
  return `https://www.first.org/cvss/calculator/${v.slice(5, 8)}#${v}`;
}

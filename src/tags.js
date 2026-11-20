// Hashtags: finding them in text, and the ones with a meaning (STRIDE, risk, status, sensitive data).

const TM_STRIDE_ORDER = ['S', 'T', 'R', 'I', 'D', 'E'];
const TM_STRIDE_NAMES = {
  S: 'Spoofing',
  T: 'Tampering',
  R: 'Repudiation',
  I: 'Information disclosure',
  D: 'Denial of service',
  E: 'Elevation of privilege',
};
// each STRIDE letter as a boxed letter, for diagrams: stride-colour.js colours the box once a diagram is drawn
const TM_STRIDE_MARKS = { S: '🆂', T: '🆃', R: '🆁', I: '🅸', D: '🅳', E: '🅴' };
// their colours where a diagram's colours are written in (pictures for the docs); in Obsidian, styles.css
const TM_STRIDE_COLOURS = { S: '#086ddd', T: '#ec7500', R: '#7852ee', I: '#e0ac00', D: '#e93147', E: '#9a6b3f' };
// long forms, matched without regard to case; the single letters must be capitals (#d could be anyone's tag)
const TM_STRIDE_WORDS = {
  spoofing: 'S',
  tampering: 'T',
  repudiation: 'R',
  disclosure: 'I',
  'information-disclosure': 'I',
  'denial-of-service': 'D',
  dos: 'D',
  elevation: 'E',
  'elevation-of-privilege': 'E',
};
const TM_RISKS = ['critical', 'high', 'medium', 'low']; // most serious first
const TM_STATUSES = ['open', 'mitigated', 'accepted', 'transferred'];
const TM_CONTROL_STATUSES = ['planned', 'implemented', 'verified']; // a control's progress, least done first
const TM_SENSITIVE = ['secret', 'pii', 'confidential'];

// line colour (diagrams) and note fill (sequence) for each risk
const TM_RISK_COLOURS = {
  critical: { line: '#982C35', fill: 'rgb(255,179,179)' },
  high: { line: '#CD3B48', fill: 'rgb(255,204,204)' },
  medium: { line: '#D97706', fill: 'rgb(255,230,204)' },
  low: { line: '#059669', fill: 'rgb(230,255,204)' },
};

/** Hashtags written inside text: "#pii", not "page#anchor" or "#1". Without the "#". */
function tmTagsIn(text) {
  const out = [];
  const re = /(^|[\s(\[,;])#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g;
  let m;
  while ((m = re.exec(String(text || '')))) if (/[A-Za-z_]/.test(m[2])) out.push(m[2]);
  return out;
}

/** True for a tag made only of STRIDE capitals: #S, or combined, such as #STR or #IE (any order). */
const tmIsStrideLetters = (tag) => /^[STRIDE]+$/.test(tag);

/** The STRIDE letters among some tags, in STRIDE order. */
function tmStrideOf(tags) {
  const got = new Set();
  for (const t of tags) {
    if (tmIsStrideLetters(t)) for (const l of t) got.add(l);
    else if (TM_STRIDE_WORDS[t.toLowerCase()]) got.add(TM_STRIDE_WORDS[t.toLowerCase()]);
  }
  return TM_STRIDE_ORDER.filter((l) => got.has(l));
}

const tmFirstOf = (tags, list) => {
  for (const t of tags) if (list.includes(t.toLowerCase())) return t.toLowerCase();
  return '';
};
const tmRiskOf = (tags) => tmFirstOf(tags, TM_RISKS);
const tmStatusOf = (tags) => tmFirstOf(tags, TM_STATUSES);
const tmIsSensitive = (tags) => tags.some((t) => TM_SENSITIVE.includes(t.toLowerCase()));

/** Risk from a 0–10 score: 9 critical, 7 high, 4 medium, otherwise low. */
function tmRiskFromScore(score) {
  if (typeof score !== 'number' || isNaN(score)) return '';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

/** Smaller is more serious; no risk sorts last. */
const tmRiskRank = (risk) => (TM_RISKS.includes(risk) ? TM_RISKS.indexOf(risk) : TM_RISKS.length);

/** The most serious risk among threats that are still open, or "" when none is: closed threats colour nothing. */
function tmWorstRisk(threats) {
  let best = '';
  for (const t of threats.filter((x) => x.status === 'open')) if (t.risk && (!best || tmRiskRank(t.risk) < tmRiskRank(best))) best = t.risk;
  return best;
}

const tmCap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

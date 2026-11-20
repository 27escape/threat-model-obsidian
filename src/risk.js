// Likelihood × impact: each from 1 to 5 (or a word: rare … almost-certain, negligible … severe), multiplied for a
// rating from 1 to 25 that gives the risk (20 and over critical, 10 high, 5 medium, otherwise low). The residual
// risk is what is left once the threat's controls are in place: residual_likelihood and residual_impact (each
// defaulting to the threat's own), or residual = "low" for the word alone.
// A threat is rated one way: likelihood × impact (the main way), a risk hashtag (a quick shorthand), or a CVSS
// vector (for a known vulnerability). If it has more than one, that order decides, and the model warns.
// threat.method says which: "rating", "tag", "cvss", or "score" (the old .flow format's score = …, still read).

const TM_LIKELIHOOD_WORDS = { rare: 1, unlikely: 2, possible: 3, likely: 4, 'almost-certain': 5, certain: 5 };
const TM_IMPACT_WORDS = { negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5, catastrophic: 5 };

/** Risk from likelihood × impact (1–25). */
function tmRiskFromRating(n) {
  if (!n) return '';
  if (n >= 20) return 'critical';
  if (n >= 10) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

/** A threat's likelihood, impact and residual risk from its attributes: problems become warnings. */
function tmThreatRating(attrs, warn) {
  const level = (key, words) => {
    const v = attrs[key];
    if (!v) return null;
    const text = tmValText(v).trim().toLowerCase().replace(/\s+/g, '-');
    const n = words[text] || Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
    warn(v.line, `${key} = "${tmValText(v)}" should be 1 to 5 or one of ${Object.keys(words).join(', ')}`);
    return null;
  };
  const likelihood = level('likelihood', TM_LIKELIHOOD_WORDS);
  const impact = level('impact', TM_IMPACT_WORDS);
  const pair = (l, i, lKey, iKey) => {
    if ((l === null) !== (i === null) && (attrs[lKey] || attrs[iKey])) {
      warn((attrs[lKey] || attrs[iKey]).line, `${attrs[lKey] ? iKey : lKey} is needed too: the risk is likelihood × impact`);
    }
    return l !== null && i !== null ? l * i : null;
  };
  const rating = pair(likelihood, impact, 'likelihood', 'impact');

  const rl = level('residual_likelihood', TM_LIKELIHOOD_WORDS);
  const ri = level('residual_impact', TM_IMPACT_WORDS);
  let residualLikelihood = null;
  let residualImpact = null;
  let residual = '';
  if (rl !== null || ri !== null) {
    residualLikelihood = rl ?? likelihood;
    residualImpact = ri ?? impact;
    if (residualLikelihood === null || residualImpact === null) {
      warn((attrs.residual_likelihood || attrs.residual_impact).line, 'a residual likelihood or impact needs the other, or the threat’s own likelihood and impact');
      residualLikelihood = residualImpact = null;
    } else residual = tmRiskFromRating(residualLikelihood * residualImpact);
  }
  if (attrs.residual) {
    const word = tmValText(attrs.residual).trim().toLowerCase();
    if (TM_RISKS.includes(word)) residual = word;
    else warn(attrs.residual.line, `residual = "${word}" should be one of ${TM_RISKS.join(', ')}`);
  }
  return {
    likelihood,
    impact,
    rating,
    residual,
    residualLikelihood,
    residualImpact,
    residualRating: residualLikelihood !== null && residualImpact !== null ? residualLikelihood * residualImpact : null,
  };
}

/** A sort key from 0 to 10 for how a threat is rated: likelihood × impact scaled to 10, or its score. */
const tmRatingWeight = (t) => (t.rating ? t.rating * 0.4 : t.score ?? -1);

/** The rating, short, for diagrams and notes: "4×5" or "6.1" (CVSS), "" for a risk tag alone. */
function tmRatingShort(t) {
  if (t.method === 'rating') return `${t.likelihood}×${t.impact}`;
  if ((t.method === 'cvss' || t.method === 'score') && t.score !== null && t.score !== undefined) return String(t.score);
  return '';
}

/** The rating for tables and reports: "4 × 5 = 20", "CVSS 6.1", "Score 6.1", or "" for a risk tag alone. */
function tmRatingText(t) {
  if (t.method === 'rating') return `${t.likelihood} × ${t.impact} = ${t.rating}`;
  if (t.method === 'cvss') return `CVSS ${t.score}`;
  if (t.method === 'score') return `Score ${t.score}`;
  return '';
}

/** The rating spelt out, for a tooltip: what each number means, and what is left after controls. */
function tmRatingTip(t) {
  const word = (n, words) => Object.keys(words).find((k) => words[k] === n) || '';
  const parts = [];
  if (t.method === 'rating') {
    parts.push(`Likelihood ${t.likelihood} (${word(t.likelihood, TM_LIKELIHOOD_WORDS)}) × impact ${t.impact} (${word(t.impact, TM_IMPACT_WORDS)}) = ${t.rating}: ${t.risk}`);
  } else if (t.method === 'cvss') parts.push(tmCvssMeaning(t.score), `How it is attacked and what it does: ${tmCvssExplain(t.cvss)}`);
  else if (t.method === 'score') parts.push(`Score ${t.score}: ${t.risk}`);
  else if (t.method === 'tag') parts.push(`Rated #${t.risk}`);
  if (t.residualRating) parts.push(`After controls: likelihood ${t.residualLikelihood} × impact ${t.residualImpact} = ${t.residualRating}: ${t.residual}`);
  else if (t.residual) parts.push(`After controls: ${t.residual}`);
  return parts.join('\n');
}

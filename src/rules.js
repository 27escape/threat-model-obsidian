// Findings: things the model's own facts say are risky, whether or not a threat has been written for them. Each
// rule reads what the model already records (where data goes, whether it is sensitive, which zone each end is in,
// and whether a flow is encrypted or authenticated) and says what looks wrong. They are prompts to write a threat
// or a control, not threats themselves.
//
// A flow is encrypted when it says so (encrypted = true), or when its protocol names something that encrypts
// (HTTPS, TLS, SSH and so on); unencrypted when it says encrypted = false, or its protocol is a plain one (HTTP,
// FTP, Telnet …); otherwise nobody has said. authenticated = true or false the same way, written only.

// OIDC and SAML run over HTTPS by definition
const TM_ENCRYPTING = /\b(https|tls|ssl|mtls|ssh|sftp|ftps|wss|ipsec|vpn|wireguard|smtps|imaps|ldaps|oidc|saml)\b/i;
const TM_PLAIN = /^(http|ftp|telnet|ws|smtp|imap|pop3|ldap|snmp|tftp|rsh)(\/[\d.]+)?$/i;

/** true, false or null (not stated) from a yes/no attribute; anything else is a warning. */
function tmYesNo(v, key, warn) {
  if (!v) return null;
  const t = tmValText(v).trim().toLowerCase();
  if (['true', 'yes'].includes(t)) return true;
  if (['false', 'no'].includes(t)) return false;
  warn(v.line, `${key} = "${tmValText(v)}" should be true or false`);
  return null;
}

/** Whether a flow is encrypted: its own say-so first, then its protocol. true, false or null. */
function tmFlowEncrypted(stated, protocol) {
  if (stated !== null) return stated;
  const p = String(protocol || '').trim();
  if (!p) return null;
  if (TM_ENCRYPTING.test(p)) return true;
  if (TM_PLAIN.test(p)) return false;
  return null;
}

/**
 * What the rules find: [{ rule, risk, message, flow }] (flow: its number), most serious first.
 * A crossing between zones that are both inside another (us-west-1 to us-west-2, inside AWS) is rated a step lower than
 * one that goes out of or into a zone altogether, and says which zone it stays inside.
 *  - plain-sensitive: sensitive data on a flow that isn't encrypted
 *  - unknown-sensitive: sensitive data crossing a zone boundary, with no word on whether it is encrypted
 *  - unauthenticated: a flow marked authenticated = false that crosses into another zone or writes to a store
 *  - untrusted-store: a store written straight from a zone marked untrusted, with nothing in between to check it
 */
function tmFindings(model) {
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const zone = (id) => model.zones.find((z) => z.id === id);
  const name = (id) => (byId.get(id) ? byId.get(id).title : id);
  const out = [];
  for (const f of model.flows) {
    const a = byId.get(f.from);
    const b = byId.get(f.to);
    if (!a || !b) continue;
    const what = `(${f.n}) ${name(f.from)} → ${name(f.to)}`;
    const inside = f.crossing && f.crossing.within ? zone(f.crossing.within) : null;
    const across = inside ? `between zones inside ${inside.title}` : 'across a zone boundary';
    const outward = f.crosses && !inside; // out of or into a zone altogether: the louder case
    const secret = f.data.filter((d) => tmIsSensitive(d.tags)).map((d) => d.text.replace(/\s*#\S+/g, '').trim());
    if (secret.length && f.encrypted === false) {
      out.push({ rule: 'plain-sensitive', risk: outward ? 'high' : 'medium', flow: f.n, message: `${what} carries ${secret.join(', ')} without encryption${f.crosses ? `, ${across}` : ''}` });
    } else if (secret.length && f.crosses && f.encrypted === null) {
      out.push({ rule: 'unknown-sensitive', risk: 'low', flow: f.n, message: `${what} carries ${secret.join(', ')} ${across}, but doesn't say whether it is encrypted: give it a protocol, or encrypted = true or false` });
    }
    if (f.authenticated === false && (f.crosses || b.role === 'store')) {
      out.push({ rule: 'unauthenticated', risk: outward ? 'high' : 'medium', flow: f.n, message: `${what} isn't authenticated, and ${f.crosses ? (inside ? `crosses ${across}` : 'crosses a zone boundary') : 'writes to a data store'}` });
    }
    const from = a.zone && zone(a.zone);
    if (b.role === 'store' && f.crosses && from && /untrusted/i.test(from.trust || '')) {
      out.push({ rule: 'untrusted-store', risk: 'medium', flow: f.n, message: `${what} writes to a data store straight from the ${from.title} zone (untrusted), with no process in between to check what is written` });
    }
  }
  return out.sort((x, y) => tmRiskRank(x.risk) - tmRiskRank(y.risk) || x.flow - y.flow);
}

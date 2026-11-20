// Controls: what is done, or planned, about threats. A control has an ID, a title, a status (planned, implemented
// or verified), an owner, a due date and the threats it covers. The link can be written on either side:
// "covers = [T01, T02]" on the control, or "controls = [C01]" on a threat; both end up on both.
// docs/language.md describes the syntax; the parser (parse.js) only collects them.

/** Build the controls; link each threat to its controls (threat.controls: IDs) and give it threat.controlled. */
function tmBuildControls(rawControls, rawThreats, threats, err, warn) {
  const threatById = new Map(threats.filter((t) => t.id).map((t) => [t.id, t]));
  const ids = (v) => (!v ? [] : v.type === 'list' ? v.value : [v]);
  const seen = new Map();
  const controls = rawControls.map((c) => {
    if (seen.has(c.id)) err(c.line, `control ${c.id} is used twice (first on line ${seen.get(c.id)})`);
    else if (threatById.has(c.id)) err(c.line, `control ${c.id} has the same ID as a threat: give one of them another ID`);
    else seen.set(c.id, c.line);
    const tags = [...new Set([...c.tags, ...tmTagsIn(c.title)])];
    let status = tmFirstOf(tags, TM_CONTROL_STATUSES) || 'planned';
    if (c.attrs.status) {
      const s = tmValText(c.attrs.status).toLowerCase();
      if (TM_CONTROL_STATUSES.includes(s)) status = s;
      else warn(c.attrs.status.line, `status "${s}" isn't one of ${TM_CONTROL_STATUSES.join(', ')}`);
    }
    const covers = [];
    for (const r of ids(c.attrs.covers)) {
      const id = tmValText(r);
      if (r.type === 'id' && threatById.has(id)) {
        if (!covers.includes(id)) covers.push(id);
      } else err(r.line, `covers: ${r.type === 'id' ? `there is no threat with the ID ${id}` : `"${id}" isn't a threat ID`}`);
    }
    return {
      id: c.id,
      title: c.title,
      tags,
      status,
      owner: tmValText(c.attrs.owner),
      due: tmValText(c.attrs.due),
      description: tmValText(c.attrs.description),
      covers,
      line: c.line,
    };
  });
  const controlById = new Map(controls.map((c) => [c.id, c]));

  // "controls = [C01]" on a threat
  rawThreats.forEach((raw, i) => {
    const t = threats[i];
    for (const r of ids(raw.attrs.controls)) {
      const id = tmValText(r);
      const c = r.type === 'id' && controlById.get(id);
      if (!c) err(r.line, `controls: ${r.type === 'id' ? `there is no control with the ID ${id}` : `"${id}" isn't a control ID`}`);
      else if (!t.id) err(r.line, `threat "${t.title}" needs an ID to have controls`);
      else if (!c.covers.includes(t.id)) c.covers.push(t.id);
    }
  });

  for (const t of threats) {
    t.controls = controls.filter((c) => t.id && c.covers.includes(t.id)).map((c) => c.id);
    t.controlled = tmBestControl(t.controls.map((id) => controlById.get(id).status));
  }
  for (const c of controls) {
    c.covers = threats.filter((t) => t.id && c.covers.includes(t.id)).map((t) => t.id); // in the order written
    if (!c.covers.length) warn(c.line, `control ${c.id} covers no threat: add covers = [T01, …]`);
  }
  // a threat whose controls are all in place may be done with: only a person can say so, so a reminder
  for (const [i, t] of threats.entries()) {
    const all = t.controls.map((id) => controlById.get(id));
    if (t.status === 'open' && all.length && all.every((c) => c.status !== 'planned')) {
      warn(rawThreats[i].line, `threat ${t.id}: all its controls are implemented or verified; if that deals with it, set status = "mitigated"`);
    }
  }
  return controls;
}

/** The furthest-on status among some controls' statuses ("verified" beats "implemented" beats "planned"), or "". */
function tmBestControl(statuses) {
  for (const s of [...TM_CONTROL_STATUSES].reverse()) if (statuses.includes(s)) return s;
  return '';
}

/** "C01 Mutual TLS (implemented)" for each of a threat's controls. */
function tmControlLines(model, t) {
  return t.controls.map((id) => {
    const c = model.controls.find((x) => x.id === id);
    return c ? `${c.id} ${c.title} (${c.status})` : id;
  });
}

/** An open threat's progress with its controls: "1 of 2 controls in place", or "" (closed, or no controls). */
function tmControlProgress(model, t) {
  if (!model || t.status !== 'open' || !t.controls || !t.controls.length) return '';
  const done = t.controls.filter((id) => {
    const c = model.controls.find((x) => x.id === id);
    return c && c.status !== 'planned';
  }).length;
  return t.controls.length === 1 ? (done ? 'its control is in place' : 'its control is planned') : `${done} of ${t.controls.length} controls in place`;
}

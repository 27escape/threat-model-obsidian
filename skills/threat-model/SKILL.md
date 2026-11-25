---
name: threat-model
description: Write a threat model in the Threat Modelling plugin's language (a `threat` code block or a `.threat` file for Obsidian) from a photo or picture of an architecture diagram, or from the user describing their system. Use when asked to create, draft or extend a threat model, STRIDE analysis or data-flow diagram for the Threat Modelling Obsidian plugin.
---

# Writing threat models for the Threat Modelling plugin

The Threat Modelling plugin for Obsidian draws a threat model written in its own small language as C4-style
Structure, Sequence and Data flow diagrams, and writes a report. Your job is to turn a picture or a description of a
system into a correct, useful model in that language: the parts of the system, the trust zones, the data flows, and
a first set of threats for the user to review.

The model you write is a **draft for a person to check**. Never present it as a finished assessment.

## The workflow

1. **Gather** the system, from a picture (step 1a) or a conversation (step 1b).
2. **Play it back** in plain English and get the user's corrections before writing anything.
3. **Write the model**: elements, zones, flows, then a scenario for each main journey (see *Scenarios*).
4. **Suggest threats** with STRIDE per element, each rated and marked as a suggestion.
5. **Check** the model against the list in *Checking your model*.
6. **Deliver** it as a `.threat` file or a `threat` code block, with a short summary of what you assumed.

### 1a. From a picture

A whiteboard photo, a Visio or draw.io export, a hand sketch or a screenshot. Read it carefully and list:

- **Boxes and shapes**: what each is (a person, one of our services, a database, a queue, someone else's system) and
  its label. Cylinders are usually stores; stick figures people; clouds or boxes outside the main area are usually
  external systems.
- **Arrows**: from and to, the label, and any protocol written on them (HTTPS, gRPC, SQL, AMQP).
- **Boundaries**: dashed or coloured areas, "VPC", "DMZ", "Internet", "on-prem". These become zones.
- **Groupings**: a box drawn around other boxes is a system or container they are part of.
- **Technology**: logos and words such as React, PostgreSQL, Kafka, S3, Auth0.
- **Order**: numbered arrows (1, 2, 3…), or a sequence diagram beside the picture, give the order of a journey:
  write it as a scenario.

Then **list what you could not read or are unsure of** and ask about it, a few questions at a time. Common gaps:

- an arrow with no label, or no arrowhead (which way does the data go? Often both: write two flows)
- whether a dashed box is a trust boundary or just a visual grouping
- what data an arrow carries, and whether any of it is sensitive (passwords, tokens, personal or card data)
- whether a box is ours or a third party's
- hand-writing you can't read: quote what you think it says and ask

Do not invent elements or flows that aren't in the picture. If the user wants you to fill gaps with sensible
guesses, say which are guesses (see *Delivering*).

### 1b. From a description

Interview the user, one topic at a time, in this order. Stop early if they've already said enough.

1. What the system is for, and who uses it (people and other systems that call it).
2. The main parts: front ends, services, databases, queues, file stores; the technology of each if known.
3. Third parties: identity providers, payment providers, email, cloud services.
4. Where each part runs: the internet, a DMZ, a cloud account, an office network. These are the zones.
5. What talks to what, in which direction, over what protocol, carrying what data.
6. What data is sensitive, and where it is stored.
7. The important journeys (signing in, placing an order, a nightly export, an administrator's change), step by step.
   These become scenarios. If the user doesn't name any, propose the obvious ones from the flows and ask.
8. Anything already known to be a worry, and controls already in place (MFA, WAF, encryption at rest).

### 2. Play it back

Before writing the model, summarise it in plain English: the people and systems, the zones and what is in each, the
flows (numbered), and the sensitive data. Ask "Is this right? What's missing?" Correct it, then write.

## The language

One model per `threat` code block or `.threat` file. Statements can share a line or be on their own lines.

| What | How |
| --- | --- |
| Comments | `// to the end of the line` or `/* across lines */` |
| Strings | `"one line"`, or backticks for several lines. No escapes: a `"…"` string can't contain `"` (use backticks) |
| Numbers, lists | `7.5`; `["Username", "Password #secret"]` |
| Attributes | `key = value`; several on a line separated by spaces: `technology = "Redis"  zone = dmz` |
| IDs | Letters, digits, `_` and `-`, starting with a letter: `auth_gateway`, `T-01`. **Every ID in the model must be different**, however deeply nested |
| Hashtags | After a title or inside any string: `#pii`, `#third-party` |

### Model attributes (top level)

`title`, `description`, `default_view` (`"structure"`, `"sequence"`, `"dataflow"`), `level` (`"context"`,
`"container"`, `"component"`), `scenario` (a scenario ID to open with), and for the report: `version`, `author`,
`owner`, `status` (`"draft"`, `"in-review"`, `"approved"`; **always write `"draft"`**), `review_date`
(`"2027-06-01"`), `scope`, `out_of_scope` (a list), `assumptions` (a list).

### Elements

`kind id "Title" #tags { attributes and nested elements }`. The title, tags and block are optional.

| Kind | Use for | Can contain |
| --- | --- | --- |
| `person` | A human user or role | — |
| `external` | Someone else's system: identity or payment provider, email service, partner API | — |
| `system` | Our software system as a whole | `container`, `component`, `store`, `queue` |
| `container` | A deployable or runnable part: web app, API, service, mobile app, function | `component`, `store`, `queue` |
| `component` | A part inside a container | — |
| `store` | A database, cache, bucket or file store | — |
| `queue` | A message queue, topic or event stream | — |

Element attributes: `title`, `description`, `technology` (`"PostgreSQL"`), `zone` (a zone ID), `link`
(`"[[Note name]]"` or a web address), `icon` (see *Icons*).

Don't use the old DataFlow words `io`, `function`, `database` or `boundary`: they are errors. Write `external`,
`container`, `store` and `zone`.

### Zones (trust boundaries)

`zone id "Title" { trust = "untrusted" }`. `trust` is free text; write `"untrusted"` for the internet and anything
the public or a third party controls, and something like `"restricted"` or `"trusted"` for your own networks.
An untrusted zone gets a warning shield on the Data flow view, and stores written straight from it are flagged.

Put an element in a zone by nesting it inside the zone's block, or with `zone = id` on the element (needed when the
element is nested in a system). An element without a zone takes its parent's.

Zones can nest: use that for a boundary inside a boundary, such as two regions or VPCs inside one cloud account, or
network segments inside a data centre. A flow between two zones inside the same outer zone is still a crossing, but
its findings are a step less serious than a flow going out of the outer zone, so nesting the zones as they really
are makes the ratings right:

```threat-source
zone aws "AWS (private)" { trust = "restricted"
  zone west1 "us-west-1" { store db1 "Orders" }
  zone west2 "us-west-2" { store db2 "Orders replica" }
}
```

### Flows

`from -> to "Label" #tags { attributes and threats }`. `to <- from` also works. **No two-way arrows**: write each
direction as its own flow, as they carry different data and threats.

| Attribute | Meaning |
| --- | --- |
| `protocol` | `"HTTPS"`, `"gRPC"`, `"SQL"`, `"OIDC"`, `"AMQP"`. HTTPS, TLS, SSH, OIDC and similar count as encrypted; HTTP, FTP, Telnet as not |
| `encrypted` | `true` or `false`, when the protocol doesn't say. Unencrypted flows are drawn dashed |
| `authenticated` | `true` or `false`; only write it if known |
| `data` | A string or list of strings. Tag sensitive items: `#secret` (passwords, keys, tokens), `#pii` (personal data), `#confidential` (business-sensitive); `#public` for data that isn't |
| `description` | Shown in the report |

Flows can be written at the top level or inside an element's block. Their ends must be elements that exist.

### Threats

`threat ID "Title" #STRIDE #tags { attributes }`. Where it is written says what it is about: inside a flow's block,
that flow; inside an element's or zone's block, that element or zone; at the top level, the whole model. To put one
threat on several things, use `on = [element, zone, a -> b, a -> b "Label"]`.

| Part | Meaning |
| --- | --- |
| ID | Always give one: `T01`, `T02`… (or a prefix such as `SHOP-01`) |
| STRIDE tags | `#S` spoofing, `#T` tampering, `#R` repudiation, `#I` information disclosure, `#D` denial of service, `#E` elevation of privilege; combine as `#TI`. Every threat needs at least one |
| `likelihood`, `impact` | **The way to rate a threat.** 1–5 each, or words: likelihood `rare`, `unlikely`, `possible`, `likely`, `almost-certain`; impact `negligible`, `minor`, `moderate`, `major`, `severe`. Risk = L × I: 20+ critical, 10+ high, 5+ medium, else low |
| `residual_likelihood`, `residual_impact` | L and I once the threat's controls are in place |
| `status` | `"open"` (default), `"mitigated"`, `"accepted"`, `"transferred"` |
| `mitigation`, `description`, `owner` | Free text, shown in the report |
| `controls` | Control IDs that deal with it |
| `cvss` | Only for a known vulnerability (a published CVE): its CVSS 3.x vector. Not for design threats |

Rate each threat **one way only**: likelihood and impact (preferred), or a risk tag (`#high`) for a quick rating, or
`cvss`. Don't use `score`.

### Controls

`control C01 "Title" #planned { covers = [T01, T02]  owner = "…"  due = "2026-12-31" }`, at the top level only, ID
required. Status tags: `#planned` (default), `#implemented`, `#verified`. Only write controls the user says exist or
are planned; suggest others in your summary rather than in the model.

### Scenarios

```threat-source
scenario login "Customer signs in" {
  customer -> webapp
  webapp -> gateway
  gateway -> webapp "Set session cookie"
}
```

Each step must match a flow already written (add the label when two flows join the same elements), in the order
things happen.

Scenarios are worth writing even for a small model: the plugin's scenario list shows one scenario at a time on
**every** view, cutting the Structure and Data flow diagrams down to that journey's flows and the parts they touch,
with its threats. So a model with its journeys as scenarios is much easier to read and review than one big diagram.

- Write one scenario for each journey the user describes or the picture numbers.
- If they describe none, add the obvious ones the flows already show, usually two to four: the main thing users do
  (sign in, place an order), anything with sensitive data (payments, personal data leaving the system), and
  background or administrative paths (replication, batch jobs, an operator's access). Mark these
  `// (suggested scenario)` on the line before, and say so when you deliver.
- Aim for most flows to be in at least one scenario; a flow in none is worth a question ("when does this happen?").
- Give each a short, plain title, as a user would say it: "Customer places an order", not "Order flow".
- Don't set the model's `scenario` attribute unless the user asks: the views open on all scenarios.

### Icons

Optional. Elements get sensible icons by default (a person `user`, a store `database`, React `globe`, Kafka
`list-ordered` and so on), so leave `icon` out unless the user asks or the default would be wrong. If you do set one,
use a Lucide name (`icon = "credit-card"`), never Font Awesome (`fa:fa-…`).

## Suggesting threats: STRIDE per element

Go through every element and flow, using this table for which categories usually apply:

| Item | Usual categories | Typical threats to consider |
| --- | --- | --- |
| `person`, `external` | S, R | Impersonation, stolen credentials, denying an action |
| `container`, `component`, `system` | S, T, R, I, D, E | Weak authentication, injection, missing audit log, data leak in errors, overload, privilege escalation |
| `store`, `queue` | T, R, I, D | Tampering with stored data, no audit of changes, data exposed (no encryption, open access), filled up or deleted |
| flow | T, I, D | Interception or change in transit, replay, flooding |
| flow crossing a zone boundary | S, T, I, D, and more weight | Unauthenticated calls, missing TLS, forged callbacks |

Concentrate on what crosses zone boundaries, sensitive data, stores, and anything reachable from the internet. Prefer
a dozen specific threats ("Password sent to the gateway over plain HTTP") to dozens of generic ones ("Data could be
intercepted"). Where one threat covers several flows, write it once with `on = [...]`.

For each threat give an ID, a specific title, STRIDE tags, `likelihood` and `impact`, and a `mitigation` if there is
an obvious one. Add a comment with your reasoning for the rating, and mark every one you invented as a suggestion:

```threat-source
threat T03 "Session cookie readable by scripts" #I {
  likelihood = "possible"  impact = "major"  // 3 × 4 = 12, high: an XSS bug would expose sessions (suggested)
  mitigation = "Set HttpOnly, Secure and SameSite on the cookie"
}
```

Leave `status` as open unless the user tells you a threat is dealt with.

## Checking your model

The plugin shows errors with line numbers when the model is opened, but check before delivering:

- [ ] Every ID is unique: elements, zones, threats, controls and scenarios together.
- [ ] Every flow's ends, every `zone =`, `on =`, `covers =`, `controls =` and scenario step names something that exists.
- [ ] Elements are only nested where allowed (nothing inside a `store`, `queue`, `component`, `person` or `external`).
- [ ] Inside a flow's block: only attributes and threats. Inside a threat or control: only attributes.
- [ ] Controls are at the top level and have IDs.
- [ ] No `io`, `function`, `database` or `boundary`; no two-way arrows; no `score`.
- [ ] Every threat has an ID, at least one STRIDE tag and exactly one rating.
- [ ] Strings are closed, and no `"…"` string contains a `"`.
- [ ] Sensitive data is tagged, and flows crossing zones have a `protocol` or `encrypted`.
- [ ] There is a scenario for each main journey, each step matching a flow, and suggested ones are marked.

## Delivering

- As a `.threat` file when the user wants a file, or in a note as a code block whose language is `threat`.
- Start the model with comments saying where it came from and what you assumed, for example:

```threat-source
// Drafted from a whiteboard photo on 2026-11-20. Status: draft, to be reviewed.
// Assumed: the arrow from the app to the queue is one-way; "Auth" is Auth0 (third party).
// Threats marked (suggested) were added by the AI and need a person's review.
```

- Set `status = "draft"` and fill in `scope`, `out_of_scope` and `assumptions` from what you learnt.
- After the model, tell the user in a few lines: what you couldn't read or had to guess, the threats you think matter
  most, the scenarios you added (and which you suggested), and controls worth considering. Suggest they open the
  Data flow view first, try each scenario from the scenario list, and use *Report* when it's ready.
- Write in British English.

## Example

From the description "Customers sign in to our web app through an auth gateway in our DMZ, which checks passwords
with Auth0 and keeps sessions in Redis":

```threat
// Drafted from the user's description. Status: draft, to be reviewed.
// Threats marked (suggested) were added by the AI and need a person's review.
title = "Customer sign-in"
status = "draft"
scope = "Signing in to the customer web app"
assumptions = ["Auth0 is configured by another team"]

zone internet "Internet" { trust = "untrusted" }
zone dmz "DMZ" { trust = "restricted" }
zone core "Core network" { trust = "trusted" }

person customer "Customer" { zone = internet }
external auth0 "Auth0" #third-party { technology = "Auth0"  zone = internet }

system portal "Customer portal" {
  container webapp "Web app" { technology = "React"  zone = internet }
  container gateway "Auth gateway" { technology = "Node.js"  zone = dmz }
  store sessions "Session store" { technology = "Redis"  zone = core }
}

customer -> webapp "Enters credentials" { data = ["Email #pii", "Password #secret"] }
webapp -> gateway "POST /login" {
  protocol = "HTTPS"
  data = ["Email #pii", "Password #secret"]
  threat T01 "Credential stuffing against the login form" #S {
    likelihood = "likely"  impact = "major"  // 4 × 4 = 16, high: public form, reused passwords (suggested)
    mitigation = "Rate limiting and MFA"
  }
}
gateway -> auth0 "Verify credentials" { protocol = "OIDC"  data = ["Email #pii", "Password #secret"] }
auth0 -> gateway "ID token" { protocol = "OIDC"  data = ["ID token #secret"] }
gateway -> sessions "Create session" {
  protocol = "Redis"
  data = ["Session ID #secret"]
  threat T02 "Session store reachable without authentication" #TI {
    likelihood = "possible"  impact = "severe"  // 3 × 5 = 15, high (suggested)
    mitigation = "Require a password and TLS on Redis; allow only the gateway"
  }
}
gateway -> webapp "Set session cookie" {
  protocol = "HTTPS"
  data = ["Session cookie #secret"]
  threat T03 "Session cookie readable by scripts" #I {
    likelihood = "possible"  impact = "major"  // 3 × 4 = 12, high (suggested)
    mitigation = "HttpOnly, Secure and SameSite on the cookie"
  }
}

threat T04 "No record of failed sign-ins" #R {
  on = [gateway]
  likelihood = "likely"  impact = "minor"  // 4 × 2 = 8, medium (suggested)
  mitigation = "Log every sign-in attempt with time and source"
}

scenario signin "Customer signs in" {
  customer -> webapp
  webapp -> gateway
  gateway -> auth0
  auth0 -> gateway
  gateway -> sessions
  gateway -> webapp
}
```

The flow to Redis has protocol `"Redis"`, which the plugin can't judge as encrypted or not, so the report will ask.
That is intended: it is a question for the user.

# Threat Modelling: sample vault

This vault shows the Threat Modelling plugin. Write a threat model in a `threat` code block and the plugin draws it three ways, and writes a report:

- **Structure**: a C4-style diagram of people, systems, containers and components, at three levels.
- **Sequence**: a scenario step by step, grouped by trust zone, with threats as notes.
- **Data flow**: the classic threat-modelling diagram, with trust boundaries, numbered flows and STRIDE letters.
- **Report ↗**: opens a new note with the diagrams, the threat register, flows that cross trust boundaries, sensitive data on them, and STRIDE categories not yet considered. Print it or export it to PDF from there.

Here is a small model. Switch to **Source mode** to see the text behind it.

```threat
title = "Example: sign-in"

zone internet "Internet" { trust = "untrusted" }
zone dmz "DMZ" { trust = "restricted" }

person user "User" { icon = "user"  zone = internet }

system app "Our app" {
  container web "Web app" { icon = "globe"  technology = "React"  zone = internet }
  container api "API" { icon = "server"  technology = "Node.js"  zone = dmz }
  store db "Accounts" { icon = "database"  technology = "PostgreSQL"  zone = dmz }
}

user -> web "Signs in"
web -> api "POST /login" {
  protocol = "HTTPS"
  data = ["Email #pii", "Password #secret"]
  threat T01 "Password guessing against the login" #S { likelihood = 3  impact = 4 }
}
api -> db "Reads the account" { data = ["Password hash #secret"] }
api -> web "Session cookie" { data = ["Session ID #secret"] }
```

## The guide

- [[README]]: what the plugin does, its settings and commands
- [[Language reference]]: everything you can write in a threat model

## More examples

- [[Customer portal sign-in]]: everything the language can do
- [[Authentication (STRIDE)]], [[Mobile payments]], [[Newsletter sign-up]] and [[Sony webapp]]: the examples from the DataFlow project this plugin grew out of, rewritten
- [[Internet banking]]: the C4 example from stride-plantuml, with its aggregated risks as shared threats
- [[Online shop.threat|Online shop]]: a model in a `.threat` file of its own


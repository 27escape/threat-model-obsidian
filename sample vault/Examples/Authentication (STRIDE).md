The STRIDE example from the original DataFlow project, rewritten as a threat model.

```threat
// Rewritten from DataFlow (.flow)
title = "Authentication Flow (STRIDE Example)"
description = `A user login, to show STRIDE categories and risks on threats.`

zone client_network "Client Network" {
  external browser "Web Browser" { icon = "globe" }
}

zone corporate_dmz "Corporate DMZ" {
  container auth_gateway "Auth Gateway" { icon = "shield" }
  store session_store "Redis Session Store" { icon = "database" }
}

browser -> auth_gateway "POST /login" {
  data = ["Username", "Password"]
  description = "User submits credentials over TLS."
  threat T01 "Credential stuffing attack on the public facing login portal." #S #I #critical
  threat T02 "TLS Downgrade attack leading to MITM password interception." #T #I #high
}

auth_gateway -> session_store "Create Session" {
  data = ["SessionID", "JWT Token"]
  description = "Store the active session mapping."
  threat T03 "Redis instance exposed without password authentication." #E #I #high
  threat T04 "Weak entropy used for SessionID generation." #I #medium
}

auth_gateway -> browser "Return 200 OK" {
  data = ["Set-Cookie: session_id"]
  threat T05 "Cookie missing HttpOnly and Secure flags, susceptible to XSS extraction." #S #medium
}

// threats to the whole system
threat T06 "Public endpoint discovery via automated scanning" #I #low
threat T07 "Application layer DoS on the login route" #D #medium
```

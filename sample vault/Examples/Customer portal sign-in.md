The fullest example: document details for the report, icons, three zones, controls, likelihood × impact with residual risk, a system with containers and stores, a third-party identity provider, two scenarios, threats on flows, on an element and on the whole model, each threat rated one way: likelihood × impact, a risk tag, or (for T03 and T04) a CVSS vector.

Try the view list, the C4 level list in **Structure**, and the scenario list in **Sequence**. **Report** saves the report, with its diagrams, as a new note in a *Reports* folder beside this one and opens it in a new tab, ready to export to PDF.

```threat
title = "Customer portal sign-in"
version = "0.3"
owner = "Identity team"
status = "in-review"
review_date = "2027-03-01"
scope = "Signing in to the customer portal, from the browser to the session store."
out_of_scope = ["Password reset", "The identity provider's own systems"]
assumptions = ["The identity provider is trusted to check passwords and second factors"]
description = `How a customer signs in to the portal: the browser, the authentication
gateway, the identity provider and the session store. #auth`
default_view = "structure"
level = "container"

zone internet "Internet" { trust = "untrusted" }
zone dmz "Corporate DMZ" { trust = "restricted" }
zone core "Core network" { trust = "trusted" }

person customer "Customer" {
  description = "Someone with an account"
  icon = "user"
  zone = internet
}

external idp "Identity Provider" #third-party {
  description = "Checks passwords and second factors"
  icon = "key"
  zone = internet
  link = "https://example.com/idp"
}

system portal "Customer Portal" {
  description = "Lets customers manage their accounts"

  container webapp "Web App" {
    technology = "React"
    icon = "globe"
    zone = internet
  }

  container gateway "Auth Gateway" {
    technology = "Node.js"
    icon = "shield"
    icon_colour = "#1d3557"
    icon_background = "#ffd166"
    zone = dmz
    owner = "Identity team"
  }

  store sessions "Session Store" {
    technology = "Redis"
    icon = "database"
    zone = core
    threat T03 "Redis reachable without authentication" #E #I {
      cvss = "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N"
      mitigation = "Set requirepass; bind to the private network only"
    }
  }

  store audit "Audit Log" {
    technology = "PostgreSQL"
    icon = "file-text"
    zone = core
  }
}

customer -> webapp "Enters credentials"

webapp -> gateway "POST /login" {
  protocol = "HTTPS"
  data = ["Username", "Password #secret"]
  threat T01 "Credential stuffing on the login form" #S {
    likelihood = "likely"
    impact = "severe"
    residual_likelihood = "unlikely"
    owner = "Identity team"
  }
  threat T02 "TLS downgrade exposes the password" #TI #high {
    status = "mitigated"
    mitigation = "HSTS; TLS 1.2 minimum"
  }
}

gateway -> idp "Verify credentials" {
  protocol = "OIDC"
  data = ["Username", "Password #secret"]
}

idp -> gateway "Identity token" {
  protocol = "OIDC"
  data = ["ID token #secret", "Email #pii"]
  threat T05 "Forged token accepted without checking its signature" #SE {
    status = "mitigated"
    likelihood = 3
    impact = 5
    residual_likelihood = 1
  }
}

gateway -> sessions "Create session" {
  protocol = "RESP over TLS"
  data = ["Session ID", "JWT #secret"]
}

gateway -> audit "Record the sign-in" {
  data = ["Username", "IP address #pii", "Time"]
  threat T06 "Sign-ins can't be traced to a person" #R { likelihood = 3  impact = 2 }
}

gateway -> webapp "Set session cookie" {
  protocol = "HTTPS"
  data = ["Session cookie #secret"]
  threat T04 "Cookie lacks HttpOnly and Secure flags" #S #I {
    cvss = "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"
  }
}

webapp -> customer "Shows the account page"
idp -> gateway "Rejected" { protocol = "OIDC" }
gateway -> webapp "Error page" { protocol = "HTTPS" }

// a threat to the whole system
threat T00 "Login endpoint found by automated scanning" #I #low { status = "accepted" }

// what is being done about the threats
control C01 "Rate limiting and lockout on the login form" #implemented {
  covers = [T01]
  owner = "Identity team"
}
control C02 "A second factor for every customer" {
  covers = [T01]
  owner = "Identity team"
  due = "2027-03-31"
}
control C03 "HSTS and TLS 1.2 minimum" #verified { covers = T02 }
control C04 "Check every token's signature and issuer" #implemented { covers = T05 }
control C05 "HttpOnly, Secure and SameSite on the session cookie" {
  covers = T04
  owner = "Web team"
  due = "2026-12-15"
}

scenario signin "Customer signs in" {
  customer -> webapp
  webapp -> gateway
  gateway -> idp
  idp -> gateway
  gateway -> sessions
  gateway -> audit
  gateway -> webapp
  webapp -> customer
}

scenario failed "Wrong password" {
  customer -> webapp
  webapp -> gateway
  gateway -> idp
  idp -> gateway "Rejected"
  gateway -> audit
  gateway -> webapp "Error page"
}
```

The C4 example from [stride-plantuml](https://github.com/paulbrimicombe/stride-plantuml), rewritten: the internet banking system's API application and the containers around it.

How the stride-plantuml parts are written here:

- **STRIDE letters on a box** (`$Stride("SE")`): here a box's letters come from its threats, so each box has a threat carrying the letters it had.
- **Aggregated risks** (`$AggregatedRisk("R1")` on several arrows): one threat with `on = [...]`, which puts its ID on every box and arrow it lists. The original's R1 and R2 had placeholder text, so the titles, risks and controls here are made up.
- **The risk table's "Fix" column**: controls (C1 to C5), each covering one or more threats, with a status.
- **The risk table** (`$RiskTable()`): the table under the diagram, and the threat register in the report.
- The original drew two "Uses" arrows from the single-page application to the sign-in controller; they are one flow here.
- **Trust to value ratio** (`$TrustValueRatio("2:5")`) has nothing to match it yet.

Choose **Component** in the level list to see inside the API application, as the original does. The scenario list (before the view list) shows one client at a time: *Web banking* (the single-page application) or *Mobile banking* (the mobile app), on every view.

```threat
title = "Internet banking"
description = `The C4 internet banking example from stride-plantuml: two client apps, an API
application, its database and the mainframe banking system.`
default_view = "structure"
level = "component"

system banking "Internet Banking System" {
  icon = "building"
  container spa "Single Page Application" {
    icon = "globe"
    technology = "JavaScript and React"
    description = "Provides all the internet banking functionality to customers via their web browser"
    threat T1 "Session token stolen from the browser and replayed" #SE #medium {
      mitigation = "Short-lived tokens in HttpOnly cookies; bind sessions to the device"
    }
  }

  container ma "Mobile App" {
    icon = "smartphone"
    technology = "Xamarin"
    description = "Provides a limited subset of the internet banking functionality to customers via their mobile device"
    threat T2 "Retry storms from the app overload the API" #D #low {
      status = "mitigated"
      mitigation = "Back-off in the app; rate limits at the API"
    }
  }

  store db "Database" {
    icon = "database"
    technology = "Relational database schema"
    description = "Stores user registration information, hashed authentication credentials, access logs, etc."
    threat T3 "Access logs altered to hide activity" #T #medium {
      mitigation = "Write logs append-only and copy them off the database"
    }
  }

  container api "API Application" {
    icon = "server"
    threat T4 "No record of who changed a password, and errors leak internal details" #RI #medium {
      mitigation = "Audit every security action; return generic errors"
    }

    component sign "Sign In Controller" {
      icon = "log-in"
      technology = "MVC REST controller"
      description = "Allows users to sign in to the internet banking system"
    }
    component accounts "Accounts Summary Controller" {
      icon = "wallet"
      technology = "MVC REST controller"
      description = "Provides customers with a summary of their bank accounts"
    }
    component security "Security Component" {
      icon = "lock"
      technology = "Spring Bean"
      description = "Provides functionality related to signing in, changing passwords, etc."
    }
    component mbsfacade "Mainframe Banking System Facade" {
      icon = "plug"
      technology = "Spring Bean"
      description = "A facade onto the mainframe banking system"
    }
  }
}

external mbs "Mainframe Banking System" {
  icon = "landmark"
  description = "Stores all of the core banking information about customers, accounts, transactions, etc."
}

sign -> security "Uses"
accounts -> mbsfacade "Uses"
security -> db "Reads and writes" { protocol = "JDBC" }
mbsfacade -> mbs "Uses" { protocol = "XML/HTTPS" }
spa -> sign "Uses" { protocol = "JSON/HTTPS" }
spa -> accounts "Uses" { protocol = "JSON/HTTPS" }
ma -> sign "Uses" { protocol = "JSON/HTTPS" }
ma -> accounts "Uses" { protocol = "JSON/HTTPS" }

// the aggregated risks: one threat each, shown wherever it applies
threat R1 "Customer credentials and account data pass through several services without end-to-end checks" #TI #high {
  on = [spa, spa -> sign, security -> db, mbsfacade -> mbs]
}

threat R2 "Clients can call the API without proof that they are the genuine apps" #SE #medium {
  on = [spa, spa -> accounts, ma -> sign, ma -> accounts]
}

// what is done about them
control C1 "Mutual TLS between services" #implemented { covers = R1 }
control C2 "Signed requests to the mainframe" {
  covers = R1
  owner = "Mainframe team"
}
control C3 "App attestation for the mobile app" { covers = R2 }
control C4 "Strict CORS and CSRF protection for the web app" #verified { covers = R2 }
control C5 "Rate limits at the API" #implemented { covers = [R2, T2] }

// one journey per client: sign in, then see the accounts
scenario web "Web banking" {
  spa -> sign
  sign -> security
  security -> db
  spa -> accounts
  accounts -> mbsfacade
  mbsfacade -> mbs
}

scenario mobile "Mobile banking" {
  ma -> sign
  sign -> security
  security -> db
  ma -> accounts
  accounts -> mbsfacade
  mbsfacade -> mbs
}
```

The smallest example, rewritten from the original DataFlow project's `simple.flow`.

```threat
// Rewritten from DataFlow (.flow)
title = "Newsletter Signup"

zone web "Public Website" {
  external visitor "Visitor" { icon = "user" }
  container frontend "Web Frontend" { icon = "globe" }
}

store mailing_list "Mailing List DB" { icon = "mail" }

visitor -> frontend "Submit form" {
  data = ["Email address"]
}

frontend -> mailing_list "Store contact" {
  data = ["Email address", "Timestamp"]
}
```

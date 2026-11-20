Rewritten from the original DataFlow project's `complex.flow`. Its threats were plain text, so they have IDs but no STRIDE categories or risks: the warnings under the model list what to add.

```threat
// Rewritten from DataFlow (.flow)
title = "Mobile Payment Flow"
description = `Architecture for processing customer orders and handling 
payments securely through a third-party gateway.`

zone customer_device "Customer Device" {
  external user "Customer" { icon = "user" }
  container mobile_app "Mobile App" { icon = "smartphone" }
}

zone cloud_backend "Cloud Infrastructure" {
  container api_gateway "API Gateway" { icon = "network" }
  container payment_service "Payment Microservice" { icon = "credit-card" }
  store order_db "Orders Database" { icon = "database" }
}

external payment_provider "External Payment Gateway" { icon = "landmark" }

user -> mobile_app "Tap 'Checkout'" {
  description = "User initiates the checkout process from their cart."
}

mobile_app -> api_gateway "Submit Payment" {
  data = ["AuthToken", "OrderTotal", "CardDetails"]
  description = "Encrypted payload sent over TLS."
  threat T01 "Man-in-the-Middle (MITM) if TLS is bypassed or downgraded"
}

api_gateway -> payment_service "Route Request" {
  data = ["CardDetails"]
}

payment_service -> payment_provider "Process Charge" {
  data = ["Amount", "CardDetails"]
  description = "External API call to clear the funds."
  threat T02 "Third-party API outage"
  threat T03 "API key leakage"
}

payment_provider -> payment_service "Charge Result" {
  data = ["TransactionID", "Status"]
}

payment_service -> order_db "Update Order" {
  data = ["OrderID", "Status<sub>payment</sub>"]
  description = "Mark the order as paid in the database."
  threat T04 "SQL Injection during record update"
}

payment_service -> mobile_app "Return Receipt" {
  data = ["Receipt HTML"]
}

// threats to the whole system
threat T05 "Distributed Denial of Service (DDoS) against the public API"
threat T06 "Credential stuffing on customer accounts"
```

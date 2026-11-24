# Example: a model from a whiteboard photo

How the skill handles a picture, step by step. The photo itself isn't included; this is what was read from it.

## What was read

A whiteboard photo of an online shop:

- A stick figure labelled "Shopper", outside a large dashed box labelled "AWS".
- Inside the dashed box: "Storefront (Next.js)", "Orders API (Java)", a cylinder "Orders DB (Postgres)" and a
  shape like a pipe labelled "Kafka".
- To the right, outside the box, a box labelled "Stripe".
- Arrows: Shopper → Storefront "HTTPS"; Storefront → Orders API "checkout"; Orders API → Stripe "pay";
  Stripe → Orders API with no label; Orders API → Orders DB; Orders API → Kafka "order placed".
- Hand-writing under Kafka that might say "→ warehouse".

## Questions asked before writing

1. The arrow from Stripe back to the Orders API has no label. Is it the payment callback (webhook)?
2. Is the dashed "AWS" box one trust zone, or are there separate networks inside it (for example, the database in
   a private subnet)?
3. Under Kafka it looks like "→ warehouse". Is there a warehouse system that reads the order events, and is it
   ours or someone else's?
4. What does the shopper send at checkout: card details, or a Stripe payment token?
5. Do the Orders API's connections to Postgres and Kafka use TLS?

The user answered: yes, it's Stripe's webhook; one zone; the warehouse is another team's system, out of scope; a
Stripe token, never card numbers; TLS to Postgres but not to Kafka.

## Played back

> People and systems: the Shopper (on the internet), Stripe (a third party on the internet), and our shop in the AWS
> account: the Storefront, the Orders API, the Orders database and the Kafka order events.
> Flows: (1) Shopper → Storefront, browsing and checkout over HTTPS; (2) Storefront → Orders API, checkout with the
> address and a payment token; (3) Orders API → Stripe, take payment; (4) Stripe → Orders API, the payment webhook;
> (5) Orders API → Orders DB, save the order, TLS; (6) Orders API → Kafka, order placed, not encrypted.
> Sensitive data: the shopper's address (personal) and the payment token (secret). The warehouse is out of scope.

## The model

```threat
// Drafted from a whiteboard photo and the answers to five questions. Status: draft, to be reviewed.
// Assumed: the Storefront calls the Orders API over HTTPS (not written on the board).
// Threats marked (suggested) were added by the AI and need a person's review.
title = "Online shop checkout"
status = "draft"
scope = "From the shopper's checkout to the order being saved and published"
out_of_scope = ["The warehouse system (another team)"]
assumptions = ["Card numbers never reach our systems: Stripe returns a token"]

zone internet "Internet" { trust = "untrusted" }
zone aws "AWS account" { trust = "restricted" }

person shopper "Shopper" { zone = internet }
external stripe "Stripe" #third-party { technology = "Stripe"  zone = internet }

system shop "Online shop" {
  zone = aws
  container storefront "Storefront" { technology = "Next.js" }
  container orders "Orders API" { technology = "Java" }
  store ordersdb "Orders DB" { technology = "PostgreSQL" }
  queue events "Order events" { technology = "Kafka" }
}

shopper -> storefront "Browses and checks out" { protocol = "HTTPS"  data = ["Address #pii", "Payment token #secret"] }
storefront -> orders "Checkout" {
  protocol = "HTTPS"
  data = ["Address #pii", "Payment token #secret", "Basket"]
  threat T01 "Prices changed in the browser before checkout" #T {
    likelihood = "likely"  impact = "moderate"  // 4 × 3 = 12, high: prices come from the client (suggested)
    mitigation = "Recalculate prices on the server from the basket's product IDs"
  }
}
orders -> stripe "Take payment" { protocol = "HTTPS"  data = ["Payment token #secret", "Amount"] }
stripe -> orders "Payment webhook" {
  protocol = "HTTPS"
  data = ["Payment result"]
  threat T02 "Forged webhook marks an unpaid order as paid" #S #T {
    likelihood = "possible"  impact = "major"  // 3 × 4 = 12, high: the endpoint is public (suggested)
    mitigation = "Verify Stripe's signature on every webhook"
  }
}
orders -> ordersdb "Save the order" { protocol = "TLS"  data = ["Order #pii"] }
orders -> events "Order placed" {
  encrypted = false
  data = ["Order #pii"]
  threat T03 "Order details readable on the Kafka network" #I {
    likelihood = "unlikely"  impact = "moderate"  // 2 × 3 = 6, medium: inside the AWS account (suggested)
    mitigation = "Turn on TLS for Kafka, or leave the address out of the event"
  }
}

threat T04 "Checkout flooded to exhaust the Orders API" #D {
  on = [storefront -> orders]
  likelihood = "possible"  impact = "moderate"  // 3 × 3 = 9, medium (suggested)
  mitigation = "Rate limiting at the load balancer"
}

scenario checkout "Shopper checks out" {
  shopper -> storefront
  storefront -> orders
  orders -> stripe
  stripe -> orders
  orders -> ordersdb
  orders -> events
}
```

## Told to the user afterwards

- Guessed: the Storefront to Orders API call uses HTTPS (not on the board).
- Most important: T02 (forged webhooks) and T01 (client-side prices); both are cheap to fix.
- The model will show a finding for personal data on the unencrypted Kafka flow; T03 covers it.
- Worth considering as controls: webhook signature checks, server-side pricing, TLS for Kafka.

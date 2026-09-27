# ADR-0011: Stripe Checkout is confirmed by client-triggered polling, not webhooks; manual slips are verified by Finance

## Context

Citizens pay service fees and installments either online or by bank deposit/transfer, which is still the norm for Sri Lankan government fees. The API runs on developer machines and a local network (`http://0.0.0.0:5119`), with no public HTTPS endpoint that Stripe could deliver webhooks to.

## Options Considered

1. **Stripe webhooks** (`checkout.session.completed`) marking payments paid server-side.
2. **Client-triggered confirmation.** After the Checkout page closes, the app calls the API, which retrieves the session from Stripe and marks the payment paid if `PaymentStatus == "paid"`.
3. **Manual-only payments** verified by staff.

## Decision

Option 2 for card payments, alongside Option 3 for bank payments.

- **Online payments:** `POST /api/payments/checkout` → `GET /api/payments/{id}/confirm`. For installments, it's `…/installments/{id}/checkout` → `…/confirm`.
- **Deposit slips:** a slip uploaded with the application form becomes a `PendingVerification` payment. A Finance Officer approves or rejects it (`POST /api/payments/{id}/verify`) or edits its status (`PUT /api/payments/{id}/status`), scoped to their department.
- **Installment transfers:** a transfer receipt is verified by staff (`…/pay` or `…/reject-transfer`).
- An online reference typed into a form's payment field (`"Online Ref: …"`) is recorded directly as `Paid`.

## Consequences

- Works with no public endpoint and no webhook secret.
- **A payment is only marked paid if the client comes back and calls confirm.** If the app is closed after paying, the payment stays `Pending` until someone calls `confirm` again. Nothing reconciles automatically.
- Checkout `SuccessUrl`/`CancelUrl` are `https://example.com/...` placeholders. Real redirects need proper URLs or app deep links.
- **The "Online Ref:" path trusts the citizen.** Any string typed there creates a `Paid` payment with no check against Stripe or a bank, which also satisfies the approval lock (`docs/adr/0009-multi-stage-department-workflow.md`). This needs to become `PendingVerification`, or be validated, before real use.
- Before this runs against live keys, it needs:
  - webhook handling behind a public HTTPS endpoint
  - real redirect URLs
  - removal or verification of the free-text online reference

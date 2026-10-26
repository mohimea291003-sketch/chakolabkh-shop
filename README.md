# CHAKO LAB Cambodia online shop

## Exact-amount ABA / KHQR checkout (feature branch)

This branch adds a browser-side generator that takes the shop's existing
ABA-issued `aba-khqr.jpg`, validates the original KHQR checksum and USD
currency, and generates a **new KHQR payload for the displayed checkout total**
(including the delivery fee). It preserves the original receiving information
and recomputes the checksum.

The tested original source must be the same account as the QR already stored
in this repository. Do not replace the image with a customer's QR.

The generator does not call ABA PayWay, does not request bank API credentials,
and does not verify payments. The user's reported successful $0.10 real payment
was through the separate QR test tool, **not this website checkout**.

### Features

- QR amount matches the total (or verified remaining amount) in USD.
- QR display libraries are bundled under `vendor/` to avoid CDN outages.
- Customer can save the generated code to pay from a mobile banking app.
- If QR decoding/generation fails, a clear error replaces the QR; the site
  does not silently show a different amount.
- Restored carts are repriced using the latest front-end product catalogue.
- Existing staff-reviewed receipt processing remains in place.
- Existing Phnom Penh COD and province ABA-only payment options remain in place.

### Release checklist — do not merge until complete

1. Load the branch in a real HTTP/HTTPS browser environment, not a `file://`
   link (the original QR photo is decoded with canvas).
2. Submit checkout with a product total + delivery fee (e.g. $39.98),
   check the generated QR with ABA Mobile for **exact amount, currency and
   actual CHAKO LAB receiving account**.
3. From a different phone/bank account, make a tiny real payment using the
   **website-generated** QR. Confirm credit in ABA and ensure the shop
   records the actual transaction (not only an uploaded receipt).
4. Upload the proof and verify pending staff approval; check Telegram order
   delivery using existing Apps Script payment/receipt backend.
5. Test a reused or fake receipt; it must not be approved.
6. Test a partially paid order; verified remaining balance must produce a
   QR for the remaining amount and staff must correctly review it.
7. Test a province order (ABA-only), Phnom Penh COD order, browser reload,
   QR download on Android and iPhone, and missing QR-library failures.
8. Have the server independently verify item prices, delivery fee, order
   identity and bank payment before marking an order paid. Front-end price
   checks alone are NOT secure.

### Important limitations

- ABA documents that KHQR codes can be paid multiple times. A QR code,
  proof screenshot, click or bank app confirmation on the customer's phone
  is **not** proof funds reached the shop. Staff must verify the specific
  bank transaction and prevent double approval.
- The QR's amount field is fixed within the QR payload, but no client-side
  implementation can guarantee a payer does not initiate some separate
  transfer with a different amount. Verify actual received value.
- Dynamic KHQR is not a bank-issued ABA PayWay payment link, not an
  automatic webhook, and not a monthly API subscription.
- Product prices and totals in static website JavaScript can be tampered
  with. Production backend must recalculate from the trusted catalogue.
- Telegram Mini App is a separate application and is NOT changed here.

## Rollout

The site stays on `main` until this feature branch passes the release
checklist. Do not treat a draft pull request as a live deployment.

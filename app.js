const CHAKO_PRODUCTS =
  window.CHAKO_PRODUCTS || [];

let pendingPaymentOrder = null;

const PAYMENT_CHECK_URL =
  "https://script.google.com/macros/s/AKfycbw0_TGmUmDzA4GkNHeZaVkbKWNRii1REVie_o0zv1Idj8DCAvtx5ITOxLDQ54pdJF3m/exec";

let paymentCheckInProgress = false;

const PAYMENT_API_VERSION = "chako-payment-proof-v5";
const PAYMENT_APPROVAL_POLICY = "staff-reviewed-v1";

function sendWebsiteOrderReceipt(order, extra = {}) {
  if (!order) return;

  const payload = {
    ...order,
    ...extra
  };

  return fetch(
    PAYMENT_CHECK_URL +
      "?action=websiteOrder&_=" +
      Date.now(),
    {
      method: "POST",

      // Important for GitHub Pages → Apps Script
      mode: "no-cors",

      headers: {
        "Content-Type":
          "text/plain;charset=utf-8"
      },

      body: JSON.stringify(payload),

      cache: "no-store"
    }
  ).catch(function(error) {
    console.error(
      "Website order Telegram error:",
      error
    );
  });
}
/* =========================================
   CITY / PROVINCE → PAYMENT OPTIONS
   ========================================= */

window.updatePaymentMethods = function() {

  const city =
    document.getElementById("customerCity").value;

  const payment =
    document.getElementById("paymentMethod");

  payment.innerHTML = "";


  if (!city) {

    payment.disabled = true;

    payment.innerHTML = `
      <option value="">
        Select city / province first
      </option>
    `;

    updateLocationSection();
    return;
  }


  payment.disabled = false;


  /* PHNOM PENH */

  if (city === "Phnom Penh") {

    payment.innerHTML = `
      <option value="">
        Select payment method
      </option>

      <option value="ABA / KHQR">
        ABA / KHQR
      </option>

      <option value="Cash on Delivery">
        Cash on Delivery
      </option>
    `;

  }


  /* ALL OTHER PROVINCES */

  else {

    payment.innerHTML = `
      <option value="ABA / KHQR">
        ABA / KHQR
      </option>
    `;

    payment.value = "ABA / KHQR";
  }


  updateLocationSection();
};


/* =========================================
   SHOW LOCATION BUTTON FOR COD
   ========================================= */

window.updateLocationSection = function() {

  const payment =
    document.getElementById("paymentMethod")?.value;

  const box =
    document.getElementById("codLocationGroup");

  if (!box) return;

  const label =
    box.querySelector("label");

  const description =
    box.querySelector("p");

  if (!payment) {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";

  label.textContent =
    "Delivery Location *";

  description.textContent =
    "Share your current location to fill your delivery address, then check your house number, street, and nearby landmark.";
};


/* =========================================
   GET DELIVERY LOCATION
   ========================================= */

// Address lookup runs in the shop's Apps Script, without a public Maps key.
const DELIVERY_ADDRESS_API_VERSION = "chako-delivery-address-v2";
let deliveryLocationBusy = false;

function formatDeliveryAddress(results, nearbyLandmark = "") {
  const isPlusCode = text => /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i.test(String(text || "").trim());
  const valueIn = (result, type) => {
    const item = (Array.isArray(result?.address_components) ? result.address_components : []).find(value =>
      Array.isArray(value?.types) && value.types.includes(type));
    const name = String(item?.long_name || "").trim();
    return name && !isPlusCode(name) ? name : "";
  };
  const readable = results.filter(result => result && !result.types?.includes("plus_code"));
  // House, street, apartment and building must come from the same result.
  const primary = readable.find(result => valueIn(result, "route")) ||
    readable.find(result => valueIn(result, "premise")) || readable[0];
  const compatible = readable.filter(result => ["country", "locality", "administrative_area_level_2"].every(type => {
    const a = valueIn(primary, type), b = valueIn(result, type);
    return !a || !b || a.toLowerCase() === b.toLowerCase();
  }));
  const component = type => valueIn(primary, type) || compatible.map(result => valueIn(result, type)).find(Boolean) || "";
  const street = valueIn(primary, "route");
  const premise = valueIn(primary, "premise");
  const pieces = [
    street || premise, valueIn(primary, "subpremise"),
    component("administrative_area_level_4") || component("sublocality_level_3"),
    component("administrative_area_level_3") || component("sublocality_level_2") || component("neighborhood"),
    component("administrative_area_level_2") || component("sublocality_level_1"),
    component("locality") || component("administrative_area_level_1"),
    component("postal_code"), component("country")
  ].filter(Boolean);
  let address = Array.from(new Map(pieces.map(value => [value.toLowerCase(), value])).values()).join(", ");
  if (!street) {
    const preferred = readable.find(result =>
      result.types?.some(type => ["street_address", "route", "premise"].includes(type)) &&
      result.formatted_address && !isPlusCode(result.formatted_address));
    const fallback = preferred || readable.find(result =>
      result.formatted_address && !isPlusCode(result.formatted_address) && !result.types?.includes("plus_code"));
    if (fallback) address = String(fallback.formatted_address);
  }
  if (!address) return {address: "", hasStreet: false};
  const number = valueIn(primary, "street_number");
  const prefix = number ? "House No: " + number + ", " : "House No: [Please enter], ";
  const suppliedName = typeof nearbyLandmark === "string" ? nearbyLandmark : nearbyLandmark?.name;
  const landmark = String(suppliedName || (street && premise ? premise : "")).trim().slice(0, 500);
  const suffix = landmark && !isPlusCode(landmark) && !address.toLowerCase().includes(landmark.toLowerCase()) ? " — " + landmark : "";
  return {address: prefix + address + suffix, hasStreet: !!street, landmark: suffix ? landmark : ""};
}

async function requestDeliveryAddress(latitude, longitude) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const url = PAYMENT_CHECK_URL + "?action=deliveryAddress&latitude=" +
      encodeURIComponent(latitude) + "&longitude=" + encodeURIComponent(longitude);
    const response = await fetch(url, {cache: "no-store", ...(controller ? {signal: controller.signal} : {})});
    if (!response.ok) throw new Error("Address lookup unavailable");
    const data = await response.json();
    if (!data.ok || ![DELIVERY_ADDRESS_API_VERSION, "chako-delivery-address-v1"].includes(data.addressApiVersion) || !Array.isArray(data.results)) {
      throw new Error("Address lookup unavailable");
    }
    return {...formatDeliveryAddress(data.results, data.landmark),
      landmarkStatus: data.landmarkStatus || "GEOCODE_ONLY",
      attributions: Array.isArray(data.landmarkAttributions) ? data.landmarkAttributions.filter(value => typeof value === "string") : []};
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

window.getDeliveryLocation = function() {
  const status = document.getElementById("deliveryLocationStatus");
  const addressField = document.getElementById("customerAddress");
  const button = document.getElementById("deliveryLocationButton");
  if (deliveryLocationBusy) return;
  if (!navigator.geolocation) {
    status.textContent = "Location is not supported on this device.";
    return;
  }
  const originalAddress = addressField?.value || "";
  deliveryLocationBusy = true;
  if (button) button.disabled = true;
  status.textContent = "📍 Getting your current location...";
  const finish = () => { deliveryLocationBusy = false; if (button) button.disabled = false; };
  const failed = () => { status.textContent = "Please allow location access and try again."; finish(); };
  try {
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = Number(position.coords.latitude), longitude = Number(position.coords.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        failed(); return;
      }
      document.getElementById("customerLatitude").value = String(latitude);
      document.getElementById("customerLongitude").value = String(longitude);
      const mapLink = "https://www.google.com/maps/search/?api=1&query=" + latitude + "," + longitude;
      status.textContent = "📍 Location received. Finding your address...";
      let message = "Your map location is saved. Please enter your house number, street, and Borey or nearby landmark below.";
      try {
        const found = await requestDeliveryAddress(latitude, longitude);
        if (found.address && addressField) {
          if (addressField.value === originalAddress) {
            addressField.value = found.address;
            message = found.landmark ?
              "Address filled automatically with a nearby landmark. Please check your house number, street, and landmark before continuing." :
              "Address filled automatically. Please check your house number and street, and add your Borey or nearby landmark if it is missing.";
            const credit = document.getElementById("deliveryAddressAttribution");
            const providers = document.getElementById("deliveryAddressProviderCredit");
            if (credit) credit.hidden = false;
            if (providers) providers.textContent = found.attributions.length ? " · " + found.attributions.join(", ") : "";
          } else {
            message = "Your location is saved and your edited address was kept. Please check it before continuing.";
          }
        }
      } catch (error) {
        // The map pin and a manually entered address still allow checkout.
      } finally {
        status.innerHTML = '<div>✅ Delivery location received.</div><a class="delivery-map-link" href="' + mapLink +
          '" target="_blank" rel="noopener noreferrer">📍 View My Location on Map</a><p class="delivery-address-hint">' + message + '</p>';
        finish();
      }
    }, failed, {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
  } catch (error) { failed(); }
};


/* =========================================
   ORDER PAYMENT ROUTING
   ========================================= */

window.openPaymentModal = function(order) {

  /* =========================================
     LOCATION REQUIRED FOR ALL ORDERS
     ========================================= */

  const latitude =
    document.getElementById(
      "customerLatitude"
    )?.value;

  const longitude =
    document.getElementById(
      "customerLongitude"
    )?.value;

  const address =
    document.getElementById(
      "customerAddress"
    )?.value.trim();


  if (!latitude || !longitude) {

    alert(
      "Please tap “Use My Current Location” before continuing your order."
    );

    document
      .getElementById("codLocationGroup")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

    return;
  }


  /* =========================================
     SAVE LOCATION INTO ORDER
     ========================================= */

  if (!order.customer) {
    order.customer = {};
  }

  order.customer.latitude =
    latitude;

  order.customer.longitude =
    longitude;

  order.customer.mapLink =
    "https://www.google.com/maps?q=" +
    latitude +
    "," +
    longitude;

  if (address) {
    order.customer.address =
      address;
  }


  /* =========================================
     CASH ON DELIVERY
     ========================================= */

  if (
    order.paymentMethod ===
    "Cash on Delivery"
  ) {

    sendWebsiteOrderReceipt(
  order,
  {
    paymentLabel: "Cash on Delivery",
    paymentStatus: "🟠 COD / UNPAID"
  }
);
    confirmCODOrder(order);

    return;
  }


  /* =========================================
     ABA / KHQR
     ========================================= */

  restorePaymentOrder(order);
  pendingPaymentOrder = order;
  renderPaymentProofs(order);

  document.getElementById(
    "paymentAmount"
  ).textContent =
    "$" +
    Number(order.lastVerifiedPayment?.remainingAmount ?? order.total).toFixed(2);

  document.getElementById("paymentAmountLabel").textContent =
    order.lastVerifiedPayment ? "Remaining to pay" : "Amount to pay";


  document.getElementById(
    "paymentStatus"
  ).textContent = "";


  document
    .getElementById("paymentModal")
    .classList.add("show");


  document
    .getElementById("overlay")
    .classList.add("show");
};


/* =========================================
   CLOSE PAYMENT POPUP
   ========================================= */

window.closePaymentModal = function() {

  document
    .getElementById("paymentModal")
    .classList.remove("show");


  document
    .getElementById("overlay")
    .classList.remove("show");
};


/* =========================================
   CUSTOMER HAS PAID
   ========================================= */

const PAYMENT_SESSION_KEY = "chakoPendingReceiptPaymentV2";
let receiptPreparationInProgress = false;

function paymentCheckoutKey(order) {
  // Images and a refreshed map pin do not change the purchase being paid for.
  return JSON.stringify({version: 3, totalCents: Math.round(Number(order.total) * 100),
    items: (order.items || []).map(item => [String(item.id),
      Math.round(Number(item.price) * 100), Number(item.quantity),
      String(item.selectedSize || ""), String(item.selectedColor || "")])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    phone: String(order.customer?.phone || "").trim()});
}

function isSamePaymentCheckout(previous, order) {
  const current = paymentCheckoutKey(order);
  if (!previous) return false;
  if (!previous.checkoutKey) return paymentCheckoutKey(previous) === current;
  if (previous.checkoutKey === current) return true;
  try {
    const legacy = JSON.parse(previous.checkoutKey);
    return Array.isArray(legacy) && legacy.length === 3 && Array.isArray(legacy[1]) &&
      paymentCheckoutKey({total: legacy[0], items: legacy[1], customer: legacy[2]}) === current;
  } catch (error) { return false; }
}

function rememberPaymentOrder(order) {
  try {
    sessionStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify({
      checkoutKey: paymentCheckoutKey(order),
      websiteOrderId: order.websiteOrderId, orderNumber: order.orderNumber,
      proofAccessToken: order.proofAccessToken,
      paymentProofs: (order.paymentProofs || []).filter(proof => proof.state === "uploaded")
        .map(({id, name, digest, details, state}) => ({id, name, digest, details, state})),
      lastVerifiedPayment: order.lastVerifiedPayment
    }));
  } catch (error) {}
}

function restorePaymentOrder(order) {
  let previous = pendingPaymentOrder;
  if (!previous) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PAYMENT_SESSION_KEY) || "null");
      if (isSamePaymentCheckout(saved, order)) previous = saved;
    } catch (error) {}
  }
  if (isSamePaymentCheckout(previous, order)) {
    ["websiteOrderId", "orderNumber", "proofAccessToken", "paymentProofs", "lastVerifiedPayment"]
      .forEach(key => { if (previous[key]) order[key] = previous[key]; });
  }
  order.websiteOrderId ||= "CHAKO-WEB-" + Date.now() + "-" + PaymentProofReader.randomId().slice(0, 16);
  order.proofAccessToken ||= PaymentProofReader.randomId();
  order.paymentProofs ||= [];
  if (order.lastVerifiedPayment?.approvalPolicy !== PAYMENT_APPROVAL_POLICY) {
    delete order.lastVerifiedPayment;
  }
}

function renderPaymentProofs(order = pendingPaymentOrder) {
  const list = document.getElementById("paymentProofList");
  if (!list) return;
  list.replaceChildren();
  (order?.paymentProofs || []).forEach(proof => {
    const item = document.createElement("div");
    item.className = "payment-proof-item";
    if (proof.dataUrl) {
      const image = document.createElement("img");
      image.src = proof.dataUrl;
      image.alt = "Selected payment receipt";
      item.appendChild(image);
    }
    const description = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = proof.name;
    const detail = document.createElement("span");
    detail.textContent = proof.state === "rejected" ? "Receipt rejected · contact CHAKO LAB" :
      proof.state === "uploaded" ? "Sent for payment review · awaiting approval" :
      proof.details?.amount != null ? "Receipt shows $" + Number(proof.details.amount).toFixed(2) + " · ready to upload" :
      "Ready to upload · shop can review this receipt";
    description.append(name, detail);
    item.appendChild(description);
    if (proof.state === "ready" || proof.state === "rejected") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "payment-proof-remove";
      remove.textContent = "Remove";
      remove.disabled = paymentCheckInProgress || receiptPreparationInProgress;
      remove.addEventListener("click", () => {
        if (paymentCheckInProgress || receiptPreparationInProgress) return;
        order.paymentProofs = order.paymentProofs.filter(saved => saved !== proof);
        rememberPaymentOrder(order);
        renderPaymentProofs(order);
      });
      item.appendChild(remove);
    }
    list.appendChild(item);
  });
}

window.addPaymentProofs = async function(files) {
  const order = pendingPaymentOrder;
  const input = document.getElementById("paymentProofs");
  const status = document.getElementById("paymentStatus");
  const button = document.getElementById("paidButton");
  if (!order || receiptPreparationInProgress || paymentCheckInProgress) return;
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (selected.length > 10) {
    status.textContent = "You can upload up to 10 receipts for this order. Please contact CHAKO LAB if you need help.";
    input.value = "";
    return;
  }
  receiptPreparationInProgress = true;
  input.disabled = true;
  button.disabled = true;
  try {
    for (const file of selected) {
      status.textContent = "Reading your receipt...";
      const prepared = await PaymentProofReader.prepareImage(file);
      if (pendingPaymentOrder !== order) return;
      const existing = order.paymentProofs.find(proof => proof.digest === prepared.digest);
      if (!existing && order.paymentProofs.length >= 10) {
        status.textContent = "You can upload up to 10 receipts for this order. Please contact CHAKO LAB if you need help.";
        break;
      }
      if (existing && (existing.state !== "uploaded" || existing.details?.purchaseId)) {
        status.textContent = "This receipt is already selected. Add the receipt for your new payment.";
        continue;
      }
      const details = await PaymentProofReader.readReceipt(prepared.dataUrl, progress => {
        if (pendingPaymentOrder === order) status.textContent = "Reading your receipt... " + progress + "%";
      });
      if (pendingPaymentOrder !== order) return;
      if (existing) {
        Object.assign(existing, prepared, {details, state: "ready"});
      } else {
        order.paymentProofs.push({id: PaymentProofReader.randomId(), name: file.name,
          ...prepared, details, state: "ready"});
      }
      renderPaymentProofs(order);
      status.textContent = "Receipt selected. Tap “I Have Paid” to upload and check your payment.";
    }
  } catch (error) {
    if (pendingPaymentOrder === order) status.textContent = error.message || "Please choose a clear receipt screenshot.";
  } finally {
    receiptPreparationInProgress = false;
    input.value = "";
    input.disabled = false;
    button.disabled = false;
    renderPaymentProofs();
  }
};

function showPaymentBalance(data, pending = false) {
  const total = Number(data.orderTotal);
  const paid = Number(data.paidAmount);
  const remaining = Number(data.remainingAmount);
  const extra = Number(data.overAmount);
  const receipt = data.receiptAmount == null ? null : Number(data.receiptAmount);
  const status = document.getElementById("paymentStatus");
  const heading = pending ? "Receipt uploaded — awaiting shop approval" :
    extra > 0 ? "Payment is higher than the order total" : "Incomplete payment";
  let content = "<strong>" + heading + "</strong><div class=\"payment-balance\">" +
    "<span>Order total</span><strong>$" + total.toFixed(2) + "</strong>" +
    "<span>Payment approved by CHAKO LAB</span><strong>" +
    (paid > 0 ? "$" + paid.toFixed(2) : pending ? "Awaiting approval" : "$0.00") + "</strong>";
  if (!pending || paid > 0) {
    content += "<span>Still to pay" + (pending ? " (before pending receipt)" : "") +
      "</span><strong>$" + remaining.toFixed(2) + "</strong>";
  }
  if (extra > 0) content += "<span>Extra paid</span><strong>$" + extra.toFixed(2) + "</strong>";
  if (pending && receipt != null) {
    content += "<span>Uploaded receipts show (unverified)</span><strong>$" + receipt.toFixed(2) + "</strong>";
  }
  content += "</div>";
  if (pending) {
    content += "CHAKO LAB will check the bank payment and confirm it belongs to this order. Uploading a receipt does not approve payment. Please wait for confirmation before paying again.";
  } else if (extra > 0) {
    content += "Please contact CHAKO LAB to arrange the extra amount.";
  } else {
    content += "Please pay the remaining <strong>$" + remaining.toFixed(2) +
      "</strong>, upload the new receipt above, then tap “I Have Paid” again.";
  }
  status.innerHTML = content;
  status.scrollIntoView({behavior: "smooth", block: "nearest"});
  if (!pending && extra === 0) {
    document.getElementById("paymentAmount").textContent = "$" + remaining.toFixed(2);
    document.getElementById("paymentAmountLabel").textContent = "Remaining to pay";
  }
}

async function confirmPaidOrderReceipt(order, extra, statusUrl) {
  await sendWebsiteOrderReceipt(order, extra);
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (pendingPaymentOrder !== order) return false;
    try {
      const response = await fetch(statusUrl + "&receiptCheck=" + Date.now(), {cache: "no-store"});
      if (!response.ok) return false;
      const data = await response.json();
      if (data.apiVersion !== PAYMENT_API_VERSION || data.approvalPolicy !== PAYMENT_APPROVAL_POLICY ||
          data.ok !== true || data.status !== "CONFIRMED" || Number(data.pendingProofs) !== 0 ||
          Math.round(Number(data.orderTotal) * 100) !== Math.round(Number(order.total) * 100) ||
          Math.round(Number(data.paidAmount) * 100) !== Math.round(Number(order.total) * 100)) return false;
      if (data.orderReceiptSent === true) return true;
    } catch (error) { return false; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return false;
}

function paymentProofRejectionMessage(data) {
  const messages = {
    WRONG_RECIPIENT: "This receipt shows payment to a different account. CHAKO LAB's receiving account is 014416627. Please check your receipt and contact the shop before paying again.",
    PAYMENT_INCOMPLETE: "This receipt shows a pending or unsuccessful payment. Please check its status in your bank app and upload the completed receipt. Do not pay again until you have checked.",
    RECEIPT_MISMATCH: "The receipt amount or APV does not match the recorded bank payment. Please upload a clear receipt or contact CHAKO LAB. No payment has been approved from this receipt.",
    PAYMENT_TOO_OLD: "This receipt refers to an older bank payment. Please contact CHAKO LAB to review it before paying again.",
    PAYMENT_VOID: "The recorded bank payment is no longer active. Please contact CHAKO LAB to check it before paying again.",
    MULTIPLE_MATCHES: "This receipt matches conflicting bank records. CHAKO LAB needs to review it. Please contact the shop before paying again.",
    INVALID_PAYMENT: "The bank record could not be verified. Please contact CHAKO LAB before paying again.",
    ORDER_CHANGED: "The payment was recorded for a different order total. Please contact CHAKO LAB before paying again."
  };
  if (data.status === "RECEIPT_REUSED") return "This receipt or bank payment was already used or submitted for another order. Please contact CHAKO LAB before paying again.";
  return messages[data.rejectionReason] || "CHAKO LAB could not approve this receipt. Please contact the shop before paying again.";
}

window.customerPaid = async function() {
  const status = document.getElementById("paymentStatus");
  const button = document.getElementById("paidButton");
  const input = document.getElementById("paymentProofs");
  if (paymentCheckInProgress || receiptPreparationInProgress) return;
  const order = pendingPaymentOrder;
  if (!order) { status.textContent = "Please reopen checkout."; return; }
  if (!order.paymentProofs?.length) {
    status.textContent = "Please upload a screenshot or photo of your payment receipt first.";
    input.focus();
    return;
  }
  const totalCents = Math.round(Number(order.total) * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    status.textContent = "Please reopen checkout to check the order total.";
    return;
  }
  paymentCheckInProgress = true;
  button.disabled = true;
  input.disabled = true;
  renderPaymentProofs(order);
  let latest;
  try {
    status.textContent = "Preparing to upload your payment proof...";
    const versionResponse = await fetch(PAYMENT_CHECK_URL + "?action=paymentVersion&_=" + Date.now(), {cache: "no-store"});
    if (!versionResponse.ok) throw new Error("Payment service unavailable");
    const version = await versionResponse.json();
    if (pendingPaymentOrder !== order) return;
    if (version.ok !== true || version.apiVersion !== PAYMENT_API_VERSION ||
        version.approvalPolicy !== PAYMENT_APPROVAL_POLICY) {
      status.textContent = "Payment checks are paused for an update. Please contact CHAKO LAB to verify your receipt.";
      return;
    }
    for (const proof of order.paymentProofs) {
      if (pendingPaymentOrder !== order) return;
      if (proof.state === "uploaded") continue;
      await fetch(PAYMENT_CHECK_URL + "?action=paymentProof", {
        method: "POST", mode: "no-cors", cache: "no-store",
        headers: {"Content-Type": "text/plain;charset=utf-8"},
        body: JSON.stringify({orderId: order.websiteOrderId, orderNumber: order.orderNumber,
          orderTotal: totalCents / 100, accessToken: order.proofAccessToken,
          customer: {name: order.customer.name, phone: order.customer.phone},
          proof: {id: proof.id, dataUrl: proof.dataUrl, details: proof.details}})
      });
      proof.state = "submitted";
    }
    // no-cors POST responses are opaque. A separate authenticated status
    // read must acknowledge receipt before the interface says "uploaded".
    const started = Date.now();
    while (Date.now() - started < 90000) {
      if (pendingPaymentOrder !== order) return;
      const url = PAYMENT_CHECK_URL + "?action=proofStatus" +
        "&orderId=" + encodeURIComponent(order.websiteOrderId) +
        "&amount=" + encodeURIComponent((totalCents / 100).toFixed(2)) +
        "&proofIds=" + encodeURIComponent(order.paymentProofs.map(proof => proof.id).join(",")) +
        "&accessToken=" + encodeURIComponent(order.proofAccessToken) + "&_=" + Date.now();
      const response = await fetch(url, {cache: "no-store"});
      if (!response.ok) throw new Error("Payment service unavailable");
      const data = await response.json();
      if (pendingPaymentOrder !== order) return;
      if (data.apiVersion !== PAYMENT_API_VERSION || data.approvalPolicy !== PAYMENT_APPROVAL_POLICY) {
        throw new Error("Payment service changed");
      }
      if (data.status === "PROCESSING" && data.ok === true) {
        status.textContent = "Uploading your receipt to CHAKO LAB...";
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      if (["RECEIPT_REUSED", "RECEIPT_REJECTED"].includes(data.status)) {
        const ids = data.rejectedProofIds;
        if (!Array.isArray(ids) || !ids.length || ids.some(id =>
          !order.paymentProofs.some(proof => proof.id === id))) throw new Error("Invalid receipt rejection");
        order.paymentProofs.filter(proof => ids.includes(proof.id)).forEach(proof => {
          proof.state = "rejected";
          delete proof.dataUrl;
        });
        rememberPaymentOrder(order);
        renderPaymentProofs(order);
        status.textContent = paymentProofRejectionMessage(data);
        return;
      }
      if (data.status === "UPLOAD_FAILED") {
        order.paymentProofs.filter(proof => proof.state === "submitted")
          .forEach(proof => { proof.state = "ready"; });
        throw new Error("Receipt upload not acknowledged");
      }
      if (data.ok !== true || data.allProofsUploaded !== true ||
          !["CONFIRMED", "UNDERPAID", "OVERPAID", "WAITING_BANK", "MANUAL_REVIEW"].includes(data.status)) {
        throw new Error("Payment verification failed");
      }
      const paid = Number(data.paidAmount), remaining = Number(data.remainingAmount), extra = Number(data.overAmount);
      const values = [paid, remaining, extra, Number(data.orderTotal)];
      const paidCents = Math.round(paid * 100);
      if (values.some(value => !Number.isFinite(value) || value < 0 ||
          Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) ||
          Math.round(Number(data.orderTotal) * 100) !== totalCents ||
          Math.round(remaining * 100) !== Math.max(0, totalCents - paidCents) ||
          Math.round(extra * 100) !== Math.max(0, paidCents - totalCents) ||
          (data.receiptAmount != null && (!Number.isFinite(Number(data.receiptAmount)) || Number(data.receiptAmount) < 0)) ||
          (data.status === "CONFIRMED" && (paidCents !== totalCents || Number(data.pendingProofs) !== 0)) ||
          (data.status === "UNDERPAID" && (paidCents <= 0 || paidCents >= totalCents)) ||
          (data.status === "OVERPAID" && paidCents <= totalCents)) {
        throw new Error("Invalid payment balance");
      }
      order.paymentProofs.forEach(proof => { proof.state = "uploaded"; delete proof.dataUrl; });
      order.lastVerifiedPayment = {paidAmount: paid, remainingAmount: remaining,
        approvalPolicy: data.approvalPolicy};
      rememberPaymentOrder(order);
      renderPaymentProofs(order);
      latest = data;
      if (data.status === "CONFIRMED") {
        status.textContent = "Payment approved. Confirming your order...";
        const trxId = /^[\d +]+$/.test(String(data.trxId || "")) ? data.trxId : "";
        const apv = /^[\d +]+$/.test(String(data.apv || "")) ? data.apv : "";
        const receiptSent = await confirmPaidOrderReceipt(order,
          {paymentLabel: "ABA / KHQR", paymentStatus: "✅ PAID", trxId, apv,
          paymentProofCount: order.paymentProofs.length}, url);
        if (pendingPaymentOrder !== order) return;
        if (!receiptSent) {
          status.textContent = "Your payment is approved, but the order confirmation has not been delivered yet. Please tap “I Have Paid” again to finish, or contact CHAKO LAB. Do not pay again.";
          return;
        }
        window.confirmCODOrder(order, "ABA / KHQR", "✅ Payment confirmed");
        pendingPaymentOrder = null;
        try { sessionStorage.removeItem(PAYMENT_SESSION_KEY); } catch (error) {}
        return;
      }
      showPaymentBalance(data, ["WAITING_BANK", "MANUAL_REVIEW"].includes(data.status));
      if (data.status !== "WAITING_BANK") return;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    if (latest) showPaymentBalance(latest, true);
    else status.textContent = "We could not confirm the upload yet. Please tap “I Have Paid” again. Your order is still open.";
  } catch (error) {
    console.error("Receipt payment check failed:", error);
    if (pendingPaymentOrder === order) {
      if (latest) showPaymentBalance(latest, true);
      else status.textContent = "We could not confirm your receipt upload or payment yet. Please try again or contact CHAKO LAB. Your order is still open.";
    }
  } finally {
    paymentCheckInProgress = false;
    button.disabled = false;
    input.disabled = false;
    renderPaymentProofs();
  }
};


/* =========================================
   CONFIRM CASH ON DELIVERY
   ========================================= */

window.confirmCODOrder = function(
  order,
  paymentLabel = "Cash on Delivery",
  paymentNote = ""
) {
  document
    .getElementById("paymentModal")
    ?.classList.remove("show");


  document
    .getElementById("successMessage")
    .innerHTML = `

      Your order number is
      <strong>${order.orderNumber}</strong>.

      <br><br>

Payment:
<strong>${paymentLabel}</strong>

${paymentNote
  ? `<br>${paymentNote}`
  : ""
}

      <br><br>

      Total:
      <strong>
        $${Number(order.total).toFixed(2)}
      </strong>

    `;


  document
    .getElementById("successBox")
    .classList.add("show");


  document
    .getElementById("overlay")
    .classList.add("show");


  cart = [];

  saveCart();
};
/* =========================================
   KEEP PAYMENT OPTIONS SYNCED
   ========================================= */

function syncPaymentOptions() {
  const city = document.getElementById("customerCity");

  if (city && city.value) {
    updatePaymentMethods();
  }
}

document.addEventListener(
  "DOMContentLoaded",
  syncPaymentOptions
);

window.addEventListener(
  "pageshow",
  function() {
    setTimeout(syncPaymentOptions, 100);
  }
);


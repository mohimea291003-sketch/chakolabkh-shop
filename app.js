const CHAKO_PRODUCTS =
  window.CHAKO_PRODUCTS || [];

let pendingPaymentOrder = null;

const PAYMENT_CHECK_URL =
  "https://script.google.com/macros/s/AKfycbw0_TGmUmDzA4GkNHeZaVkbKWNRii1REVie_o0zv1Idj8DCAvtx5ITOxLDQ54pdJF3m/exec";

let paymentCheckInProgress = false;

const PAYMENT_API_VERSION = "chako-payment-proof-v4";
const PAYMENT_APPROVAL_POLICY = "staff-reviewed-v1";

function sendWebsiteOrderReceipt(order, extra = {}) {
  if (!order) return;

  const payload = {
    ...order,
    ...extra
  };

  fetch(
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
    "Please use your current location so we can automatically fill your delivery address.";
};


/* =========================================
   GET DELIVERY LOCATION
   ========================================= */

async function findNearbyLandmark(latitude, longitude) {
  try {
    const {
      Place,
      SearchNearbyRankPreference
    } = await google.maps.importLibrary("places");

    const { places } = await Place.searchNearby({
      fields: [
        "displayName",
        "location",
        "primaryType"
      ],

      locationRestriction: {
        center: {
          lat: latitude,
          lng: longitude
        },
        radius: 800
      },

      maxResultCount: 10,

      rankPreference:
        SearchNearbyRankPreference.POPULARITY,

      language: "en",
      region: "KH"
    });

    if (!places || places.length === 0) {
      return "";
    }

    const usablePlace =
      places.find(place =>
        place.displayName &&
        place.displayName.trim() !== ""
      );

    if (!usablePlace) {
      return "";
    }

    return usablePlace.displayName;

  } catch (error) {
    console.error(
      "Nearby landmark search failed:",
      error
    );

    return "";
  }
}
window.getDeliveryLocation = function() {
  const status =
    document.getElementById("deliveryLocationStatus");

  const addressField =
    document.getElementById("customerAddress");

  const latitudeField =
    document.getElementById("customerLatitude");

  const longitudeField =
    document.getElementById("customerLongitude");

  if (!navigator.geolocation) {
    status.textContent =
      "❌ Location is not supported on this device.";
    return;
  }

  status.textContent =
    "📍 Getting your current location...";

  navigator.geolocation.getCurrentPosition(

    async function(position) {

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;

      if (latitudeField) {
        latitudeField.value = latitude;
      }

      if (longitudeField) {
        longitudeField.value = longitude;
      }

      const mapLink =
        "https://www.google.com/maps/search/?api=1&query=" +
        latitude +
        "," +
        longitude;

      status.textContent =
        "📍 Location received. Finding your address...";

      try {

        if (
          !window.google ||
          !google.maps ||
          !google.maps.Geocoder
        ) {
          throw new Error(
            "Google Maps API is not ready."
          );
        }

        const geocoder =
          new google.maps.Geocoder();

        const response =
          await geocoder.geocode({
            location: {
              lat: latitude,
              lng: longitude
            },
            language: "en"
          });

        const results =
          response.results || [];

        /*
          --------------------------------
          HELPERS
          --------------------------------
        */

        const looksLikePlusCode =
          function(text) {

            if (!text) return false;

            return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i
              .test(text.trim());
          };


        const getComponent =
          function(type) {

            for (const result of results) {

              if (!result.address_components) {
                continue;
              }

              const component =
                result.address_components.find(
                  item =>
                    item.types.includes(type)
                );

              if (
                component &&
                component.long_name
              ) {
                return component.long_name;
              }
            }

            return "";
          };


        /*
          --------------------------------
          GET ADDRESS COMPONENTS
          --------------------------------
        */

        const streetNumber =
          getComponent("street_number");

        const route =
          getComponent("route");

        const premise =
          getComponent("premise");

        const subpremise =
          getComponent("subpremise");

        const neighborhood =
          getComponent("neighborhood");

        const sublocality2 =
          getComponent("sublocality_level_2");

        const sublocality1 =
          getComponent("sublocality_level_1");

        const district =
          getComponent(
            "administrative_area_level_2"
          );

        const commune =
          getComponent(
            "administrative_area_level_3"
          );

        const city =
          getComponent("locality") ||
          getComponent(
            "administrative_area_level_1"
          );

        const postalCode =
          getComponent("postal_code");

        const country =
          getComponent("country");


        /*
          --------------------------------
          BUILD HUMAN-FRIENDLY ADDRESS
          --------------------------------
        */

        const addressParts = [];

        const addUnique =
          function(value) {

            if (!value) return;

            if (looksLikePlusCode(value)) {
              return;
            }

            const exists =
              addressParts.some(
                item =>
                  item.toLowerCase() ===
                  value.toLowerCase()
              );

            if (!exists) {
              addressParts.push(value);
            }
          };


        /*
          Prefer:
          House → Street → Sangkat/Commune
          → Khan/District → City → Cambodia
        */

        let streetLine = "";

        if (route) {
  streetLine = route;
}
else if (
  premise &&
  !looksLikePlusCode(premise)
) {
  streetLine = premise;
}

        addUnique(streetLine);

        addUnique(subpremise);

        addUnique(
          commune ||
          sublocality2 ||
          neighborhood
        );

        addUnique(
          district ||
          sublocality1
        );

        addUnique(city);

        addUnique(postalCode);

        addUnique(country);


        /*
          --------------------------------
          FALLBACK:
          LOOK THROUGH ALL GOOGLE RESULTS
          --------------------------------
        */

        let finalAddress =
          addressParts.join(", ");


        /*
          If Google has an actual route
          result, prefer it over generic
          city / plus-code results.
        */

        const routeResult =
          results.find(result => {

            const hasRouteType =
              result.types &&
              result.types.includes("route");

            const readable =
              result.formatted_address &&
              !looksLikePlusCode(
                result.formatted_address
              );

            return hasRouteType && readable;
          });


        const streetResult =
          results.find(result => {

            const isStreet =
              result.types &&
              result.types.includes(
                "street_address"
              );

            const readable =
              result.formatted_address &&
              !looksLikePlusCode(
                result.formatted_address
              );

            return isStreet && readable;
          });


        /*
          If our constructed result
          has no street, prefer Google's
          street / route result.
        */

        if (!route) {

          if (streetResult) {
            finalAddress =
              streetResult.formatted_address;
          }
          else if (routeResult) {
            finalAddress =
              routeResult.formatted_address;
          }
          else {

            const readableResult =
              results.find(result => {

                if (
                  !result.formatted_address
                ) {
                  return false;
                }

                if (
                  looksLikePlusCode(
                    result.formatted_address
                  )
                ) {
                  return false;
                }

                if (
                  result.types &&
                  result.types.includes(
                    "plus_code"
                  )
                ) {
                  return false;
                }

                return true;
              });

            if (readableResult) {
              finalAddress =
                readableResult
                  .formatted_address;
            }
          }
        }


        /*
          --------------------------------
          FILL DELIVERY ADDRESS
          --------------------------------
        */

if (
  addressField &&
  finalAddress
) {

  const landmark =
    await findNearbyLandmark(
      latitude,
      longitude
    );

  const houseNumber =
    "House No: [Please enter], ";

  if (landmark) {

    addressField.value =
      houseNumber +
      finalAddress +
" — " +
landmark;

  } else {

    addressField.value =
      houseNumber +
      finalAddress;
  }
}

        /*
          --------------------------------
          SUCCESS MESSAGE
          --------------------------------
        */

        const foundStreet =
          Boolean(route);

        status.innerHTML = `
          <div style="
            margin-top:8px;
          ">
            ✅ Location received${
              finalAddress
                ? " and address filled automatically."
                : "."
            }
          </div>

          <a
            href="${mapLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              display:block;
              margin-top:10px;
              padding:12px 14px;
              background:#f3f3f3;
              color:#171717;
              border:1px solid #dddddd;
              border-radius:10px;
              font-weight:700;
              text-align:center;
              text-decoration:none;
            "
          >
            📍 View My Location on Map
          </a>

          <div style="
            margin-top:8px;
            font-size:12px;
            color:#777;
          ">
            ${
              foundStreet
                ? "Please check the delivery address and edit it if needed."
                : "Google found your area but could not confirm the exact street. Please add your house or street details if needed."
            }
          </div>
        `;


        /*
          Useful only for debugging.
          Does not affect customer.
        */

        console.log(
          "Google reverse geocoding results:",
          results
        );

        console.log(
          "Detected road:",
          route
        );

        console.log(
          "Final delivery address:",
          finalAddress
        );

      }

      catch (error) {

        console.error(
          "Google address error:",
          error
        );

        status.innerHTML = `
          <div style="margin-top:8px;">
            ✅ Delivery location received.
          </div>

          <a
            href="${mapLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              display:block;
              margin-top:10px;
              padding:12px 14px;
              background:#f3f3f3;
              color:#171717;
              border:1px solid #dddddd;
              border-radius:10px;
              font-weight:700;
              text-align:center;
              text-decoration:none;
            "
          >
            📍 View My Location on Map
          </a>

          <div style="
            margin-top:8px;
            font-size:12px;
            color:#777;
          ">
            We received your exact map location,
            but Google could not create the written address.
            Please enter the delivery address manually.
          </div>
        `;
      }
    },

    function(error) {

      console.error(
        "Location error:",
        error
      );

      status.textContent =
        "❌ Please allow location access and try again.";
    },

    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    }
  );
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
  return JSON.stringify([order.total, order.items, order.customer]);
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
      if (saved?.checkoutKey === paymentCheckoutKey(order)) previous = saved;
    } catch (error) {}
  }
  if (previous && (previous.checkoutKey === paymentCheckoutKey(order) ||
      paymentCheckoutKey(previous) === paymentCheckoutKey(order))) {
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
    detail.textContent = proof.state === "uploaded" ? "Uploaded to CHAKO LAB" :
      proof.details?.amount != null ? "Receipt shows $" + Number(proof.details.amount).toFixed(2) + " · ready to upload" :
      "Ready to upload · shop can review this receipt";
    description.append(name, detail);
    item.appendChild(description);
    if (proof.state === "ready") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "payment-proof-remove";
      remove.textContent = "Remove";
      remove.disabled = paymentCheckInProgress || receiptPreparationInProgress;
      remove.addEventListener("click", () => {
        if (paymentCheckInProgress || receiptPreparationInProgress) return;
        order.paymentProofs = order.paymentProofs.filter(saved => saved !== proof);
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
        status.textContent = "Payment confirmed!";
        const trxId = /^[\d +]+$/.test(String(data.trxId || "")) ? data.trxId : "";
        const apv = /^[\d +]+$/.test(String(data.apv || "")) ? data.apv : "";
        sendWebsiteOrderReceipt(order, {paymentLabel: "ABA / KHQR", paymentStatus: "✅ PAID", trxId, apv,
          paymentProofCount: order.paymentProofs.length});
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


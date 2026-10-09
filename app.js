const CHAKO_PRODUCTS =
  window.CHAKO_PRODUCTS || [];

let pendingPaymentOrder = null;


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

window.getDeliveryLocation = function() {
  const status =
    document.getElementById("deliveryLocationStatus");

  const addressField =
    document.getElementById("customerAddress");

  if (!navigator.geolocation) {
    status.textContent =
      "Location is not supported on this device.";
    return;
  }

  status.textContent =
    "Getting your current location...";

  navigator.geolocation.getCurrentPosition(

    async function(position) {
      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;

      document.getElementById(
        "customerLatitude"
      ).value = latitude;

      document.getElementById(
        "customerLongitude"
      ).value = longitude;

      const mapLink =
        "https://www.google.com/maps?q=" +
        latitude +
        "," +
        longitude;

      status.textContent =
        "Location received. Finding your address...";

      try {
        const geocoder =
          new google.maps.Geocoder();

        const response =
          await geocoder.geocode({
            location: {
              lat: latitude,
              lng: longitude
            }
          });

const results =
  response.results || [];

if (results.length > 0 && addressField) {

  const bestResult =
    results.find(result =>
      result.types.includes("street_address")
    ) ||
    results.find(result =>
      result.types.includes("premise")
    ) ||
    results.find(result =>
      result.types.includes("route")
    ) ||
    results.find(result =>
      !result.types.includes("plus_code")
    ) ||
    results[0];

  addressField.value =
    bestResult.formatted_address;
}

        status.innerHTML = `
          <div style="margin-top:8px;">
            ✅ Location received and address filled automatically.
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

          <div
            style="
              margin-top:8px;
              font-size:12px;
              color:#777;
            "
          >
            Please check the delivery address and edit it if needed.
          </div>
        `;

      } catch (error) {
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

          <div
            style="
              margin-top:8px;
              font-size:12px;
              color:#777;
            "
          >
            We could not find the written address automatically.
            Please enter your delivery address below.
          </div>
        `;
      }
    },

    function() {
      status.textContent =
        "❌ Please allow location access and try again.";
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
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

    confirmCODOrder(order);

    return;
  }


  /* =========================================
     ABA / KHQR
     ========================================= */

  pendingPaymentOrder = order;


  document.getElementById(
    "paymentAmount"
  ).textContent =
    "$" +
    Number(order.total).toFixed(2);


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

window.customerPaid = function() {

  const status =
    document.getElementById(
      "paymentStatus"
    );


  status.textContent =
    "⏳ Checking your ABA payment...";


  /*
    Later we connect this to Telegram
    payment verification.

    This button alone NEVER marks
    the order as paid.
  */
};


/* =========================================
   CONFIRM CASH ON DELIVERY
   ========================================= */

window.confirmCODOrder = function(order) {

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
      <strong>Cash on Delivery</strong>

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

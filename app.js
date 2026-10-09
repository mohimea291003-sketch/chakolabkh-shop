const CHAKO_PRODUCTS =
  window.CHAKO_PRODUCTS || [];

const GEOAPIFY_API_KEY = "f2a3e19fd13b4784bd79b7d5921df381";

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
    "Getting your location and address...";

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

      try {
        const params = new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
          format: "json",
          apiKey: GEOAPIFY_API_KEY
        });

        const response = await fetch(
          "https://api.geoapify.com/v1/geocode/reverse?" +
          params.toString()
        );

        if (!response.ok) {
          throw new Error("Geoapify request failed");
        }

        const data = await response.json();

        const result =
          data.results && data.results.length > 0
            ? data.results[0]
            : null;

        if (result) {

          const cleanAddress =
  result.formatted ||
  [result.address_line1, result.address_line2]
    .filter(Boolean)
    .join(", ");

if (cleanAddress) {
  addressField.value = cleanAddress;
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

        } else {

          status.innerHTML = `
            ✅ Location received.<br>
            Address could not be found automatically.
            Please enter the delivery address manually.

            <br><br>

            <a
              href="${mapLink}"
              target="_blank"
              rel="noopener noreferrer"
            >
              📍 View My Location on Map
            </a>
          `;
        }

      } catch (error) {

        console.error(error);

        status.innerHTML = `
          ✅ Location received.<br>
          Automatic address lookup failed.
          Please enter your address manually.

          <br><br>

          <a
            href="${mapLink}"
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 View My Location on Map
          </a>
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

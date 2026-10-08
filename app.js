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

  const city =
    document.getElementById("customerCity")?.value;

  const payment =
    document.getElementById("paymentMethod")?.value;

  const box =
    document.getElementById("codLocationGroup");

  if (!box) return;


  if (
    city === "Phnom Penh" &&
    payment === "Cash on Delivery"
  ) {

    box.style.display = "block";

  } else {

    box.style.display = "none";

    document.getElementById(
      "customerLatitude"
    ).value = "";

    document.getElementById(
      "customerLongitude"
    ).value = "";

    document.getElementById(
      "deliveryLocationStatus"
    ).textContent = "";
  }
};


/* =========================================
   GET DELIVERY LOCATION
   ========================================= */

window.getDeliveryLocation = function() {

  const status =
    document.getElementById(
      "deliveryLocationStatus"
    );


  if (!navigator.geolocation) {

    status.textContent =
      "Location is not supported on this device.";

    return;
  }


  status.textContent =
    "Getting your location...";


  navigator.geolocation.getCurrentPosition(

    function(position) {

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


      status.textContent =
        "✅ Delivery location received.";

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

  /* CASH ON DELIVERY */

  if (
    order.paymentMethod ===
    "Cash on Delivery"
  ) {

    const latitude =
      document.getElementById(
        "customerLatitude"
      ).value;

    const longitude =
      document.getElementById(
        "customerLongitude"
      ).value;


    if (!latitude || !longitude) {

      alert(
        "Please share your delivery location before confirming a Cash on Delivery order."
      );

      return;
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


    confirmCODOrder(order);

    return;
  }


  /* ABA / KHQR */

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

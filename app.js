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

        if (streetNumber && route) {
          streetLine =
            streetNumber + ", " + route;
        }
        else if (route) {
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
          addressField.value =
            finalAddress;
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

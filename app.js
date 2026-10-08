const CHAKO_PRODUCTS = window.CHAKO_PRODUCTS || [];


let pendingPaymentOrder = null;

window.openPaymentModal = function(order) {
  pendingPaymentOrder = order;

  document.getElementById("paymentAmount").textContent =
    "$" + Number(order.total).toFixed(2);

  document.getElementById("paymentStatus").textContent = "";

  document
    .getElementById("paymentModal")
    .classList.add("show");

  document
    .getElementById("overlay")
    .classList.add("show");
};


window.closePaymentModal = function() {
  document
    .getElementById("paymentModal")
    .classList.remove("show");

  document
    .getElementById("overlay")
    .classList.remove("show");
};


window.customerPaid = function() {
  const status =
    document.getElementById("paymentStatus");

  status.textContent =
    "Checking your payment... Please wait.";

  /*
    Later this button will ask our secure backend
    to check the genuine ABA payment notification
    from Telegram.

    IMPORTANT:
    Clicking "I Have Paid" will NOT automatically
    mark the order as paid.
  */
};

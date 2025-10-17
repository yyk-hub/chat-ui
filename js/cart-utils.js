// js/cart-utils.js
function updateCartCount() {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  let count = cart.reduce((sum, item) => sum + item.qty, 0);
  let countElement = document.getElementById("cart-count");
  if (countElement) countElement.textContent = count;
}

// Auto-run when page loads
document.addEventListener("DOMContentLoaded", updateCartCount);

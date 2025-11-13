// pi-payment.js - Pi Payment Integration
// Replace the standard checkout payment flow

const PiPayment = {
  // Convert RM to Pi (you set your own rate)
  exchangeRate: 2.0, // 1 Pi = RM 2.00 (adjust as needed)

  // Convert RM price to Pi
  rmToPi(rmAmount) {
    return (rmAmount / this.exchangeRate).toFixed(2);
  },

  // Create Pi payment
  async createPayment(orderData) {
    try {
      const piAmount = this.rmToPi(orderData.total_amt);
      
      // Create payment with Pi SDK
      const paymentData = {
        amount: parseFloat(piAmount),
        memo: `Order ${orderData.order_id}`,
        metadata: {
          order_id: orderData.order_id,
          products: orderData.prod_name,
          customer: orderData.cus_name,
          phone: orderData.phone,
          rm_amount: orderData.total_amt
        }
      };

      const payment = await Pi.createPayment(paymentData, {
        onReadyForServerApproval: (paymentId) => {
          console.log('Payment ready for approval:', paymentId);
          // Send to backend for approval
          return this.approvePaymentOnBackend(paymentId, orderData);
        },
        onReadyForServerCompletion: (paymentId, txid) => {
          console.log('Payment ready for completion:', paymentId, txid);
          // Complete payment on backend
          return this.completePaymentOnBackend(paymentId, txid, orderData);
        },
        onCancel: (paymentId) => {
          console.log('Payment cancelled:', paymentId);
          alert('Payment cancelled. Your order is saved.');
        },
        onError: (error, payment) => {
          console.error('Payment error:', error);
          alert('Payment failed: ' + error.message);
        }
      });

      return payment;

    } catch (error) {
      console.error('Create payment failed:', error);
      throw error;
    }
  },

  // Backend approval (called by Pi SDK)
  async approvePaymentOnBackend(paymentId, orderData) {
    try {
      const response = await fetch('/api/pi/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          order_id: orderData.order_id
        })
      });

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('Backend approval failed:', error);
      throw error;
    }
  },

  // Complete payment on backend
  async completePaymentOnBackend(paymentId, txid, orderData) {
    try {
      const response = await fetch('/api/pi/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          txid: txid,
          order_id: orderData.order_id
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Update order status in D1
        await this.updateOrderStatus(orderData.order_id, 'Paid', txid);
        alert('✅ Payment successful! Order confirmed.');
      }

      return result;

    } catch (error) {
      console.error('Backend completion failed:', error);
      throw error;
    }
  },

  // Update order in D1
  async updateOrderStatus(orderId, status, txid) {
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_status: status,
          pi_txid: txid,
          pymt_method: 'Pi Network'
        })
      });
    } catch (error) {
      console.error('Update order failed:', error);
    }
  }
};

// Modified checkout flow for Pi
async function confirmOrderWithPi() {
  const btn = document.getElementById("confirmBtn");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.innerText = "Processing...";

  // Get order details (same as before)
  const name = document.getElementById("custName").value.trim();
  const phone = document.getElementById("custPhone").value.trim();
  const address = document.getElementById("custAddress").value.trim();
  const postcode = document.getElementById("custPostcode").value.trim();
  const state_to = document.getElementById("custState").value;
  const method = document.getElementById("shippingMethod").value;

  if (!name || !phone || !address || !postcode || !state_to) {
    alert("Please fill in all delivery details.");
    btn.disabled = false;
    btn.innerText = "✅ Confirm Order";
    return;
  }

  // Validate authentication
  if (!PiAuth.isAuthenticated()) {
    alert("Please authenticate with Pi Network first.");
    btn.disabled = false;
    btn.innerText = "✅ Confirm Order";
    return;
  }

  const cart = JSON.parse(localStorage.getItem("cartItems")) || [];
  if (!cart.length) {
    alert("Cart is empty!");
    btn.disabled = false;
    btn.innerText = "✅ Confirm Order";
    return;
  }

  // Calculate totals
  const subTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalWeight = cart.reduce((sum, item) => sum + ((item.weight || 0) * item.qty), 0);
  const shippingCalc = calculateShippingCost(subTotal, state_to, totalWeight, method);
  const totalAmt = subTotal + shippingCalc.cost;
  const order_id = "ORD" + Date.now();

  const orderData = {
    order_id,
    cus_name: name,
    cus_address: address,
    postcode,
    state_to,
    country: "Malaysia",
    phone,
    prod_name: cart.map(i => i.name).join(", "),
    quantity: cart.reduce((s, i) => s + i.qty, 0),
    total_amt: totalAmt,
    shipping_wt: totalWeight,
    shipping_cost: shippingCalc.cost,
    shipping_method: method === "pickup" ? "Self Pickup" : 
                     method === "express" ? "Express Free" : "Standard Courier",
    delivery_eta: shippingCalc.eta,
    pymt_method: "Pi Network",
    order_status: "Pending Payment",
    courier_name: method === "pickup" ? "Self Pickup" : "City-Link",
    tracking_link: ""
  };

  try {
    // 1. Save order to D1 (as Pending Payment)
    const res = await fetch(`/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed");

    // 2. Show Pi amount
    const piAmount = PiPayment.rmToPi(totalAmt);
    const confirmed = confirm(
      `Order Total: RM ${totalAmt.toFixed(2)}\n` +
      `Pi Amount: π ${piAmount}\n\n` +
      `Proceed with Pi payment?`
    );

    if (!confirmed) {
      btn.disabled = false;
      btn.innerText = "✅ Confirm Order";
      return;
    }

    // 3. Create Pi payment
    btn.innerText = "Opening Pi Wallet...";
    await PiPayment.createPayment(orderData);

    // 4. Success - clear cart
    localStorage.removeItem("cartItems");
    alert("✅ Order placed! Payment processing with Pi Network.");
    
    // Refresh or redirect
    window.location.href = "order.html";

  } catch (err) {
    alert("Failed: " + err.message);
    btn.disabled = false;
    btn.innerText = "✅ Confirm Order";
  }
}

// Expose globally
window.PiPayment = PiPayment;
window.confirmOrderWithPi = confirmOrderWithPi;

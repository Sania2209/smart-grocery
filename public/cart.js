import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, getDocs, doc, updateDoc, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    const cartContainer = document.getElementById("cart-items");
    if (!user) {
      cartContainer.innerHTML = '<p>Please log in to view your cart.</p>';
      return;
    }
    await renderCartFromFirestore(user.uid);
  });
});

async function renderCartFromFirestore(userId) {
  const cartContainer = document.getElementById("cart-items");
  const compareTbody = document.getElementById("compare-tbody");
  const bestStoreEl = document.getElementById("best-store");

  if (!cartContainer) return;
  cartContainer.innerHTML = "<p>Loading cart...</p>";

  try {
    const snap = await getDocs(collection(db, "users", userId, "cart"));
    if (snap.empty) {
      cartContainer.innerHTML = "<p>Your cart is empty.</p>";
      if (compareTbody) compareTbody.innerHTML = "";
      if (bestStoreEl) bestStoreEl.textContent = "";
      return;
    }

    const storeGroups = {};
    const requiredProducts = new Set();
    snap.forEach((d) => {
      const it = { id: d.id, ...d.data() };
      const storeName = it.store || "Unknown Store";
      if (it.name) requiredProducts.add(it.name);
      if (!storeGroups[storeName]) storeGroups[storeName] = [];
      storeGroups[storeName].push({
        id: it.id,
        name: it.name,
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
      });
    });

    cartContainer.innerHTML = "";
    const compareRows = [];

    const storeToSection = {};
    for (const [store, items] of Object.entries(storeGroups)) {
      const storeTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const namesInStore = new Set(items.map(i => i.name));
      const isComplete = Array.from(requiredProducts).every((p) => namesInStore.has(p));

      const section = document.createElement("div");
      section.className = "store-section";
      section.innerHTML = `
        <h3>${store} ${isComplete ? '' : '<span style="color:#b71c1c;font-size:12px;margin-left:8px;">(missing items)</span>'}</h3>
        <table class="cart-table">
          <thead>
            <tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${items
              .map(
                (i) => `
                  <tr>
                    <td>${i.name}</td>
                    <td>
                      <button class="qty-btn" data-action="dec" data-id="${i.id}">-</button>
                      <span style="margin:0 8px;">${i.quantity}</span>
                      <button class="qty-btn" data-action="inc" data-id="${i.id}">+</button>
                    </td>
                    <td>₹${i.price}</td>
                    <td>₹${i.price * i.quantity}</td>
                    <td><button class="remove-btn" data-id="${i.id}">Remove</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:bold;">Store Total:</td>
              <td style="font-weight:bold;">₹${storeTotal}</td>
            </tr>
          </tfoot>
        </table>
      `;

      if (!isComplete) {
        section.style.border = "1px solid #f5c6cb";
        section.style.background = "#fff5f5";
      }
      cartContainer.appendChild(section);
      storeToSection[store] = section;
      compareRows.push({ store, total: storeTotal, complete: isComplete });
    }

    // Bind qty and remove buttons
    cartContainer.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        await updateCartQuantity(userId, id, action === 'inc' ? 1 : -1);
        await renderCartFromFirestore(userId);
      });
    });
    cartContainer.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await removeCartItem(userId, id);
        await renderCartFromFirestore(userId);
      });
    });

    // consider only complete stores for best-choice
    const completeRows = compareRows.filter(r => r.complete);
    const lowestTotal = completeRows.length ? Math.min(...completeRows.map(r => r.total)) : Infinity;
    const cheapestStores = completeRows.filter(r => r.total === lowestTotal).map(r => r.store);

    if (compareTbody) {
      const sorted = compareRows.sort((a, b) => a.total - b.total);
      compareTbody.innerHTML = sorted
        .map((r) => `
          <tr class="${r.complete && r.total === lowestTotal ? "best" : (!r.complete ? "missing" : "")}">
            <td>${r.store} ${r.complete ? "" : "(missing)"}</td>
            <td>${r.total === Infinity ? "—" : `₹${r.total}`}</td>
          </tr>
        `)
        .join("");
    }

    if (bestStoreEl) {
      if (cheapestStores.length) {
        bestStoreEl.textContent = `Cheapest Store(s): ${cheapestStores.join(", ")} (₹${lowestTotal})`;
        bestStoreEl.style.color = "green";
        bestStoreEl.style.fontWeight = "bold";
        cheapestStores.forEach((s) => {
          const sec = storeToSection[s];
          if (sec) sec.classList.add('best');
        });
      } else {
        bestStoreEl.textContent = "No store has all items. Partial stores shown in red.";
        bestStoreEl.style.color = "#b71c1c";
        bestStoreEl.style.fontWeight = "bold";
      }
    }
  } catch (error) {
    console.error("Error rendering cart:", error);
    cartContainer.innerHTML = `<p>Error loading cart: ${error.message}</p>`;
  }
}

async function updateCartQuantity(userId, docId, delta) {
  try {
    const ref = doc(db, "users", userId, "cart", docId);
    if (delta > 0) {
      await updateDoc(ref, { quantity: increment(1) });
      return;
    }
    // For decrement, read current quantity to decide delete vs decrement
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    const snap = await getDoc(ref);
    const q = Number(snap.data()?.quantity) || 1;
    if (q <= 1) {
      await deleteDoc(ref);
    } else {
      await updateDoc(ref, { quantity: increment(-1) });
    }
  } catch (e) {
    console.error("updateCartQuantity failed", e);
    alert("Failed to update quantity. Please try again.");
  }
}

async function removeCartItem(userId, docId) {
  try {
    const ref = doc(db, "users", userId, "cart", docId);
    await deleteDoc(ref);
  } catch (e) {
    console.error("removeCartItem failed", e);
    alert("Failed to remove item. Please try again.");
  }
}

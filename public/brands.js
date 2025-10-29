import { auth } from "./firebase.js";
import { db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, increment, collection } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Get product from URL parameters
function getProductFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("product") || "Wheat Flour";
}

// Load brands for the selected product from Firebase
async function loadBrands() {
  const product = getProductFromURL();

  document.getElementById("product-name").textContent = product;
  document.getElementById("brands-title").textContent = `${product} Brands`;
  document.getElementById("brands-description").textContent = `Choose from different brands of ${product.toLowerCase()}`;

  const brandsGrid = document.getElementById("brands-grid");
  brandsGrid.innerHTML = '<div class="loading">Loading brands...</div>';

  try {
    const { db } = await import("./firebase.js");
    const { collection, getDocs, query, where } = await import(
      "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
    );

    const productsQuery = query(collection(db, "products"), where("name", "==", product));
    const productsSnap = await getDocs(productsQuery);

    if (productsSnap.empty) {
      brandsGrid.innerHTML = `<div class="no-brands"><h3>No product found named ${product}</h3></div>`;
      return;
    }

    const productDoc = productsSnap.docs[0];
    const brandsSnap = await getDocs(collection(db, "products", productDoc.id, "brands"));

    if (brandsSnap.empty) {
      brandsGrid.innerHTML = `<div class="no-brands"><h3>No brands found for ${product}</h3></div>`;
      return;
    }

    brandsGrid.innerHTML = "";
    const viewOnly = sessionStorage.getItem("viewMode") === "brands";

    for (const bDoc of brandsSnap.docs) {
      const baseBrand = { id: bDoc.id, ...bDoc.data() };
      // fetch stores subcollection for this brand
      const storesSnap = await getDocs(collection(db, "products", productDoc.id, "brands", bDoc.id, "stores"));
      const stores = {};
      storesSnap.forEach((sDoc) => {
        const s = sDoc.data();
        if (s && s.name) stores[s.name] = Number(s.price) || 0;
      });
      const brand = { ...baseBrand, stores };
      const brandCard = document.createElement("div");
      brandCard.className = "brand-card";

      let storesHTML = "";
      if (brand.stores && Object.keys(brand.stores).length) {
        for (const [store, price] of Object.entries(brand.stores)) {
          storesHTML += `
            <div class="store-item">
              <span>${store}</span>
              <strong>₹${price}</strong>
            </div>
          `;
        }
      }

      brandCard.innerHTML = `
        <div class="brand-image">
          ${brand.image
            ? `<img src="${brand.image}" alt="${brand.name}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;">`
            : "📦"}
        </div>

        <h3>${brand.name}</h3>

        ${
          viewOnly
            ? ""
            : `
          <div class="brand-stores">
            ${storesHTML || "<p>No store data</p>"}
          </div>
        `
        }

        <div class="brand-actions">
          <input type="number" min="1" value="1" class="quantity-input" />
          <button class="btn solid add-to-cart-btn" data-brand='${JSON.stringify(brand)}'>Add to Cart</button>
        </div>
      `;

      const addBtn = brandCard.querySelector(".add-to-cart-btn");
      const qtyInput = brandCard.querySelector(".quantity-input");

      addBtn.addEventListener("click", () => {
        const quantity = parseInt(qtyInput.value) || 1;
        addToCart(brand, quantity);
      });

      brandsGrid.appendChild(brandCard);
    }
  } catch (error) {
    console.error("Error loading brands:", error);
    brandsGrid.innerHTML = `
      <div class="error">
        <h3>Error loading brands</h3>
        <p>${error.message}</p>
        <button class="btn solid" onclick="loadBrands()">Retry</button>
      </div>
    `;
  }
}

// Add product to localStorage
function addToCart(brand, quantity) {
  const user = auth.currentUser;
  if (!user) {
    alert("Please log in to add items to cart.");
    window.location.href = "login.html";
    return;
  }

  // Add this brand for ALL stores so user can compare each store in cart
  (async () => {
    const ops = [];
    const entries = brand.stores && typeof brand.stores === "object"
      ? Object.entries(brand.stores).map(([s, p]) => [s, Number(String(p).replace(/[^0-9.]/g, "")) || 0])
      : [];

    if (entries.length) {
      for (const [storeName, price] of entries) {
        const cartDocId = `${brand.name}-${storeName}`.replace(/\s+/g, "-").toLowerCase();
        const ref = doc(db, "users", user.uid, "cart", cartDocId);
        const snap = await getDoc(ref);
        if (snap.exists()) ops.push(updateDoc(ref, { quantity: increment(quantity) }));
        else ops.push(setDoc(ref, { name: brand.name, price, store: storeName, quantity, addedAt: new Date() }));
      }
    } else {
      // Fallback: no per-store data; add a single row
      const storeName = "Not Applicable";
      const price = Number(brand.price) || 0;
      const cartDocId = `${brand.name}-${storeName}`.replace(/\s+/g, "-").toLowerCase();
      const ref = doc(db, "users", user.uid, "cart", cartDocId);
      const snap = await getDoc(ref);
      if (snap.exists()) ops.push(updateDoc(ref, { quantity: increment(quantity) }));
      else ops.push(setDoc(ref, { name: brand.name, price, store: storeName, quantity, addedAt: new Date() }));
    }

    await Promise.all(ops);
    alert(`${brand.name} x${quantity} added for all stores!`);
    refreshCartWidget();
  })().catch((e) => {
    console.error("addToCart failed", e);
    alert("Failed to add to cart. Please try again.");
  });
}

// Refresh small cart widget
function refreshCartWidget() {
  const cartCountEl = document.getElementById("cart-count");
  const cartItemsMini = document.getElementById("cart-items-mini");

  if (!cartCountEl || !cartItemsMini) return;

  const user = auth.currentUser;
  if (!user) {
    cartCountEl.textContent = "0";
    cartItemsMini.innerHTML = '<div class="meta">Please log in</div>';
    return;
  }

  import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js").then(async ({ getDocs, collection }) => {
    const snap = await getDocs(collection(db, "users", user.uid, "cart"));
    const nameToAggregate = new Map();
    snap.forEach((d) => {
      const it = d.data();
      const name = it.name || "";
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const prev = nameToAggregate.get(name);
      if (!prev) nameToAggregate.set(name, { qty, price });
      else nameToAggregate.set(name, { qty: Math.max(prev.qty, qty), price });
    });

    const aggregated = Array.from(nameToAggregate.entries()).map(([name, v]) => ({ name, quantity: v.qty, price: v.price }));
    const totalDistinct = aggregated.reduce((s, a) => s + (Number(a.quantity) || 1), 0);

    cartCountEl.textContent = String(totalDistinct);
    cartItemsMini.innerHTML = aggregated.length ? "" : '<div class="meta">Your cart is empty</div>';
    aggregated.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      const qty = Number(item.quantity) || 1;
      const price = `₹${Number(item.price) || 0}`;
      row.innerHTML = `<span>${item.name} × ${qty}</span><strong>${price}</strong>`;
      cartItemsMini.appendChild(row);
    });
  });
}

function setupCartToggle() {
  const cartToggle = document.getElementById("cart-toggle");
  const cartPanel = document.getElementById("cart-panel");

  if (cartToggle && cartPanel) {
    cartToggle.addEventListener("click", () => {
      const isHidden = cartPanel.hasAttribute("hidden");
      if (isHidden) {
        refreshCartWidget();
        cartPanel.removeAttribute("hidden");
      } else {
        cartPanel.setAttribute("hidden", "");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadBrands();
  setupCartToggle();
  refreshCartWidget();
});

onAuthStateChanged(auth, () => {
  // Handle auth state changes if needed
});

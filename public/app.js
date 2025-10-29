import { auth } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------------- AUTH ----------------
const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
      alert("Logged out!");
      window.location.href = "login.html";
    });
  });
}

// Observe auth and update navbar auth UI
onAuthStateChanged(auth, (user) => {
  const authActions = document.getElementById("auth-actions");
  if (!authActions) return;
  if (user) {
    authActions.innerHTML = `
      <a href="profile.html" class="avatar-btn" title="Profile">👤</a>
    `;
  } else {
    authActions.innerHTML = `
      <button class="btn solid" id="login-nav-btn">Login</button>
    `;
    const btn = document.getElementById("login-nav-btn");
    if (btn) btn.addEventListener("click", () => (window.location.href = "login.html"));
  }
});

// ---------------- DOM ELEMENTS ----------------
const productCardsGrid = document.getElementById('product-cards-grid');
const productCardsTitle = document.getElementById('product-cards-title');
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");

// ---------------- LOAD PRODUCTS ----------------
async function loadProducts(limit = 20) {
  if (!productCardsGrid) return;
  productCardsTitle.textContent = 'All Products';
  productCardsGrid.innerHTML = '';

  try {
    const snapshot = await getDocs(collection(db, 'products'));
    if (snapshot.empty) {
      productCardsGrid.innerHTML = `<div class="card"><div class="meta">No products found. Add some via admin.</div></div>`;
      return;
    }

    let count = 0;
    snapshot.forEach(d => {
      if (count >= limit) return;
      const p = d.data();
      renderProductCard(productCardsGrid, { id: d.id, ...p });
      count++;
    });
  } catch (err) {
    console.error('Failed to load products:', err);
    productCardsGrid.innerHTML = `<div class="card"><div class="meta">Error: ${err.message}</div></div>`;
  }
}

// ---------------- RENDER CARD ----------------
function renderProductCard(container, item) {
  const div = document.createElement('div');
  div.className = 'product-card';

  const img = item.image || ''; // matches admin.js field
  const image = img ? `<img src="${img}" alt="${item.name}" style="width:100%;height:140px;object-fit:cover;border-radius:12px;">` : '';

  div.innerHTML = `
    ${image}
    <h3>${item.name}</h3>
    <div class="meta">${item.category || ''}</div>
    <button class="btn solid view-brands-btn" data-product="${item.id}">View Brands</button>
  `;

  // View brands → redirect
  // New → opens view-only mode
div.querySelector('.view-brands-btn').addEventListener('click', () => {
  window.location.href = `brands.html?product=${encodeURIComponent(item.name)}&view=brands`;
});


  container.appendChild(div);
}

// ---------------- CATEGORY ----------------
async function loadCategory(category) {
  if (!productCardsGrid) return;
  productCardsTitle.textContent = `${category} Products`;
  productCardsGrid.innerHTML = '';

  try {
    const qy = query(collection(db, 'products'), where('category', '==', category));
    const snapshot = await getDocs(qy);
    if (snapshot.empty) {
      productCardsGrid.innerHTML = `<div class="card"><div class="meta">No items in ${category} yet.</div></div>`;
      return;
    }
    snapshot.forEach(d => renderProductCard(productCardsGrid, { id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Failed to load category:", err);
    productCardsGrid.innerHTML = `<div class="card"><div class="meta">Error: ${err.message}</div></div>`;
  }
}

function setupCategoryClicks() {
  document.querySelectorAll('.category').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.textContent.trim();

      document.querySelectorAll('.category').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      loadCategory(category);
    });
  });
}

// ---------------- SEARCH ----------------
async function runSearch() {
  const term = (searchInput?.value || '').trim().toLowerCase();
  if (!productCardsGrid) return;
  if (!term) { await loadProducts(); return; }

  productCardsGrid.innerHTML = '';
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    let found = 0;
    snapshot.forEach(d => {
      const p = { id: d.id, ...d.data() };
      const hay = `${p.name || ''} ${p.category || ''}`.toLowerCase();
      if (hay.includes(term)) {
        renderProductCard(productCardsGrid, p);
        found++;
      }
    });
    if (!found) productCardsGrid.innerHTML = `<div class="card"><div class="meta">No results for "${term}"</div></div>`;
  } catch (err) {
    console.error("Search failed:", err);
    productCardsGrid.innerHTML = `<div class="card"><div class="meta">Error: ${err.message}</div></div>`;
  }
}

if (searchButton) searchButton.addEventListener('click', runSearch);
if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

// ---------------- INIT ----------------
setupCategoryClicks();
loadProducts();

// ---------------- CART WIDGET (HOME PAGE) ----------------
function refreshCartWidget() {
  const cartCountEl = document.getElementById("cart-count");
  const cartItemsMini = document.getElementById("cart-items-mini");

  if (!cartCountEl || !cartItemsMini) return;

  import('./firebase.js').then(async ({ auth, db }) => {
    const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
    const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        cartCountEl.textContent = "0";
        cartItemsMini.innerHTML = '<div class="meta">Please log in</div>';
        return;
      }
      const snap = await getDocs(collection(db, "users", user.uid, "cart"));
      // aggregate by product name across stores so one brand counts once
      const nameToAggregate = new Map();
      snap.forEach((d) => {
        const it = d.data();
        const name = it.name || "";
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0; // last price shown is arbitrary
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
  });
}

function setupCartToggle() {
  const cartToggle = document.getElementById("cart-toggle");
  const cartPanel = document.getElementById("cart-panel");
  if (!cartToggle || !cartPanel) return;
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

document.addEventListener("DOMContentLoaded", () => {
  setupCartToggle();
  refreshCartWidget();
});

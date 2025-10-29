import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  addDoc,
  setDoc,
  query,
  where,
  getDocs,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const productForm = document.getElementById("product-form");
const brandForm = document.getElementById("brand-form");
const logoutBtn = document.getElementById("logout");
const productList = document.getElementById("product-list");
const brandList = document.getElementById("brand-list");

// ---------------- TAB SWITCH ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
  });
});

// ---------------- LOGOUT ----------------
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ---------------- AUTH ----------------
onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "login.html";
  else if (user.email !== "admin@grocery.com") {
    alert("Access Denied!");
    window.location.href = "index.html";
  }
});

// ---------------- ADD PRODUCT ----------------
productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const category = document.getElementById("category").value.trim();
  const image = document.getElementById("image").value.trim();

  if (!name || !category || !image) return alert("Fill all fields!");

  await addDoc(collection(db, "products"), { name, category, image, createdAt: new Date() });
  alert("✅ Product Added!");
  productForm.reset();
  loadProducts();
});

// ---------------- LOAD PRODUCTS ----------------
async function loadProducts() {
  productList.innerHTML = "<h2>All Products</h2>";
  const snapshot = await getDocs(collection(db, "products"));
  snapshot.forEach((docSnap) => {
    const product = docSnap.data();
    const div = document.createElement("div");
    div.className = "product-card";
    div.innerHTML = `
      <div class="product-info">
        ${product.image?.startsWith("http") ? `<img src="${product.image}" width="40">` : `<span style="font-size:24px">${product.image}</span>`}
        <span><strong>${product.name}</strong> - ${product.category}</span>
      </div>
      <button class="remove-btn" data-id="${docSnap.id}">Remove</button>
    `;
    productList.appendChild(div);
  });

  // Remove product
  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "products", btn.dataset.id));
      alert("🗑️ Product Removed");
      loadProducts();
      loadBrands(); // refresh brands too
    });
  });
}

// ---------------- ADD BRAND + STORE ----------------
brandForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const productName = document.getElementById("brand-product").value.trim();
  const brandName = document.getElementById("brand-name").value.trim();
  const storeName = document.getElementById("brand-store").value.trim();
  const price = parseFloat(document.getElementById("brand-price").value);
  const weight = document.getElementById("brand-weight").value.trim();
  const image = document.getElementById("brand-image").value.trim();

  if (!productName || !brandName || !storeName || !price || !weight || !image) return alert("Fill all fields!");

  // Find product
  const q = query(collection(db, "products"), where("name", "==", productName));
  const productSnap = await getDocs(q);
  if (productSnap.empty) return alert("❌ Product not found!");
  const productDoc = productSnap.docs[0];

  // Brand reference
  const brandRef = doc(db, "products", productDoc.id, "brands", brandName);
  await setDoc(brandRef, { name: brandName, weight, image }, { merge: true });

  // Store reference
  const storeRef = doc(db, "products", productDoc.id, "brands", brandName, "stores", storeName);
  await setDoc(storeRef, { name: storeName, price, createdAt: new Date() });

  alert(`✅ Store "${storeName}" added/updated under "${brandName}"`);
  brandForm.reset();
  loadBrands();
});

// ---------------- LOAD BRANDS ----------------
async function loadBrands() {
  brandList.innerHTML = "<h2>All Brands</h2>";
  const productsSnap = await getDocs(collection(db, "products"));

  for (const prodDoc of productsSnap.docs) {
    const product = prodDoc.data();
    const brandsSnap = await getDocs(collection(db, "products", prodDoc.id, "brands"));
    if (brandsSnap.empty) continue;

    const productDiv = document.createElement("div");
    productDiv.innerHTML = `<h3>${product.name} (${product.category})</h3>`;
    brandList.appendChild(productDiv);

    for (const brandDoc of brandsSnap.docs) {
      const brand = brandDoc.data();
      const brandDiv = document.createElement("div");
      brandDiv.className = "product-card";
      brandDiv.innerHTML = `
        <div class="product-info">
          ${brand.image?.startsWith("http") ? `<img src="${brand.image}" width="40">` : `<span style="font-size:24px">${brand.image}</span>`}
          <span><strong>${brand.name}</strong> • ${brand.weight}</span>
        </div>
      `;

      // Remove brand button
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove Brand";
      removeBtn.addEventListener("click", async () => {
        const confirmDelete = confirm(`Delete brand "${brand.name}" and all its stores?`);
        if (!confirmDelete) return;
        // Delete stores under this brand, then the brand document
        const storesSnapForDelete = await getDocs(collection(db, "products", prodDoc.id, "brands", brandDoc.id, "stores"));
        const deletions = [];
        storesSnapForDelete.forEach((sDoc) => {
          deletions.push(deleteDoc(doc(db, "products", prodDoc.id, "brands", brandDoc.id, "stores", sDoc.id)));
        });
        await Promise.all(deletions);
        await deleteDoc(doc(db, "products", prodDoc.id, "brands", brandDoc.id));
        alert("🗑️ Brand Removed");
        loadBrands();
      });

      // Store list
      const storeList = document.createElement("div");
      storeList.className = "store-list";
      const storesSnap = await getDocs(collection(db, "products", prodDoc.id, "brands", brandDoc.id, "stores"));
      storesSnap.forEach((storeDoc) => {
        const s = storeDoc.data();
        const item = document.createElement("div");
        // text + remove button for individual store
        const label = document.createElement("span");
        label.textContent = `🏪 ${s.name}: ₹${s.price}`;
        const removeStoreBtn = document.createElement("button");
        removeStoreBtn.className = "remove-btn";
        removeStoreBtn.textContent = "Remove Store";
        removeStoreBtn.style.marginLeft = "10px";
        removeStoreBtn.addEventListener("click", async () => {
          const confirmDelete = confirm(`Delete store "${s.name}" from brand "${brand.name}"?`);
          if (!confirmDelete) return;
          await deleteDoc(doc(db, "products", prodDoc.id, "brands", brandDoc.id, "stores", storeDoc.id));
          alert("🗑️ Store Removed");
          loadBrands();
        });
        item.appendChild(label);
        item.appendChild(removeStoreBtn);
        storeList.appendChild(item);
      });

      brandDiv.appendChild(removeBtn);
      brandDiv.appendChild(storeList);
      productDiv.appendChild(brandDiv);
    }
  }
}

// ---------------- INIT ----------------
loadProducts();
loadBrands();

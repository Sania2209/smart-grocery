// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Firebase config (your current config; keep as-is)
const firebaseConfig = {
  apiKey: "AIzaSyBD0NevaFGjfry-2bqRD_satComUNTMkfg",
  authDomain: "smart-grocery-94030.firebaseapp.com",
  projectId: "smart-grocery-94030",
  storageBucket: "smart-grocery-94030.firebasestorage.app",
  messagingSenderId: "758070508465",
  appId: "1:758070508465:web:abafea7d6c53b1fc115b90",
  measurementId: "G-Y0XWD9KE8W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };

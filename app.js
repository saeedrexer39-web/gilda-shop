/* =====================================================
   GILDA SHOP - COMPLETE APPLICATION
   Supabase | Products | Cart | Checkout | Receipt
   Admin | Telegram Notifications
   Persian RTL | Card-to-card payment
===================================================== */

"use strict";

// =====================================================
// 1. SUPABASE
// =====================================================

const SUPABASE_URL = "https://uxigmkbctofiezcfvcyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_IjnHzzq4DqQl34qQwBmjsA_O-ncAcmn";

if (!window.supabase) {
  document.body.innerHTML =
    '<div dir="rtl" style="padding:40px;text-align:center">خطا در اتصال به فروشگاه. صفحه را دوباره بارگذاری کنید.</div>';
  throw new Error("Supabase library not loaded.");
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =====================================================
// 2. HELPERS
// =====================================================

const $ = id => document.getElementById(id);

const money = value =>
  Number(value || 0).toLocaleString("fa-IR") + " تومان";

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

function notify(message, type = "success") {
  const toast = $("toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.className = "toast show";

  if (type === "error") toast.classList.add("error");

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    toast.classList.remove("show", "error");
  }, 3500);
}

function setMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;

  el.textContent = message;
  el.style.color = error ? "#ff5555" : "#65c98b";
}

function setLoading(button, loading, text = "لطفاً صبر کنید...") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }

    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;

    delete button.dataset.originalText;
    button.disabled = false;
  }
}

function showElement(id) {
  const el = $(id);
  if (!el) return;

  el.classList.remove("hidden");

  if (
    el.classList.contains("admin-page") ||
    el.classList.contains("overlay") ||
    el.classList.contains("modal-overlay") ||
    el.classList.contains("cart-panel")
  ) {
    el.classList.add("active");
  }
}

function hideElement(id) {
  const el = $(id);
  if (!el) return;

  el.classList.add("hidden");
  el.classList.remove("active");
}

function formatCardNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

// =====================================================
// 3. GLOBAL STATE
// =====================================================

let products = [];
let cart = [];
let currentCategory = "all";
let currentUser = null;

let currentOrderId = null;
let currentReceiptToken = null;
let currentPaymentSettings = null;

let isSubmittingOrder = false;
let isUploadingReceipt = false;

const CART_STORAGE_KEY = "gilda_shop_cart";

// =====================================================
// 4. CART STORAGE
// =====================================================

function loadCart() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(CART_STORAGE_KEY) || "[]"
    );

    cart = Array.isArray(saved)
      ? saved.filter(item =>
          item &&
          item.product_id &&
          Number.isInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0
        )
      : [];
  } catch (error) {
    console.error("Cart loading:", error);
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(cart)
    );
  } catch (error) {
    console.error("Cart saving:", error);
    notify("ذخیره سبد خرید انجام نشد.", "error");
  }
}

// =====================================================
// 5. NAVIGATION
// =====================================================

function showStore() {
  hideElement("adminLogin");
  hideElement("adminDashboard");

  $("storePage")?.classList.remove("hidden");
  document.querySelector(".header")?.classList.remove("hidden");
  document.querySelector(".footer")?.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLogin(message = "") {
  $("storePage")?.classList.add("hidden");
  document.querySelector(".header")?.classList.add("hidden");
  document.querySelector(".footer")?.classList.add("hidden");

  hideElement("adminDashboard");
  showElement("adminLogin");

  setMessage("loginMessage", message, Boolean(message));
}

function showDashboard() {
  $("storePage")?.classList.add("hidden");
  document.querySelector(".header")?.classList.add("hidden");
  document.querySelector(".footer")?.classList.add("hidden");

  hideElement("adminLogin");
  showElement("adminDashboard");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.showStore = showStore;
window.showLogin = showLogin;
window.showDashboard = showDashboard;

// =====================================================
// 6. PRODUCT IMAGES
// =====================================================

async function getProductImage(path) {
  if (!path) return "";

  if (/^(https?:\/\/|data:)/i.test(path)) {
    return path;
  }

  const { data, error } = await db.storage
    .from("product-images")
    .createSignedUrl(path, 3600);

  if (error) {
    console.error("Product image URL:", error);
    return "";
  }

  return data?.signedUrl || "";
}

async function uploadProductImage(file) {
  if (!file) return null;

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error("فرمت تصویر باید JPG، PNG یا WEBP باشد.");
  }

  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error("حجم تصویر باید حداکثر ۵ مگابایت باشد.");
  }

  const extension =
    file.type === "image/jpeg" ? "jpg" :
    file.type === "image/png" ? "png" : "webp";

  const path = `products/${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("product-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  return path;
}

// =====================================================
// 7. PRODUCTS
// =====================================================

async function loadProducts() {
  const grid = $("productsGrid");

  if (grid) {
    grid.innerHTML =
      '<div class="loading-message">در حال دریافت محصولات...</div>';
  }

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load products:", error);

    if (grid) {
      grid.innerHTML =
        '<p class="empty-message">دریافت محصولات ناموفق بود.</p>';
    }

    return;
  }

  products = data || [];

  await renderProducts();
  updateCart();
}

async function renderProducts() {
  const grid = $("productsGrid");
  if (!grid) return;

  const filtered = currentCategory === "all"
    ? products
    : products.filter(p => p.category === currentCategory);

  if (!filtered.length) {
    grid.innerHTML =
      '<p class="empty-message">در این دسته‌بندی محصولی موجود نیست.</p>';
    return;
  }

  grid.innerHTML = "";

  for (const product of filtered) {
    const imageUrl = await getProductImage(product.image_url);

    const card = document.createElement("article");
    card.className = "product-card";

    card.innerHTML = `
      <div class="product-image">
        ${imageUrl
          ? `<img src="${escapeHTML(imageUrl)}"
              alt="${escapeHTML(product.name)}"
              loading="lazy">`
          : '<div class="image-placeholder">GILDA SHOP</div>'}
      </div>

      <div class="product-info">
        <h3>${escapeHTML(product.name)}</h3>

        <p class="product-description">
          ${escapeHTML(product.description || "")}
        </p>

        <div class="product-bottom">
          <strong>${money(product.price_toman)}</strong>

          <button class="add-to-cart"
            type="button"
            data-add-product="${escapeHTML(product.id)}"
            ${Number(product.stock) <= 0 ? "disabled" : ""}>
            ${Number(product.stock) <= 0
              ? "ناموجود"
              : "افزودن به سبد"}
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  }
}

document.querySelectorAll(".category-button").forEach(button => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".category-button").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    currentCategory = button.dataset.category || "all";

    await renderProducts();
  });
});

// =====================================================
// 8. CART
// =====================================================

function addToCart(productId) {
  const product = products.find(
    p => String(p.id) === String(productId)
  );

  if (!product) {
    return notify("محصول پیدا نشد.", "error");
  }

  if (Number(product.stock) <= 0) {
    return notify("این محصول موجود نیست.", "error");
  }

  const existing = cart.find(
    i => String(i.product_id) === String(productId)
  );

  if (existing) {
    if (Number(existing.quantity) >= Number(product.stock)) {
      return notify(
        "بیشتر از موجودی نمی‌توانید انتخاب کنید.",
        "error"
      );
    }

    existing.quantity = Number(existing.quantity) + 1;
  } else {
    cart.push({
      product_id: product.id,
      quantity: 1
    });
  }

  saveCart();
  updateCart();

  notify("محصول به سبد خرید اضافه شد.");
}

function changeCartQuantity(productId, change) {
  const item = cart.find(
    i => String(i.product_id) === String(productId)
  );

  const product = products.find(
    p => String(p.id) === String(productId)
  );

  if (!item || !product) return;

  const next = Number(item.quantity) + Number(change);

  if (next <= 0) {
    cart = cart.filter(
      i => String(i.product_id) !== String(productId)
    );
  } else if (next <= Number(product.stock)) {
    item.quantity = next;
  } else {
    notify("موجودی کافی نیست.", "error");
  }

  saveCart();
  updateCart();
}

function removeFromCart(productId) {
  cart = cart.filter(
    i => String(i.product_id) !== String(productId)
  );

  saveCart();
  updateCart();
}

function getCartTotal() {
  return cart.reduce((total, item) => {
    const product = products.find(
      p => String(p.id) === String(item.product_id)
    );

    return total + (
      product
        ? Number(product.price_toman) * Number(item.quantity)
        : 0
    );
  }, 0);
}

function updateCart() {
  if (products.length) {
    cart = cart.filter(item =>
      products.some(
        p => String(p.id) === String(item.product_id)
      )
    );

    saveCart();
  }

  const count = cart.reduce(
    (sum, item) => sum + Number(item.quantity),
    0
  );

  if ($("cartCount")) {
    $("cartCount").textContent = count.toLocaleString("fa-IR");
  }

  if ($("cartTotal")) {
    $("cartTotal").textContent = money(getCartTotal());
  }

  if ($("checkoutTotal")) {
    $("checkoutTotal").textContent = money(getCartTotal());
  }

  const container = $("cartItems");
  if (!container) return;

  if (!cart.length) {
    container.innerHTML =
      '<p class="empty-message">سبد خرید شما خالی است.</p>';
    return;
  }

  container.innerHTML = "";

  cart.forEach(item => {
    const product = products.find(
      p => String(p.id) === String(item.product_id)
    );

    if (!product) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    row.innerHTML = `
      <div class="cart-item-info">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${money(product.price_toman)}</span>
      </div>

      <div class="cart-item-actions">
        <button type="button"
          data-cart-change="-1"
          data-product-id="${escapeHTML(product.id)}">−</button>

        <span>${Number(item.quantity).toLocaleString("fa-IR")}</span>

        <button type="button"
          data-cart-change="1"
          data-product-id="${escapeHTML(product.id)}">+</button>

        <button type="button"
          data-cart-remove="${escapeHTML(product.id)}">حذف</button>
      </div>
    `;

    container.appendChild(row);
  });
}

$("productsGrid")?.addEventListener("click", event => {
  const button = event.target.closest("[data-add-product]");

  if (button) {
    addToCart(button.dataset.addProduct);
  }
});

$("cartItems")?.addEventListener("click", event => {
  const change = event.target.closest("[data-cart-change]");
  const remove = event.target.closest("[data-cart-remove]");

  if (change) {
    changeCartQuantity(
      change.dataset.productId,
      Number(change.dataset.cartChange)
    );
  }

  if (remove) {
    removeFromCart(remove.dataset.cartRemove);
  }
});

// =====================================================
// 9. CART AND CHECKOUT MODALS
// =====================================================

$("cartButton")?.addEventListener("click", () => {
  showElement("cartOverlay");
  showElement("cartPanel");
});

function closeCart() {
  hideElement("cartOverlay");
  hideElement("cartPanel");
}

$("closeCart")?.addEventListener("click", closeCart);
$("cartOverlay")?.addEventListener("click", closeCart);

$("checkoutButton")?.addEventListener("click", () => {
  if (currentReceiptToken) {
    showElement("paymentModal");

    return notify(
      "ابتدا رسید سفارش قبلی را ارسال کنید.",
      "error"
    );
  }

  if (!cart.length) {
    return notify("سبد خرید شما خالی است.", "error");
  }

  closeCart();

  if ($("checkoutTotal")) {
    $("checkoutTotal").textContent = money(getCartTotal());
  }

  showElement("checkoutModal");
});

$("closeCheckout")?.addEventListener("click", () => {
  hideElement("checkoutModal");
});

$("checkoutModal")?.addEventListener("click", event => {
  if (event.target === $("checkoutModal")) {
    hideElement("checkoutModal");
  }
});

// =====================================================
// 10. TELEGRAM NOTIFICATION - FIXED
// =====================================================

async function notifyNewOrder(orderId, token) {
  const endpoint =
    `${SUPABASE_URL}/functions/v1/notify-new-order`;

  try {
    if (!orderId || !token) {
      console.error(
        "Telegram: order id or receipt token is missing."
      );

      return false;
    }

    console.info(
      "Telegram: sending notification for order:",
      orderId
    );

    const response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",

      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },

      body: JSON.stringify({
        order_id: orderId,
        token: token
      })
    });

    const responseText = await response.text();

    let result;

    try {
      result = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      result = {
        raw: responseText
      };
    }

    if (!response.ok) {
      console.error(
        "Telegram Edge Function error:",
        response.status,
        result
      );

      return false;
    }

    console.info(
      "Telegram notification response:",
      result
    );

    return true;

  } catch (error) {
    console.error(
      "Telegram request failed:",
      error
    );

    return false;
  }
}

// =====================================================
// 11. CREATE ORDER
// =====================================================

$("checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (isSubmittingOrder) return;

  if (currentReceiptToken) {
    showElement("paymentModal");

    return notify(
      "ابتدا رسید سفارش قبلی را ارسال کنید.",
      "error"
    );
  }

  if (!cart.length) {
    return notify("سبد خرید شما خالی است.", "error");
  }

  const button = $("submitOrderButton");

  isSubmittingOrder = true;

  setLoading(
    button,
    true,
    "در حال ثبت سفارش..."
  );

  try {
    const customerName =
      $("customerName")?.value.trim();

    const phone =
      $("customerPhone")?.value.trim();

    const city =
      $("customerCity")?.value.trim() || "";

    const address =
      $("customerAddress")?.value.trim();

    const postalCode =
      $("customerPostalCode")?.value.trim() || "";

    if (!customerName || !phone || !address) {
      throw new Error(
        "لطفاً نام، شماره تماس و آدرس را وارد کنید."
      );
    }

    const items = cart.map(item => ({
      product_id: item.product_id,
      quantity: Number(item.quantity)
    }));

    const { data, error } = await db.rpc(
      "create_order_with_receipt_token",
      {
        p_customer_name: customerName,
        p_phone: phone,
        p_city: city,
        p_address: address,
        p_postal_code: postalCode,
        p_items: items
      }
    );

    if (error) throw error;

    currentOrderId = data?.order_id || null;
    currentReceiptToken = data?.receipt_token || null;

    if (!currentOrderId || !currentReceiptToken) {
      currentOrderId = null;
      currentReceiptToken = null;

      throw new Error(
        "اطلاعات امنیتی سفارش دریافت نشد. با مدیریت تماس بگیرید."
      );
    }

    // اعلان تلگرام بدون متوقف کردن ثبت سفارش
    void notifyNewOrder(
      currentOrderId,
      currentReceiptToken
    );

    if ($("receiptFile")) {
      $("receiptFile").disabled = false;
      $("receiptFile").value = "";
    }

    if ($("uploadReceiptButton")) {
      $("uploadReceiptButton").disabled = false;
    }

    cart = [];

    saveCart();
    updateCart();

    $("checkoutForm")?.reset();

    hideElement("checkoutModal");

    await loadPaymentDetails();

    showElement("paymentModal");

    notify(
      "سفارش ثبت شد. پس از پرداخت، تصویر رسید را ارسال کنید."
    );

    await loadProducts();

  } catch (error) {
    console.error("Checkout error:", error);

    notify(
      error.message || "ثبت سفارش انجام نشد.",
      "error"
    );

  } finally {
    isSubmittingOrder = false;
    setLoading(button, false);
  }
});

// =====================================================
// 12. PAYMENT SETTINGS
// =====================================================

async function loadPaymentDetails() {
  const container = $("paymentDetails");
  if (!container) return;

  container.innerHTML =
    "<p>در حال دریافت اطلاعات پرداخت...</p>";

  const { data, error } =
    await db.rpc("get_public_payment_settings");

  if (error) {
    console.error("Payment settings:", error);

    container.innerHTML =
      '<p class="empty-message">دریافت اطلاعات پرداخت ناموفق بود.</p>';

    return;
  }

  currentPaymentSettings =
    Array.isArray(data) ? data[0] : data;

  const s = currentPaymentSettings || {};

  container.innerHTML = `
    <div class="payment-info">
      <p>
        <strong>فروشگاه:</strong>
        ${escapeHTML(s.store_name || "GILDA SHOP")}
      </p>

      <p>
        <strong>بانک:</strong>
        ${escapeHTML(s.bank_name || "ثبت نشده")}
      </p>

      <p><strong>شماره کارت:</strong></p>

      <strong class="card-number">
        ${escapeHTML(
          formatCardNumber(
            s.card_number || "شماره کارت ثبت نشده"
          )
        )}
      </strong>

      <p>
        <strong>صاحب حساب:</strong>
        ${escapeHTML(s.account_holder || "ثبت نشده")}
      </p>

      <p>${escapeHTML(s.payment_note || "")}</p>
    </div>

    <p class="payment-warning">
      لطفاً پس از واریز، تصویر رسید را ارسال کنید.
    </p>

    <p>
      <strong>شماره سفارش:</strong>
      ${escapeHTML(currentOrderId || "")}
    </p>
  `;
}

$("closePayment")?.addEventListener("click", () => {
  hideElement("paymentModal");
});

$("paymentModal")?.addEventListener("click", event => {
  if (event.target === $("paymentModal")) {
    hideElement("paymentModal");
  }
});

// =====================================================
// 13. RECEIPT UPLOAD
// =====================================================

$("uploadReceiptButton")?.addEventListener("click", async () => {
  const button = $("uploadReceiptButton");
  const fileInput = $("receiptFile");
  const file = fileInput?.files?.[0];

  if (isUploadingReceipt) return;

  if (!currentOrderId || !currentReceiptToken) {
    return notify(
      "اطلاعات سفارش معتبر نیست. اگر صفحه را تازه کرده‌اید با فروشگاه تماس بگیرید.",
      "error"
    );
  }

  if (!file) {
    return notify(
      "ابتدا تصویر رسید را انتخاب کنید.",
      "error"
    );
  }

  if (![
    "image/jpeg",
    "image/png",
    "image/webp"
  ].includes(file.type)) {
    return notify(
      "فرمت تصویر باید JPG، PNG یا WEBP باشد.",
      "error"
    );
  }

  if (!file.size || file.size > 5 * 1024 * 1024) {
    return notify(
      "حجم تصویر باید حداکثر ۵ مگابایت باشد.",
      "error"
    );
  }

  isUploadingReceipt = true;

  setLoading(
    button,
    true,
    "در حال ارسال رسید..."
  );

  try {
    const formData = new FormData();

    formData.append("order_id", currentOrderId);
    formData.append("token", currentReceiptToken);
    formData.append("file", file);

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/upload-payment-receipt`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY
        },
        body: formData
      }
    );

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "پاسخ سرور معتبر نیست. دوباره تلاش کنید."
      );
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || "ارسال رسید ناموفق بود."
      );
    }

    currentReceiptToken = null;
    currentOrderId = null;

    if (fileInput) {
      fileInput.value = "";
      fileInput.disabled = true;
    }

    hideElement("paymentModal");

    notify(
      "رسید با موفقیت ارسال شد. منتظر بررسی مدیریت باشید."
    );

  } catch (error) {
    console.error("Receipt upload:", error);

    notify(
      error.message || "ارسال رسید ناموفق بود.",
      "error"
    );

  } finally {
    isUploadingReceipt = false;
    setLoading(button, false);
  }
});

// =====================================================
// 14. ADMIN AUTHENTICATION
// =====================================================

async function verifyAdminAccess() {
  const { data, error } = await db.rpc("is_admin");

  if (error) {
    console.error("Admin verification:", error);
    return false;
  }

  return data === true;
}

async function openAdminPanel() {
  try {
    const { data, error } =
      await db.auth.getSession();

    if (error) throw error;

    if (!data?.session) {
      showLogin();
      return;
    }

    currentUser = data.session.user;

    if (!(await verifyAdminAccess())) {
      showLogin("شما دسترسی مدیریت ندارید.");
      return;
    }

    showDashboard();

    await Promise.all([
      loadAdminProducts(),
      loadAdminOrders(),
      loadAdminSettings()
    ]);

  } catch (error) {
    console.error("Open admin:", error);

    notify(
      "خطا در باز کردن پنل مدیریت.",
      "error"
    );
  }
}

$("adminAccessButton")?.addEventListener(
  "click",
  openAdminPanel
);

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = $("loginForm");
  const button =
    form.querySelector('button[type="submit"]');

  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value;

  if (!email || !password) {
    return setMessage(
      "loginMessage",
      "ایمیل و رمز عبور را وارد کنید.",
      true
    );
  }

  setLoading(button, true, "در حال ورود...");
  setMessage("loginMessage", "");

  try {
    const { data, error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    currentUser = data.user;

    if (!(await verifyAdminAccess())) {
      await db.auth.signOut();
      currentUser = null;

      throw new Error(
        "این حساب دسترسی مدیریت ندارد."
      );
    }

    notify("ورود موفقیت‌آمیز بود.");

    await openAdminPanel();

  } catch (error) {
    console.error("Login:", error);

    setMessage(
      "loginMessage",
      error.message || "ورود ناموفق بود.",
      true
    );

  } finally {
    setLoading(button, false);
  }
});

$("logoutButton")?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Logout:", error);

    return notify(
      "خروج ناموفق بود.",
      "error"
    );
  }

  currentUser = null;

  showStore();

  notify("با موفقیت خارج شدید.");
});

db.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user || null;

  if (event === "SIGNED_OUT") {
    hideElement("adminDashboard");
  }
});

// =====================================================
// 15. ADMIN TABS - FIXED
// =====================================================

document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", async function () {
    const target = this.dataset.tab;

    document.querySelectorAll(".admin-tab").forEach(el => {
      el.classList.remove("active");
    });

    document.querySelectorAll(".admin-section").forEach(el => {
      el.classList.remove("active");
      el.style.display = "none";
    });

    this.classList.add("active");

    const section = $(target);

    if (section) {
      section.classList.add("active");
      section.style.display = "block";
    }

    if (target === "productsAdmin") {
      await loadAdminProducts();
    }

    if (target === "ordersAdmin") {
      await loadAdminOrders();
    }

    if (target === "settingsAdmin") {
      await loadAdminSettings();
    }
  });
});

// =====================================================
// 16. ADMIN PRODUCTS
// =====================================================

async function loadAdminProducts() {
  const container = $("adminProductsList");
  if (!container) return;

  container.innerHTML = "در حال دریافت محصولات...";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      container.innerHTML = "هنوز محصولی ثبت نشده است.";
      return;
    }

    container.innerHTML = data.map(product => `
      <div class="admin-product-item">
        <div class="admin-product-info">
          <strong>${escapeHTML(product.name)}</strong>
          <p>${money(product.price_toman)}</p>
          <small>موجودی: ${Number(product.stock) || 0}</small>
          <small>${product.is_active ? "فعال" : "غیرفعال"}</small>
        </div>

        <div class="admin-product-actions">
          <button type="button"
            onclick="editProduct('${escapeHTML(product.id)}')">
            ویرایش
          </button>

          <button type="button"
            onclick="toggleProductStatus('${escapeHTML(product.id)}', ${!product.is_active})">
            ${product.is_active ? "غیرفعال کردن" : "فعال کردن"}
          </button>

          <button type="button"
            onclick="deleteProduct('${escapeHTML(product.id)}')">
            حذف
          </button>
        </div>
      </div>
    `).join("");

  } catch (error) {
    console.error("Admin products:", error);
    container.innerHTML = "خطا در دریافت محصولات.";
  }
}

$("productForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = $("productForm");
  const button =
    form.querySelector('button[type="submit"]');

  const productId = $("productId")?.value || "";
  const name = $("productName")?.value.trim();
  const category = $("productCategory")?.value.trim();
  const price = Number($("productPrice")?.value);
  const stock = Number($("productStock")?.value);

  const description =
    $("productDescription")?.value.trim() || "";

  const imageFile =
    $("productImage")?.files?.[0];

  if (
    !name ||
    !category ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return setMessage(
      "productMessage",
      "اطلاعات محصول را به‌درستی وارد کنید.",
      true
    );
  }

  setLoading(button, true, "در حال ذخیره...");

  try {
    const productData = {
      name,
      category,
      price_toman: price,
      stock,
      description
    };

    if (imageFile) {
      productData.image_url =
        await uploadProductImage(imageFile);
    }

    let result;

    if (productId) {
      result = await db
        .from("products")
        .update(productData)
        .eq("id", productId);
    } else {
      productData.is_active = true;

      result = await db
        .from("products")
        .insert(productData);
    }

    if (result.error) throw result.error;

    form.reset();

    if ($("productId")) {
      $("productId").value = "";
    }

    if ($("cancelEdit")) {
      $("cancelEdit").style.display = "none";
    }

    setMessage(
      "productMessage",
      "محصول با موفقیت ذخیره شد."
    );

    notify("محصول ذخیره شد.");

    await Promise.all([
      loadAdminProducts(),
      loadProducts()
    ]);

  } catch (error) {
    console.error("Save product:", error);

    setMessage(
      "productMessage",
      error.message || "ذخیره محصول ناموفق بود.",
      true
    );

  } finally {
    setLoading(button, false);
  }
});

async function editProduct(productId) {
  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (error) throw error;

    $("productId").value = data.id;
    $("productName").value = data.name || "";
    $("productCategory").value = data.category || "";
    $("productPrice").value = data.price_toman ?? "";
    $("productStock").value = data.stock ?? 0;
    $("productDescription").value =
      data.description || "";

    if ($("cancelEdit")) {
      $("cancelEdit").style.display = "inline-block";
    }

    $("productForm")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    console.error("Edit product:", error);

    notify(
      "دریافت اطلاعات محصول ناموفق بود.",
      "error"
    );
  }
}

async function toggleProductStatus(productId, isActive) {
  try {
    const { error } = await db
      .from("products")
      .update({
        is_active: Boolean(isActive)
      })
      .eq("id", productId);

    if (error) throw error;

    await Promise.all([
      loadAdminProducts(),
      loadProducts()
    ]);

    notify("وضعیت محصول تغییر کرد.");

  } catch (error) {
    console.error("Toggle product:", error);

    notify(
      "تغییر وضعیت محصول ناموفق بود.",
      "error"
    );
  }
}

async function deleteProduct(productId) {
  if (!confirm("آیا از حذف این محصول مطمئن هستید؟")) {
    return;
  }

  try {
    const { error } = await db
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) throw error;

    await Promise.all([
      loadAdminProducts(),
      loadProducts()
    ]);

    notify("محصول حذف شد.");

  } catch (error) {
    console.error("Delete product:", error);

    notify(
      "حذف محصول ناموفق بود.",
      "error"
    );
  }
}

window.editProduct = editProduct;
window.toggleProductStatus = toggleProductStatus;
window.deleteProduct = deleteProduct;

$("cancelEdit")?.addEventListener("click", () => {
  $("productForm")?.reset();

  if ($("productId")) {
    $("productId").value = "";
  }

  if ($("cancelEdit")) {
    $("cancelEdit").style.display = "none";
  }

  setMessage("productMessage", "");
});

// =====================================================
// 17. ADMIN ORDERS
// =====================================================

async function loadAdminOrders() {
  const container = $("adminOrdersList");
  if (!container) return;

  container.innerHTML = "در حال دریافت سفارش‌ها...";

  try {
    const { data, error } = await db
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          product_name,
          unit_price_toman,
          quantity
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      container.innerHTML = "هنوز سفارشی ثبت نشده است.";
      return;
    }

    const labels = {
      pending: "در انتظار پرداخت",
      awaiting_payment_review: "در انتظار بررسی رسید",
      payment_rejected: "رسید رد شده",
      confirmed: "تأیید شده",
      shipped: "ارسال شده",
      delivered: "تحویل داده شده",
      cancelled: "لغو شده"
    };

    container.innerHTML = data.map(order => {
      const items = (order.order_items || [])
        .map(item => `
          <li>
            ${escapeHTML(item.product_name)}
            × ${Number(item.quantity)}
            — ${money(item.unit_price_toman)}
          </li>
        `)
        .join("");

      return `
        <div class="admin-order-item">
          <h3>سفارش ${escapeHTML(order.id)}</h3>

          <p>نام مشتری:
            ${escapeHTML(order.customer_name || "")}
          </p>

          <p>شماره تماس:
            ${escapeHTML(order.phone || "")}
          </p>

          <p>شهر:
            ${escapeHTML(order.city || "")}
          </p>

          <p>آدرس:
            ${escapeHTML(order.address || "")}
          </p>

          <p>کد پستی:
            ${escapeHTML(order.postal_code || "")}
          </p>

          <p>مبلغ:
            ${money(order.total_toman)}
          </p>

          <p>وضعیت:
            ${escapeHTML(labels[order.status] || order.status)}
          </p>

          <ul>${items}</ul>

          ${order.receipt_path &&
            !order.receipt_path.startsWith("uploading:")
            ? `
              <button type="button"
                onclick="viewReceipt('${escapeHTML(order.id)}')">
                مشاهده رسید
              </button>
            `
            : ""}

          <label for="status-${escapeHTML(order.id)}">
            تغییر وضعیت سفارش
          </label>

          <select
            id="status-${escapeHTML(order.id)}"
            onchange="updateOrderStatus('${escapeHTML(order.id)}', this.value)">

            ${Object.entries(labels).map(([value, label]) => `
              <option value="${value}"
                ${order.status === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}

          </select>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("Admin orders:", error);
    container.innerHTML = "خطا در دریافت سفارش‌ها.";
  }
}

async function updateOrderStatus(orderId, status) {
  const allowed = [
    "pending",
    "awaiting_payment_review",
    "payment_rejected",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled"
  ];

  if (!allowed.includes(status)) {
    return notify(
      "وضعیت سفارش معتبر نیست.",
      "error"
    );
  }

  try {
    const { error } = await db
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (error) throw error;

    await loadAdminOrders();

    notify("وضعیت سفارش به‌روزرسانی شد.");

  } catch (error) {
    console.error("Update order:", error);

    notify(
      "تغییر وضعیت سفارش ناموفق بود.",
      "error"
    );
  }
}

async function viewReceipt(orderId) {
  try {
    const { data: order, error } = await db
      .from("orders")
      .select("receipt_path")
      .eq("id", orderId)
      .single();

    if (error) throw error;

    if (
      !order?.receipt_path ||
      order.receipt_path.startsWith("uploading:")
    ) {
      throw new Error(
        "رسید برای این سفارش موجود نیست."
      );
    }

    const { data, error: urlError } = await db.storage
      .from("payment-receipts")
      .createSignedUrl(order.receipt_path, 300);

    if (urlError) throw urlError;

    window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );

  } catch (error) {
    console.error("View receipt:", error);

    notify(
      error.message || "نمایش رسید ناموفق بود.",
      "error"
    );
  }
}

window.updateOrderStatus = updateOrderStatus;
window.viewReceipt = viewReceipt;

// =====================================================
// 18. STORE SETTINGS
// =====================================================

async function loadAdminSettings() {
  try {
    const { data, error } = await db
      .from("store_settings")
      .select("*")
      .eq("id", "main")
      .single();

    if (error) throw error;

    const fields = {
      settingStoreName: data.store_name,
      settingBankName: data.bank_name,
      settingCardNumber: data.card_number,
      settingAccountHolder: data.account_holder,
      settingPaymentNote: data.payment_note
    };

    Object.entries(fields).forEach(([id, value]) => {
      if ($(id)) {
        $(id).value = value || "";
      }
    });

  } catch (error) {
    console.error("Load settings:", error);

    notify(
      "دریافت تنظیمات فروشگاه ناموفق بود.",
      "error"
    );
  }
}

$("settingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = $("settingsForm");

  const button =
    form.querySelector('button[type="submit"]');

  const settings = {
    id: "main",
    store_name: $("settingStoreName")?.value.trim() || "",
    bank_name: $("settingBankName")?.value.trim() || "",
    card_number: $("settingCardNumber")?.value.trim() || "",
    account_holder: $("settingAccountHolder")?.value.trim() || "",
    payment_note: $("settingPaymentNote")?.value.trim() || "",
    updated_at: new Date().toISOString()
  };

  setLoading(button, true, "در حال ذخیره...");

  try {
    const { error } = await db
      .from("store_settings")
      .upsert(settings, {
        onConflict: "id"
      });

    if (error) throw error;

    setMessage(
      "settingsMessage",
      "تنظیمات با موفقیت ذخیره شد."
    );

    notify("تنظیمات فروشگاه ذخیره شد.");

  } catch (error) {
    console.error("Save settings:", error);

    setMessage(
      "settingsMessage",
      error.message || "ذخیره تنظیمات ناموفق بود.",
      true
    );

  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// 19. GLOBAL ERROR HANDLING
// =====================================================

window.addEventListener("unhandledrejection", event => {
  console.error(
    "Unhandled rejection:",
    event.reason
  );
});

window.addEventListener("error", event => {
  console.error(
    "Application error:",
    event.error
  );
});

// =====================================================
// 20. INITIALIZATION
// =====================================================

async function initializeApp() {
  try {
    loadCart();

    await loadProducts();

    const { data, error } =
      await db.auth.getSession();

    if (error) throw error;

    currentUser = data?.session?.user || null;

    hideElement("adminLogin");
    hideElement("adminDashboard");
    hideElement("cartOverlay");
    hideElement("cartPanel");
    hideElement("checkoutModal");
    hideElement("paymentModal");

    if ($("receiptFile")) {
      $("receiptFile").disabled = true;
    }

    if ($("uploadReceiptButton")) {
      $("uploadReceiptButton").disabled = true;
    }

    // وضعیت اولیه تب‌های پنل مدیریت
    document.querySelectorAll(".admin-section").forEach(section => {
      section.style.display =
        section.classList.contains("active") ? "block" : "none";
    });

    showStore();

    console.log(
      "GILDA SHOP initialized successfully."
    );

  } catch (error) {
    console.error("Initialization error:", error);

    notify(
      "بارگذاری فروشگاه با مشکل مواجه شد.",
      "error"
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );
} else {
  initializeApp();
}

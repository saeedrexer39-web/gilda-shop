
/* =====================================================
   GILDA SHOP - COMPLETE APPLICATION
   Supabase | Products | Cart | Checkout | Admin
   Persian RTL | Card-to-card payment
===================================================== */

"use strict";

// =====================================================
// 1. SUPABASE CONNECTION
// =====================================================

const SUPABASE_URL = "https://uxigmkbctofiezcfvcyq.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_IjnHzzq4DqQl34qQwBmjsA_O-ncAcmn";

if (!window.supabase) {
  document.body.innerHTML =
    '<div style="direction:rtl;text-align:center;padding:40px;font-family:sans-serif">خطا در اتصال به سرویس فروشگاه. صفحه را دوباره بارگذاری کنید.</div>';
  throw new Error("Supabase library is not loaded.");
}

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =====================================================
// 2. HELPERS
// =====================================================

const $ = (id) => document.getElementById(id);

const money = (value) =>
  Number(value || 0).toLocaleString("fa-IR") + " تومان";

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

function showElement(id) {
  const element = $(id);
  if (!element) return;

  element.classList.remove("hidden");

  if (
    element.classList.contains("admin-page") ||
    element.classList.contains("overlay") ||
    element.classList.contains("modal-overlay") ||
    element.classList.contains("cart-panel")
  ) {
    element.classList.add("active");
  }
}

function hideElement(id) {
  const element = $(id);
  if (!element) return;

  element.classList.add("hidden");
  element.classList.remove("active");
}

function notify(message, type = "success") {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast show";

  if (type === "error") {
    toast.classList.add("error");
  }

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    toast.classList.remove("show", "error");
  }, 3500);
}

function setMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ff5555" : "#65c98b";
}

function setLoading(button, loading, loadingText = "لطفاً صبر کنید...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF-]/g, "");
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
let currentPaymentSettings = null;

const CART_STORAGE_KEY = "gilda_shop_cart";

try {
  cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");

  if (!Array.isArray(cart)) {
    cart = [];
  }
} catch {
  cart = [];
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

// =====================================================
// 4. PAGE NAVIGATION
// =====================================================

function showStore() {
  hideElement("adminLogin");
  hideElement("adminDashboard");

  $("storePage")?.classList.remove("hidden");
  document.querySelector(".header")?.classList.remove("hidden");
  document.querySelector(".footer")?.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLogin() {
  $("storePage")?.classList.add("hidden");
  document.querySelector(".header")?.classList.add("hidden");
  document.querySelector(".footer")?.classList.add("hidden");

  hideElement("adminDashboard");
  showElement("adminLogin");

  window.scrollTo({ top: 0, behavior: "smooth" });
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
// 5. PRODUCT IMAGES
// =====================================================

async function getProductImage(path) {
  if (!path) return "";

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:")
  ) {
    return path;
  }

  const { data, error } = await db.storage
    .from("product-images")
    .createSignedUrl(path, 3600);

  if (error) {
    console.error("Image URL error:", error);
    return "";
  }

  return data?.signedUrl || "";
}

// =====================================================
// 6. LOAD PRODUCTS
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
    console.error("Products error:", error);

    if (grid) {
      grid.innerHTML =
        '<p class="empty-message">دریافت محصولات با مشکل مواجه شد. دوباره تلاش کنید.</p>';
    }

    return;
  }

  products = data || [];

  await renderProducts();
  updateCart();
}

// =====================================================
// 7. RENDER PRODUCTS
// =====================================================

async function renderProducts() {
  const grid = $("productsGrid");
  if (!grid) return;

  const filtered = currentCategory === "all"
    ? products
    : products.filter(
        (product) => product.category === currentCategory
      );

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
        ${
          imageUrl
            ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(product.name)}" loading="lazy">`
            : '<div class="image-placeholder">GILDA SHOP</div>'
        }
      </div>

      <div class="product-info">
        <h3>${escapeHTML(product.name)}</h3>

        <p class="product-description">
          ${escapeHTML(product.description || "")}
        </p>

        <div class="product-bottom">
          <strong>${money(product.price_toman)}</strong>

          <button
            class="add-to-cart"
            type="button"
            data-add-product="${escapeHTML(product.id)}"
            ${Number(product.stock) <= 0 ? "disabled" : ""}
          >
            ${Number(product.stock) <= 0 ? "ناموجود" : "افزودن به سبد"}
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  }
}

// =====================================================
// 8. CATEGORY FILTER
// =====================================================

document.querySelectorAll(".category-button").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".category-button").forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    currentCategory = button.dataset.category || "all";

    await renderProducts();
  });
});

// =====================================================
// 9. CART
// =====================================================

function addToCart(productId) {
  const product = products.find(
    (item) => String(item.id) === String(productId)
  );

  if (!product) {
    notify("محصول پیدا نشد.", "error");
    return;
  }

  if (Number(product.stock) <= 0) {
    notify("این محصول موجود نیست.", "error");
    return;
  }

  const existing = cart.find(
    (item) => String(item.product_id) === String(productId)
  );

  if (existing) {
    if (existing.quantity >= Number(product.stock)) {
      notify("بیشتر از موجودی محصول نمی‌توانید انتخاب کنید.", "error");
      return;
    }

    existing.quantity += 1;
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
    (product) => String(product.product_id) === String(productId)
  );

  const product = products.find(
    (product) => String(product.id) === String(productId)
  );

  if (!item || !product) return;

  const nextQuantity = item.quantity + change;

  if (nextQuantity <= 0) {
    cart = cart.filter(
      (product) => String(product.product_id) !== String(productId)
    );
  } else if (nextQuantity <= Number(product.stock)) {
    item.quantity = nextQuantity;
  } else {
    notify("موجودی کافی نیست.", "error");
  }

  saveCart();
  updateCart();
}

function removeFromCart(productId) {
  cart = cart.filter(
    (item) => String(item.product_id) !== String(productId)
  );

  saveCart();
  updateCart();
}

function getCartTotal() {
  return cart.reduce((total, item) => {
    const product = products.find(
      (product) => String(product.id) === String(item.product_id)
    );

    if (!product) return total;

    return total +
      Number(product.price_toman) * Number(item.quantity);
  }, 0);
}

function updateCart() {
  const container = $("cartItems");
  const countElement = $("cartCount");
  const totalElement = $("cartTotal");

  cart = cart.filter((item) =>
    products.some(
      (product) => String(product.id) === String(item.product_id)
    )
  );

  saveCart();

  const count = cart.reduce(
    (total, item) => total + Number(item.quantity),
    0
  );

  if (countElement) {
    countElement.textContent = count.toLocaleString("fa-IR");
  }

  if (totalElement) {
    totalElement.textContent = money(getCartTotal());
  }

  if ($("checkoutTotal")) {
    $("checkoutTotal").textContent = money(getCartTotal());
  }

  if (!container) return;

  if (!cart.length) {
    container.innerHTML =
      '<p class="empty-message">سبد خرید شما خالی است.</p>';
    return;
  }

  container.innerHTML = "";

  cart.forEach((item) => {
    const product = products.find(
      (product) => String(product.id) === String(item.product_id)
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
        <button
          type="button"
          data-cart-change="-1"
          data-product-id="${escapeHTML(product.id)}"
        >−</button>

        <span>${Number(item.quantity).toLocaleString("fa-IR")}</span>

        <button
          type="button"
          data-cart-change="1"
          data-product-id="${escapeHTML(product.id)}"
        >+</button>

        <button
          type="button"
          data-cart-remove="${escapeHTML(product.id)}"
        >حذف</button>
      </div>
    `;

    container.appendChild(row);
  });
}

// =====================================================
// 10. CART EVENT DELEGATION
// =====================================================

$("productsGrid")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-product]");
  if (!button) return;

  addToCart(button.dataset.addProduct);
});

$("cartItems")?.addEventListener("click", (event) => {
  const changeButton = event.target.closest("[data-cart-change]");
  const removeButton = event.target.closest("[data-cart-remove]");

  if (changeButton) {
    changeCartQuantity(
      changeButton.dataset.productId,
      Number(changeButton.dataset.cartChange)
    );
  }

  if (removeButton) {
    removeFromCart(removeButton.dataset.cartRemove);
  }
});

// =====================================================
// 11. OPEN / CLOSE CART
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

// =====================================================
// 12. CHECKOUT
// =====================================================

$("checkoutButton")?.addEventListener("click", () => {
  if (!cart.length) {
    notify("سبد خرید شما خالی است.", "error");
    return;
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

$("checkoutModal")?.addEventListener("click", (event) => {
  if (event.target === $("checkoutModal")) {
    hideElement("checkoutModal");
  }
});

// =====================================================
// 13. CREATE ORDER
// =====================================================

$("checkoutForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cart.length) {
    notify("سبد خرید شما خالی است.", "error");
    return;
  }

  const button = $("submitOrderButton");
  setLoading(button, true, "در حال ثبت سفارش...");

  try {
    const customerName = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const city = $("customerCity").value.trim();
    const address = $("customerAddress").value.trim();
    const postalCode = $("customerPostalCode").value.trim();

    if (!customerName || !phone || !address) {
      throw new Error("لطفاً اطلاعات ضروری را کامل کنید.");
    }

    const items = cart.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity)
    }));

    const { data, error } = await db.rpc("create_order", {
      p_customer_name: customerName,
      p_phone: phone,
      p_city: city,
      p_address: address,
      p_postal_code: postalCode,
      p_items: items
    });

    if (error) throw error;

    currentOrderId =
      typeof data === "string"
        ? data
        : data?.id || data?.order_id || data?.[0]?.id || null;

    if (!currentOrderId) {
      throw new Error(
        "سفارش ثبت شد، اما شناسه سفارش دریافت نشد. با مدیریت فروشگاه تماس بگیرید."
      );
    }

    cart = [];
    saveCart();
    updateCart();

    $("checkoutForm").reset();
    hideElement("checkoutModal");

    await loadPaymentDetails();

    showElement("paymentModal");

    notify("سفارش شما با موفقیت ثبت شد.");

    await loadProducts();

  } catch (error) {
    console.error("Checkout error:", error);
    notify(error.message || "ثبت سفارش انجام نشد.", "error");
  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// 14. PAYMENT SETTINGS
// =====================================================

async function loadPaymentDetails() {
  const container = $("paymentDetails");
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت اطلاعات پرداخت...</p>";

  const { data, error } = await db.rpc(
    "get_public_payment_settings"
  );

  if (error) {
    console.error("Payment settings error:", error);

    container.innerHTML =
      '<p class="empty-message">دریافت اطلاعات پرداخت با مشکل مواجه شد. با فروشگاه تماس بگیرید.</p>';

    return;
  }

  currentPaymentSettings = Array.isArray(data) ? data[0] : data;

  const settings = currentPaymentSettings || {};

  container.innerHTML = `
    <div class="payment-info">
      <p><strong>فروشگاه:</strong> ${escapeHTML(settings.store_name || "GILDA SHOP")}</p>

      <p><strong>بانک:</strong> ${escapeHTML(settings.bank_name || "ثبت نشده")}</p>

      <p><strong>شماره کارت:</strong></p>

      <strong class="card-number">
        ${escapeHTML(formatCardNumber(settings.card_number || "شماره کارت ثبت نشده"))}
      </strong>

      <p><strong>صاحب حساب:</strong> ${escapeHTML(settings.account_holder || "ثبت نشده")}</p>

      <p>${escapeHTML(settings.payment_note || "")}</p>
    </div>

    <p class="payment-warning">
      لطفاً پس از واریز، اطلاعات پرداخت را نزد خود نگه دارید.
    </p>

    <p><strong>شماره سفارش:</strong> ${escapeHTML(currentOrderId || "")}</p>
  `;
}

$("closePayment")?.addEventListener("click", () => {
  hideElement("paymentModal");
});

$("paymentModal")?.addEventListener("click", (event) => {
  if (event.target === $("paymentModal")) {
    hideElement("paymentModal");
  }
});

// =====================================================
// 15. RECEIPT UPLOAD
// =====================================================

// ارسال رسید عمداً غیرفعال است.
// برای فعال‌سازی امن آن باید یک endpoint یا Edge Function
// با کنترل دسترسی سفارش ساخته شود.

$("uploadReceiptButton")?.addEventListener("click", () => {
  notify(
    "ارسال رسید هنوز فعال نشده است. لطفاً رسید را برای مدیریت فروشگاه ارسال کنید.",
    "error"
  );
});

// =====================================================
// 16. ADMIN AUTHENTICATION
// =====================================================

async function verifyAdmin(user) {
  if (!user) return false;

  const { data, error } = await db.rpc("is_admin");

  if (error) {
    console.error("Admin verification error:", error);
    return false;
  }

  return data === true;
}

async function openAdminPanel() {
  if (!currentUser) {
    showLogin();
    return;
  }

  const isAdmin = await verifyAdmin(currentUser);

  if (!isAdmin) {
    await db.auth.signOut();
    currentUser = null;
    showLogin();
    notify("این حساب دسترسی مدیریت ندارد.", "error");
    return;
  }

  showDashboard();

  await Promise.all([
    loadAdminProducts(),
    loadAdminOrders(),
    loadAdminSettings()
  ]);
}

$("adminAccessButton")?.addEventListener("click", openAdminPanel);

// =====================================================
// 17. ADMIN LOGIN FORM
// =====================================================

$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = event.submitter;
  setLoading(button, true, "در حال ورود...");

  try {
    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    const isAdmin = await verifyAdmin(currentUser);

    if (!isAdmin) {
      await db.auth.signOut();
      currentUser = null;
      throw new Error("این حساب اجازه ورود به پنل مدیریت را ندارد.");
    }

    $("loginForm").reset();

    showDashboard();

    await Promise.all([
      loadAdminProducts(),
      loadAdminOrders(),
      loadAdminSettings()
    ]);

    notify("ورود موفقیت‌آمیز بود.");

  } catch (error) {
    console.error("Login error:", error);
    setMessage(
      "loginMessage",
      error.message || "ورود ناموفق بود.",
      true
    );
  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// 18. AUTH STATE
// =====================================================

db.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
});

// =====================================================
// 19. LOGOUT
// =====================================================

$("logoutButton")?.addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    notify("خروج انجام نشد.", "error");
    console.error(error);
    return;
  }

  currentUser = null;
  showStore();
  notify("از حساب مدیریت خارج شدید.");
});

// =====================================================
// 20. ADMIN TABS
// =====================================================

document.querySelectorAll(".admin-tab").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    document.querySelectorAll(".admin-section").forEach((section) => {
      section.classList.remove("active");
    });

    button.classList.add("active");

    const target = $(button.dataset.tab);

    if (target) {
      target.classList.add("active");
    }

    if (button.dataset.tab === "productsAdmin") {
      await loadAdminProducts();
    }

    if (button.dataset.tab === "ordersAdmin") {
      await loadAdminOrders();
    }

    if (button.dataset.tab === "settingsAdmin") {
      await loadAdminSettings();
    }
  });
});

// =====================================================
// 21. ADMIN PRODUCTS
// =====================================================

async function loadAdminProducts() {
  const container = $("adminProductsList");
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت محصولات...</p>";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin products error:", error);
    container.innerHTML =
      "<p>دریافت محصولات ناموفق بود. دسترسی مدیریت را بررسی کنید.</p>";
    return;
  }

  if (!data?.length) {
    container.innerHTML = "<p>هنوز محصولی ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = "";

  for (const product of data) {
    const row = document.createElement("div");
    row.className = "admin-product-item";

    row.innerHTML = `
      <div class="admin-product-info">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${money(product.price_toman)}</span>
        <small>موجودی: ${Number(product.stock).toLocaleString("fa-IR")}</small>
        <small>${product.is_active ? "فعال" : "غیرفعال"}</small>
      </div>

      <div class="admin-item-actions">
        <button
          type="button"
          data-edit-product="${escapeHTML(product.id)}"
        >ویرایش</button>

        <button
          type="button"
          data-toggle-product="${escapeHTML(product.id)}"
          data-active="${product.is_active ? "true" : "false"}"
        >${product.is_active ? "غیرفعال کردن" : "فعال کردن"}</button>

        <button
          type="button"
          data-delete-product="${escapeHTML(product.id)}"
        >حذف</button>
      </div>
    `;

    container.appendChild(row);
  }
}

// =====================================================
// 22. PRODUCT IMAGE UPLOAD
// =====================================================

async function uploadProductImage(file) {
  if (!file) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("فرمت تصویر باید JPG، PNG یا WEBP باشد.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("حجم تصویر نباید بیشتر از ۵ مگابایت باشد.");
  }

  const extension = file.name.split(".").pop().toLowerCase();

  const path =
    Date.now() + "-" +
    Math.random().toString(36).slice(2) +
    "." + extension;

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
// 23. SAVE PRODUCT
// =====================================================

$("productForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = event.submitter;
  setLoading(button, true, "در حال ذخیره...");

  try {
    const id = $("productId").value;
    const name = $("productName").value.trim();
    const category = $("productCategory").value;
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);
    const description = $("productDescription").value.trim();
    const file = $("productImage").files[0];

    if (!name || !category || price <= 0 || stock < 0) {
      throw new Error("اطلاعات محصول را بررسی کنید.");
    }

    let imagePath = null;

    if (file) {
      imagePath = await uploadProductImage(file);
    }

    const productData = {
      name,
      slug: slugify(name),
      category,
      price_toman: price,
      stock,
      description,
      is_active: true
    };

    if (imagePath) {
      productData.image_url = imagePath;
    }

    let result;

    if (id) {
      result = await db
        .from("products")
        .update(productData)
        .eq("id", id);
    } else {
      result = await db
        .from("products")
        .insert(productData);
    }

    if (result.error) throw result.error;

    $("productForm").reset();
    $("productId").value = "";

    hideElement("cancelEdit");

    setMessage("productMessage", "محصول با موفقیت ذخیره شد.");

    await loadAdminProducts();
    await loadProducts();

    notify("محصول ذخیره شد.");

  } catch (error) {
    console.error("Save product error:", error);

    setMessage(
      "productMessage",
      error.message || "ذخیره محصول ناموفق بود.",
      true
    );
  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// 24. EDIT / DELETE / TOGGLE PRODUCT
// =====================================================

$("adminProductsList")?.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-product]");
  const deleteButton = event.target.closest("[data-delete-product]");
  const toggleButton = event.target.closest("[data-toggle-product]");

  if (editButton) {
    const product = products.find(
      (item) => String(item.id) === String(editButton.dataset.editProduct)
    );

    let selectedProduct = product;

    if (!selectedProduct) {
      const { data, error } = await db
        .from("products")
        .select("*")
        .eq("id", editButton.dataset.editProduct)
        .single();

      if (error) {
        notify("دریافت اطلاعات محصول ناموفق بود.", "error");
        return;
      }

      selectedProduct = data;
    }

    $("productId").value = selectedProduct.id;
    $("productName").value = selectedProduct.name;
    $("productCategory").value = selectedProduct.category;
    $("productPrice").value = selectedProduct.price_toman;
    $("productStock").value = selectedProduct.stock;
    $("productDescription").value = selectedProduct.description || "";

    showElement("cancelEdit");

    $("productForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  if (deleteButton) {
    if (!confirm("آیا از حذف این محصول مطمئن هستید؟")) return;

    const { error } = await db
      .from("products")
      .delete()
      .eq("id", deleteButton.dataset.deleteProduct);

    if (error) {
      console.error(error);
      notify("حذف محصول ناموفق بود.", "error");
      return;
    }

    notify("محصول حذف شد.");

    await loadAdminProducts();
    await loadProducts();
  }

  if (toggleButton) {
    const currentState = toggleButton.dataset.active === "true";

    const { error } = await db
      .from("products")
      .update({ is_active: !currentState })
      .eq("id", toggleButton.dataset.toggleProduct);

    if (error) {
      console.error(error);
      notify("تغییر وضعیت محصول ناموفق بود.", "error");
      return;
    }

    notify("وضعیت محصول تغییر کرد.");

    await loadAdminProducts();
    await loadProducts();
  }
});

$("cancelEdit")?.addEventListener("click", () => {
  $("productForm")?.reset();
  $("productId").value = "";
  hideElement("cancelEdit");
});

// =====================================================
// 25. ADMIN ORDERS
// =====================================================

const orderStatuses = {
  pending: "در انتظار بررسی",
  confirmed: "تأیید شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده"
};

async function loadAdminOrders() {
  const container = $("adminOrdersList");
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت سفارش‌ها...</p>";

  const { data, error } = await db
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Orders error:", error);
    container.innerHTML =
      "<p>دریافت سفارش‌ها ناموفق بود. دسترسی مدیریت را بررسی کنید.</p>";
    return;
  }

  if (!data?.length) {
    container.innerHTML = "<p>هنوز سفارشی ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = "";

  data.forEach((order) => {
    const card = document.createElement("div");
    card.className = "admin-order-item";

    const items = (order.order_items || []).map((item) => `
      <li>
        ${escapeHTML(item.product_name)}
        × ${Number(item.quantity).toLocaleString("fa-IR")}
        — ${money(item.unit_price_toman)}
      </li>
    `).join("");

    const statusOptions = Object.entries(orderStatuses).map(
      ([value, label]) => `
        <option
          value="${value}"
          ${order.status === value ? "selected" : ""}
        >${label}</option>
      `
    ).join("");

    card.innerHTML = `
      <div class="admin-order-heading">
        <strong>سفارش ${escapeHTML(order.id)}</strong>
        <span>${money(order.total_toman)}</span>
      </div>

      <p><strong>مشتری:</strong> ${escapeHTML(order.customer_name)}</p>
      <p><strong>موبایل:</strong> ${escapeHTML(order.phone)}</p>
      <p><strong>شهر:</strong> ${escapeHTML(order.city || "-")}</p>
      <p><strong>آدرس:</strong> ${escapeHTML(order.address || "-")}</p>
      <p><strong>کد پستی:</strong> ${escapeHTML(order.postal_code || "-")}</p>

      <p><strong>محصولات:</strong></p>
      <ul>${items}</ul>

      <div class="order-status-control">
        <label>وضعیت سفارش:</label>

        <select data-order-status="${escapeHTML(order.id)}">
          ${statusOptions}
        </select>

        <button
          type="button"
          data-save-order="${escapeHTML(order.id)}"
        >ذخیره وضعیت</button>
      </div>
    `;

    container.appendChild(card);
  });
}

// =====================================================
// 26. UPDATE ORDER STATUS
// =====================================================

$("adminOrdersList")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-order]");
  if (!button) return;

  const orderId = button.dataset.saveOrder;

  const select = document.querySelector(
    `[data-order-status="${CSS.escape(orderId)}"]`
  );

  if (!select) return;

  const status = select.value;

  const { error } = await db
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    console.error("Order update error:", error);
    notify("تغییر وضعیت سفارش ناموفق بود.", "error");
    return;
  }

  notify("وضعیت سفارش ذخیره شد.");

  await loadAdminOrders();
});

// =====================================================
// 27. STORE SETTINGS
// =====================================================

async function loadAdminSettings() {
  const { data, error } = await db
    .from("store_settings")
    .select("*")
    .eq("id", "main")
    .maybeSingle();

  if (error) {
    console.error("Settings load error:", error);
    setMessage(
      "settingsMessage",
      "دریافت تنظیمات ناموفق بود.",
      true
    );
    return;
  }

  if (!data) return;

  $("settingStoreName").value = data.store_name || "";
  $("settingBankName").value = data.bank_name || "";
  $("settingCardNumber").value = data.card_number || "";
  $("settingAccountHolder").value = data.account_holder || "";
  $("settingPaymentNote").value = data.payment_note || "";
}

// =====================================================
// 28. SAVE STORE SETTINGS
// =====================================================

$("settingsForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = event.submitter;
  setLoading(button, true, "در حال ذخیره...");

  try {
    const settings = {
      id: "main",
      store_name: $("settingStoreName").value.trim(),
      bank_name: $("settingBankName").value.trim(),
      card_number: $("settingCardNumber").value.trim(),
      account_holder: $("settingAccountHolder").value.trim(),
      payment_note: $("settingPaymentNote").value.trim(),
      updated_at: new Date().toISOString()
    };

    const { error } = await db
      .from("store_settings")
      .upsert(settings, { onConflict: "id" });

    if (error) throw error;

    setMessage("settingsMessage", "تنظیمات ذخیره شد.");
    notify("تنظیمات فروشگاه ذخیره شد.");

  } catch (error) {
    console.error("Settings save error:", error);

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
// 29. GLOBAL ERROR HANDLING
// =====================================================

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

window.addEventListener("error", (event) => {
  console.error("Application error:", event.message);
});

// =====================================================
// 30. INITIALIZE
// =====================================================

async function initialize() {
  // سازگاری با کلاس‌های نمایش و مخفی‌سازی
  if (!document.getElementById("gilda-hidden-style")) {
    const style = document.createElement("style");
    style.id = "gilda-hidden-style";
    style.textContent = ".hidden{display:none!important}";
    document.head.appendChild(style);
  }

  hideElement("adminLogin");
  hideElement("adminDashboard");
  hideElement("cartOverlay");
  hideElement("cartPanel");
  hideElement("checkoutModal");
  hideElement("paymentModal");
  hideElement("cancelEdit");

  showStore();

  updateCart();

  await loadProducts();

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    return;
  }

  currentUser = data.session?.user || null;
}

initialize().catch((error) => {
  console.error("Initialization error:", error);
  notify("راه‌اندازی فروشگاه با مشکل مواجه شد.", "error");
});

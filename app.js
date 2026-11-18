
/* =========================================
   GILDA SHOP - COMPLETE APPLICATION
   Supabase | Store | Cart | Checkout | Admin
========================================= */

// =========================================
// 1. SUPABASE CONNECTION
// =========================================

const SUPABASE_URL = "https://uxigmkbctofiezcfvcyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_IjnHzzq4DqQl34qQwBmjsA_O-ncAcmn";

if (!window.supabase) {
  throw new Error("Supabase library is not loaded.");
}

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =========================================
// 2. GLOBAL VARIABLES
// =========================================

const $ = id => document.getElementById(id);

let currentUser = null;
let cart = [];
let productsCache = [];
let currentCategory = "all";
let currentOrderId = null;
let lastOrderTotal = 0;
let authCheckInProgress = false;

const ORDER_STATUSES = {
  pending: "در انتظار بررسی",
  confirmed: "تأیید شده",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده"
};

const CATEGORY_NAMES = {
  tshirt: "تیشرت",
  hoodie: "هودی",
  hat: "کلاه",
  belt: "کمربند"
};

// =========================================
// 3. HELPERS
// =========================================

function money(value) {
  return Number(value || 0).toLocaleString("fa-IR");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function makeSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
    + "-" + Date.now().toString(36);
}

function setMessage(id, message) {
  const element = $(id);
  if (element) element.textContent = message;
}

function showElement(id) {
  $(id)?.classList.remove("hidden");
}

function hideElement(id) {
  $(id)?.classList.add("hidden");
}

function formatDate(value) {
  if (!value) return "نامشخص";

  return new Date(value).toLocaleString("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function validUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function saveCart() {
  localStorage.setItem("gilda-cart", JSON.stringify(cart));
  renderCart();
}

function loadSavedCart() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("gilda-cart") || "[]"
    );

    if (!Array.isArray(saved)) {
      cart = [];
      return;
    }

    cart = saved
      .filter(item => validUUID(item.id))
      .map(item => ({
        id: item.id,
        name: String(item.name || "محصول"),
        price: Math.max(0, Number(item.price) || 0),
        quantity: Math.min(
          100,
          Math.max(1, Math.floor(Number(item.quantity) || 1))
        ),
        stock: Math.max(0, Number(item.stock) || 0)
      }));
  } catch {
    cart = [];
  }
}

// =========================================
// 4. PAGE NAVIGATION
// =========================================

function showStore() {
  hideElement("adminLogin");
  hideElement("adminDashboard");

  document.querySelector("main")?.classList.remove("hidden");
  document.querySelector("header")?.classList.remove("hidden");
  document.querySelector("footer")?.classList.remove("hidden");

  showElement("adminAccessButton");

  window.scrollTo(0, 0);
}

function showLogin() {
  document.querySelector("main")?.classList.add("hidden");
  document.querySelector("header")?.classList.add("hidden");
  document.querySelector("footer")?.classList.add("hidden");

  showElement("adminLogin");
  hideElement("adminDashboard");
  hideElement("adminAccessButton");

  setMessage("loginMessage", "");
  window.scrollTo(0, 0);
}

function showDashboard() {
  hideElement("adminLogin");
  showElement("adminDashboard");

  document.querySelector("main")?.classList.add("hidden");
  document.querySelector("header")?.classList.add("hidden");
  document.querySelector("footer")?.classList.add("hidden");

  hideElement("adminAccessButton");

  window.scrollTo(0, 0);
}

window.showStore = showStore;
window.showLogin = showLogin;
window.showDashboard = showDashboard;

// =========================================
// 5. ADMIN AUTHENTICATION
// =========================================

async function verifyAdmin() {
  if (!currentUser) return false;

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error || !data) {
    currentUser = null;

    await db.auth.signOut();

    showStore();
    notify("این حساب دسترسی مدیریت ندارد.");

    return false;
  }

  return true;
}

async function openAdminPanel() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (!data.session) {
      showLogin();
      return;
    }

    currentUser = data.session.user;

    if (await verifyAdmin()) {
      showDashboard();
      await loadAdminProducts();
      await loadOrders();
      await loadSettings();
    }
  } catch (error) {
    console.error(error);
    notify("خطا در باز کردن پنل مدیریت.");
  }
}

$("adminAccessButton")?.addEventListener(
  "click",
  openAdminPanel
);

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;

  if (!email || !password) {
    setMessage("loginMessage", "ایمیل و رمز عبور را وارد کن.");
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;

  setMessage("loginMessage", "در حال ورود...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    if (!(await verifyAdmin())) return;

    setMessage("loginMessage", "");
    showDashboard();

    await loadAdminProducts();
    await loadOrders();
    await loadSettings();

    notify("ورود موفقیت‌آمیز بود.");
  } catch (error) {
    console.error(error);
    setMessage(
      "loginMessage",
      "ورود ناموفق بود. ایمیل و رمز عبور را بررسی کن."
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("logoutButton")?.addEventListener("click", async () => {
  try {
    await db.auth.signOut();
    currentUser = null;
    showStore();
    notify("از حساب مدیریت خارج شدی.");
  } catch (error) {
    console.error(error);
    notify("خروج ناموفق بود.");
  }
});

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    showStore();
  }

  if (event === "SIGNED_IN" && session?.user) {
    currentUser = session.user;
  }
});

// =========================================
// 6. IMAGE STORAGE
// =========================================

async function getImageUrl(path) {
  if (!path) return "";

  const { data, error } = await db.storage
    .from("product-images")
    .createSignedUrl(path, 3600);

  if (error) {
    console.error("Image URL error:", error);
    return "";
  }

  return data?.signedUrl || "";
}

async function uploadImage(file) {
  if (!file) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("فرمت عکس باید JPG، PNG یا WEBP باشد.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("حجم عکس نباید بیشتر از ۵ مگابایت باشد.");
  }

  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  const path = `${crypto.randomUUID()}.${extensions[file.type]}`;

  const { error } = await db.storage
    .from("product-images")
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  return path;
}

// =========================================
// 7. STORE PRODUCTS
// =========================================

async function loadProducts() {
  const grid = $("productsGrid");
  if (!grid) return;

  grid.textContent = "در حال دریافت محصولات...";

  try {
    const { data, error } = await db
      .from("products")
      .select(
        "id,name,slug,category,price_toman,stock,image_url,description,is_active,created_at"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    productsCache = data || [];

    let products = [...productsCache];

    if (currentCategory !== "all") {
      products = products.filter(
        product => product.category === currentCategory
      );
    }

    if (!products.length) {
      grid.textContent = "در این دسته محصولی ثبت نشده است.";
      return;
    }

    grid.innerHTML = "";

    for (const product of products) {
      const image = await getImageUrl(product.image_url);

      const card = document.createElement("article");
      card.className = "product-card";

      card.innerHTML = `
        <div class="product-image">
          ${
            image
              ? `<img src="${escapeHTML(image)}"
                  alt="${escapeHTML(product.name)}"
                  loading="lazy">`
              : `<span class="product-placeholder">GILDA SHOP</span>`
          }
        </div>

        <div class="product-info">
          <h3>${escapeHTML(product.name)}</h3>

          <p class="product-price">
            ${money(product.price_toman)} تومان
          </p>

          <p>
            ${product.stock > 0
              ? `موجودی: ${money(product.stock)}`
              : "ناموجود"
            }
          </p>

          ${
            product.description
              ? `<p>${escapeHTML(product.description)}</p>`
              : ""
          }

          <button
            class="main-btn"
            data-add="${escapeHTML(product.id)}"
            ${product.stock <= 0 ? "disabled" : ""}
          >
            ${product.stock > 0 ? "افزودن به سبد خرید" : "ناموجود"}
          </button>
        </div>
      `;

      grid.appendChild(card);
    }
  } catch (error) {
    console.error("Products error:", error);
    grid.textContent = "دریافت محصولات ناموفق بود.";
  }
}

document.querySelectorAll(".category-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category-btn").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    currentCategory = button.dataset.category || "all";

    loadProducts();
  });
});

// =========================================
// 8. SHOPPING CART
// =========================================

function renderCart() {
  const cartItems = $("cartItems");
  if (!cartItems) return;

  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  $("cartCount").textContent = money(totalQuantity);

  cartItems.innerHTML = "";

  let total = 0;

  if (!cart.length) {
    cartItems.textContent = "سبد خرید خالی است.";
  }

  cart.forEach(item => {
    total += item.price * item.quantity;

    const row = document.createElement("div");
    row.className = "cart-item";

    row.innerHTML = `
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <p>${money(item.price)} تومان</p>
      </div>

      <div class="cart-item-controls">
        <button data-cart-action="minus"
          data-id="${escapeHTML(item.id)}">−</button>

        <span>${money(item.quantity)}</span>

        <button data-cart-action="plus"
          data-id="${escapeHTML(item.id)}">+</button>

        <button data-cart-action="remove"
          data-id="${escapeHTML(item.id)}">حذف</button>
      </div>
    `;

    cartItems.appendChild(row);
  });

  $("cartTotal").textContent = money(total);
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    if (existing.quantity >= product.stock) {
      notify("موجودی کافی نیست.");
      return;
    }

    existing.quantity++;
    existing.stock = product.stock;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price_toman),
      quantity: 1,
      stock: Number(product.stock)
    });
  }

  saveCart();
  notify("محصول به سبد خرید اضافه شد.");
}

$("productsGrid")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  button.disabled = true;

  try {
    const { data, error } = await db
      .from("products")
      .select("id,name,price_toman,stock,is_active")
      .eq("id", button.dataset.add)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data || data.stock <= 0) {
      notify("این محصول موجود نیست.");
      await loadProducts();
      return;
    }

    addToCart(data);
  } catch (error) {
    console.error(error);
    notify("افزودن محصول ناموفق بود.");
  } finally {
    button.disabled = false;
  }
});

$("cartItems")?.addEventListener("click", event => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.cartAction;
  const item = cart.find(product => product.id === id);

  if (!item) return;

  if (action === "plus") {
    if (item.quantity >= item.stock) {
      notify("موجودی کافی نیست.");
      return;
    }

    item.quantity++;
  }

  if (action === "minus") {
    item.quantity--;

    if (item.quantity <= 0) {
      cart = cart.filter(product => product.id !== id);
    }
  }

  if (action === "remove") {
    cart = cart.filter(product => product.id !== id);
  }

  saveCart();
});

$("cartButton")?.addEventListener("click", () => {
  showElement("cartOverlay");
  showElement("cartPanel");
});

$("closeCart")?.addEventListener("click", closeCart);

$("cartOverlay")?.addEventListener("click", closeCart);

function closeCart() {
  hideElement("cartOverlay");
  hideElement("cartPanel");
}

// =========================================
// 9. CHECKOUT
// =========================================

$("checkoutButton")?.addEventListener("click", () => {
  if (!cart.length) {
    notify("سبد خرید خالی است.");
    return;
  }

  closeCart();

  let total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  $("checkoutTotal").textContent = money(total);

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

$("checkoutForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!cart.length) {
    notify("سبد خرید خالی است.");
    return;
  }

  const submitButton = $("submitOrderButton");
  submitButton.disabled = true;
  submitButton.textContent = "در حال ثبت سفارش...";

  try {
    const customerName = $("customerName").value.trim();
    const phone = $("customerPhone").value.trim();
    const city = $("customerCity").value.trim();
    const postalCode = $("customerPostalCode").value.trim();
    const address = $("customerAddress").value.trim();

    if (customerName.length < 2) {
      throw new Error("نام و نام خانوادگی معتبر نیست.");
    }

    if (phone.length < 10 || phone.length > 20) {
      throw new Error("شماره تماس معتبر نیست.");
    }

    if (address.length < 5) {
      throw new Error("آدرس کامل را وارد کن.");
    }

    // Only product IDs and quantities are sent.
    // Prices are calculated securely by PostgreSQL.

    const items = cart.map(item => ({
      product_id: item.id,
      quantity: item.quantity
    }));

    lastOrderTotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const { data, error } = await db.rpc("create_order", {
      p_customer_name: customerName,
      p_phone: phone,
      p_city: city,
      p_address: address,
      p_postal_code: postalCode,
      p_items: items
    });

    if (error) throw error;

    currentOrderId = data;

    if (!currentOrderId) {
      throw new Error("شماره سفارش دریافت نشد.");
    }

    cart = [];
    saveCart();

    $("checkoutForm").reset();
    hideElement("checkoutModal");

    await loadProducts();

    await showPaymentDetails();

    showElement("paymentModal");

    notify("سفارش با موفقیت ثبت شد.");
  } catch (error) {
    console.error("Checkout error:", error);

    notify(
      error.message || "ثبت سفارش ناموفق بود. دوباره تلاش کن."
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "ثبت سفارش";
  }
});

// =========================================
// 10. PAYMENT SETTINGS / CARD TO CARD
// =========================================

async function showPaymentDetails() {
  const container = $("paymentDetails");
  if (!container) return;

  container.textContent = "در حال دریافت اطلاعات پرداخت...";

  try {
    const { data, error } = await db.rpc(
      "get_public_payment_settings"
    );

    if (error) throw error;

    const settings = Array.isArray(data) ? data[0] : data;

    if (!settings) {
      container.textContent =
        "اطلاعات پرداخت هنوز توسط مدیر فروشگاه ثبت نشده است.";
      return;
    }

    const cardNumber = settings.card_number || "";
    const accountHolder = settings.account_holder || "";
    const bankName = settings.bank_name || "";
    const paymentNote = settings.payment_note || "";
    const storeName = settings.store_name || "GILDA SHOP";

    container.innerHTML = `
      <h3>${escapeHTML(storeName)}</h3>

      <p>شماره سفارش:</p>
      <strong>${escapeHTML(currentOrderId)}</strong>

      <p>مبلغ سفارش:</p>
      <strong>${money(lastOrderTotal)} تومان</strong>

      <div class="payment-card">
        <p>شماره کارت:</p>
        <strong>${cardNumber
          ? escapeHTML(cardNumber)
          : "هنوز ثبت نشده است"
        }</strong>

        <p>صاحب حساب:</p>
        <strong>${escapeHTML(accountHolder || "ثبت نشده")}</strong>

        <p>بانک:</p>
        <strong>${escapeHTML(bankName || "ثبت نشده")}</strong>
      </div>

      ${
        paymentNote
          ? `<p>${escapeHTML(paymentNote)}</p>`
          : ""
      }

      ${
        !cardNumber
          ? `<p>مدیر فروشگاه هنوز شماره کارت را ثبت نکرده است.</p>`
          : `<p>پس از پرداخت، رسید را طبق هماهنگی فروشگاه ارسال کن.</p>`
      }
    `;
  } catch (error) {
    console.error("Payment settings error:", error);

    container.textContent =
      "دریافت اطلاعات پرداخت ناموفق بود.";
  }

  // Receipt upload remains disabled until a secure upload
  // endpoint is implemented on the server.
  const uploadButton = $("uploadReceiptButton");

  if (uploadButton) {
    uploadButton.disabled = true;
    uploadButton.textContent = "ارسال رسید (به‌زودی)";
  }

  const receiptFile = $("receiptFile");
  if (receiptFile) receiptFile.disabled = true;
}

$("closePayment")?.addEventListener("click", () => {
  hideElement("paymentModal");
});

// =========================================
// 11. ADMIN PRODUCTS
// =========================================

async function loadAdminProducts() {
  const list = $("adminProductsList");
  if (!list) return;

  list.textContent = "در حال دریافت محصولات...";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    list.innerHTML = "";

    if (!data || !data.length) {
      list.textContent = "هنوز محصولی ثبت نشده است.";
      return;
    }

    for (const product of data) {
      const image = await getImageUrl(product.image_url);

      const row = document.createElement("div");
      row.className = "admin-product-item";

      row.innerHTML = `
        ${
          image
            ? `<img src="${escapeHTML(image)}" alt="">`
            : `<div class="product-placeholder">GILDA</div>`
        }

        <div>
          <strong>${escapeHTML(product.name)}</strong>
          <p>${money(product.price_toman)} تومان</p>
          <p>موجودی: ${money(product.stock)}</p>
          <p>${product.is_active ? "فعال" : "غیرفعال"}</p>
        </div>

        <div class="admin-actions">
          <button data-edit="${escapeHTML(product.id)}">
            ویرایش
          </button>

          <button class="delete-btn"
            data-delete="${escapeHTML(product.id)}">
            حذف
          </button>
        </div>
      `;

      list.appendChild(row);
    }
  } catch (error) {
    console.error(error);
    list.textContent = "خطا در دریافت محصولات.";
  }
}

$("productForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !(await verifyAdmin())) return;

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;

  setMessage("productMessage", "در حال ذخیره محصول...");

  let uploadedImagePath = null;

  try {
    const id = $("productId").value;
    const name = $("productName").value.trim();
    const category = $("productCategory").value;
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);
    const description = $("productDescription").value.trim();
    const file = $("productImage").files[0];

    if (!name || name.length > 150) {
      throw new Error("نام محصول معتبر نیست.");
    }

    if (!Object.keys(CATEGORY_NAMES).includes(category)) {
      throw new Error("دسته‌بندی محصول معتبر نیست.");
    }

    if (!Number.isSafeInteger(price) || price <= 0) {
      throw new Error("قیمت محصول معتبر نیست.");
    }

    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
      throw new Error("موجودی محصول معتبر نیست.");
    }

    if (file) {
      uploadedImagePath = await uploadImage(file);
    }

    const values = {
      name,
      category,
      price_toman: price,
      stock,
      description
    };

    if (id) {
      if (uploadedImagePath) {
        values.image_url = uploadedImagePath;
      }

      const { error } = await db
        .from("products")
        .update(values)
        .eq("id", id);

      if (error) throw error;

      notify("محصول ویرایش شد.");
    } else {
      values.slug = makeSlug(name);
      values.image_url = uploadedImagePath;
      values.is_active = true;

      const { error } = await db
        .from("products")
        .insert(values);

      if (error) throw error;

      notify("محصول جدید اضافه شد.");
    }

    $("productForm").reset();
    $("productId").value = "";
    hideElement("cancelEdit");

    setMessage("productMessage", "");

    await loadAdminProducts();
    await loadProducts();

  } catch (error) {
    console.error("Product save error:", error);

    // Remove an uploaded image if the database save failed.
    if (uploadedImagePath) {
      await db.storage
        .from("product-images")
        .remove([uploadedImagePath]);
    }

    setMessage(
      "productMessage",
      error.message || "ذخیره محصول ناموفق بود."
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("adminProductsList")?.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (!editButton && !deleteButton) return;
  if (!currentUser || !(await verifyAdmin())) return;

  if (editButton) {
    try {
      const { data, error } = await db
        .from("products")
        .select("*")
        .eq("id", editButton.dataset.edit)
        .single();

      if (error) throw error;

      $("productId").value = data.id;
      $("productName").value = data.name;
      $("productCategory").value = data.category;
      $("productPrice").value = data.price_toman;
      $("productStock").value = data.stock;
      $("productDescription").value = data.description || "";
      $("productImage").value = "";

      showElement("cancelEdit");

      $("productForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } catch (error) {
      console.error(error);
      notify("دریافت اطلاعات محصول ناموفق بود.");
    }
  }

  if (deleteButton) {
    if (!confirm("از حذف این محصول مطمئنی؟")) return;

    try {
      const { data: product, error: readError } = await db
        .from("products")
        .select("image_url")
        .eq("id", deleteButton.dataset.delete)
        .single();

      if (readError) throw readError;

      const { error } = await db
        .from("products")
        .delete()
        .eq("id", deleteButton.dataset.delete);

      if (error) throw error;

      if (product?.image_url) {
        await db.storage
          .from("product-images")
          .remove([product.image_url]);
      }

      notify("محصول حذف شد.");

      await loadAdminProducts();
      await loadProducts();
    } catch (error) {
      console.error(error);
      notify("حذف محصول ناموفق بود.");
    }
  }
});

$("cancelEdit")?.addEventListener("click", () => {
  $("productForm").reset();
  $("productId").value = "";
  hideElement("cancelEdit");
  setMessage("productMessage", "");
});

// =========================================
// 12. ADMIN ORDERS
// =========================================

async function loadOrders() {
  const list = $("adminOrdersList");
  if (!list) return;

  list.textContent = "در حال دریافت سفارش‌ها...";

  if (!currentUser || !(await verifyAdmin())) return;

  try {
    const { data, error } = await db
      .from("orders")
      .select(`
        id,
        customer_name,
        phone,
        city,
        address,
        postal_code,
        status,
        total_toman,
        created_at,
        receipt_path,
        order_items (
          product_name,
          unit_price_toman,
          quantity
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    list.innerHTML = "";

    if (!data || !data.length) {
      list.textContent = "هنوز سفارشی ثبت نشده است.";
      return;
    }

    for (const order of data) {
      const row = document.createElement("div");
      row.className = "admin-order-item";

      const itemsHTML = (order.order_items || []).map(item => `
        <li>
          ${escapeHTML(item.product_name)}
          — تعداد: ${money(item.quantity)}
          — ${money(item.unit_price_toman)} تومان
        </li>
      `).join("");

      let receiptHTML = "";

      if (order.receipt_path) {
        const { data: receiptData } = await db.storage
          .from("payment-receipts")
          .createSignedUrl(order.receipt_path, 300);

        if (receiptData?.signedUrl) {
          receiptHTML = `
            <p>
              <a href="${escapeHTML(receiptData.signedUrl)}"
                target="_blank" rel="noopener noreferrer">
                مشاهده رسید پرداخت
              </a>
            </p>
          `;
        }
      }

      row.innerHTML = `
        <div>
          <strong>${escapeHTML(order.customer_name)}</strong>

          <p>شماره سفارش: ${escapeHTML(order.id)}</p>
          <p>تلفن: ${escapeHTML(order.phone)}</p>
          <p>شهر: ${escapeHTML(order.city || "ثبت نشده")}</p>
          <p>کد پستی: ${escapeHTML(order.postal_code || "ثبت نشده")}</p>
          <p>آدرس: ${escapeHTML(order.address)}</p>
          <p>تاریخ: ${escapeHTML(formatDate(order.created_at))}</p>

          <p>مبلغ کل:
            ${money(order.total_toman)} تومان
          </p>

          <p>وضعیت:
            ${escapeHTML(ORDER_STATUSES[order.status] || "نامشخص")}
          </p>

          <strong>اقلام سفارش:</strong>
          <ul>${itemsHTML || "<li>موردی ثبت نشده</li>"}</ul>

          ${receiptHTML}
        </div>

        <div>
          <label>تغییر وضعیت سفارش</label>

          <select data-order-status="${escapeHTML(order.id)}"
            ${order.status === "cancelled" ? "disabled" : ""}>

            ${Object.entries(ORDER_STATUSES).map(([key, label]) => `
              <option value="${key}"
                ${order.status === key ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </div>
      `;

      list.appendChild(row);
    }
  } catch (error) {
    console.error("Orders error:", error);
    list.textContent = "دریافت سفارش‌ها ناموفق بود.";
  }
}

$("adminOrdersList")?.addEventListener("change", async event => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;

  if (!currentUser || !(await verifyAdmin())) return;

  const newStatus = select.value;
  const orderId = select.dataset.orderStatus;

  if (!Object.keys(ORDER_STATUSES).includes(newStatus)) {
    notify("وضعیت سفارش معتبر نیست.");
    await loadOrders();
    return;
  }

  if (
    newStatus === "cancelled" &&
    !confirm("سفارش لغو شود؟ موجودی محصولات به انبار برمی‌گردد.")
  ) {
    await loadOrders();
    return;
  }

  try {
    const { error } = await db
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (error) throw error;

    notify("وضعیت سفارش تغییر کرد.");

    await loadOrders();
    await loadProducts();
  } catch (error) {
    console.error(error);
    notify("تغییر وضعیت سفارش ناموفق بود.");
    await loadOrders();
  }
});

// =========================================
// 13. STORE SETTINGS
// =========================================

async function loadSettings() {
  if (!currentUser || !(await verifyAdmin())) return;

  try {
    const { data, error } = await db
      .from("store_settings")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    if (error) throw error;

    if (!data) return;

    $("settingStoreName").value = data.store_name || "";
    $("settingBankName").value = data.bank_name || "";
    $("settingCardNumber").value = data.card_number || "";
    $("settingAccountHolder").value = data.account_holder || "";
    $("settingPaymentNote").value = data.payment_note || "";

    setMessage("settingsMessage", "");
  } catch (error) {
    console.error(error);
    setMessage("settingsMessage", "دریافت تنظیمات ناموفق بود.");
  }
}

$("settingsForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !(await verifyAdmin())) return;

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;

  setMessage("settingsMessage", "در حال ذخیره تنظیمات...");

  try {
    const storeName = $("settingStoreName").value.trim();
    const bankName = $("settingBankName").value.trim();
    const cardNumber = $("settingCardNumber").value.trim();
    const accountHolder = $("settingAccountHolder").value.trim();
    const paymentNote = $("settingPaymentNote").value.trim();

    if (!storeName) {
      throw new Error("نام فروشگاه را وارد کن.");
    }

    if (cardNumber && !/^[0-9۰-۹٠-٩\s-]{16,30}$/.test(cardNumber)) {
      throw new Error("شماره کارت معتبر نیست.");
    }

    const values = {
      id: "main",
      store_name: storeName,
      bank_name: bankName,
      card_number: cardNumber,
      account_holder: accountHolder,
      payment_note: paymentNote,
      updated_at: new Date().toISOString()
    };

    const { error } = await db
      .from("store_settings")
      .upsert(values, { onConflict: "id" });

    if (error) throw error;

    setMessage("settingsMessage", "تنظیمات با موفقیت ذخیره شد.");
    notify("تنظیمات فروشگاه ذخیره شد.");
  } catch (error) {
    console.error(error);

    setMessage(
      "settingsMessage",
      error.message || "ذخیره تنظیمات ناموفق بود."
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// =========================================
// 14. ADMIN TABS
// =========================================

document.querySelectorAll(".admin-tab").forEach(button => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".admin-tab").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    document.querySelectorAll(
      ".admin-section, .admin-tab-content"
    ).forEach(section => {
      section.classList.add("hidden");
    });

    const target = $(button.dataset.tab);

    if (target) target.classList.remove("hidden");

    if (button.dataset.tab === "productsAdmin") {
      await loadAdminProducts();
    }

    if (button.dataset.tab === "ordersAdmin") {
      await loadOrders();
    }

    if (button.dataset.tab === "settingsAdmin") {
      await loadSettings();
    }
  });
});

// =========================================
// 15. MODAL CLOSE HANDLERS
// =========================================

document.querySelectorAll("[data-close-modal]").forEach(button => {
  button.addEventListener("click", () => {
    hideElement(button.dataset.closeModal);
  });
});

// =========================================
// 16. INITIALIZATION
// =========================================

async function initialize() {
  loadSavedCart();
  renderCart();

  await loadProducts();

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      currentUser = data.session.user;

      if (await verifyAdmin()) {
        showDashboard();

        await loadAdminProducts();
        await loadOrders();
        await loadSettings();
      }
    } else {
      showStore();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    showStore();
    notify("خطا در بررسی وضعیت ورود.");
  }
}

initialize();

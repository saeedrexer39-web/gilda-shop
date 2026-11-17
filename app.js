
/* =================================
   GILDA SHOP - COMPLETE APPLICATION
================================= */

// SUPABASE CONNECTION
const SUPABASE_URL = "https://uxigmkbctofiezcfvcyq.supabase.co";
const SUPABASE_KEY = "کلید sb_publishable فعلی خودت را اینجا قرار بده";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// GLOBAL VARIABLES
const $ = id => document.getElementById(id);

let currentUser = null;
let cart = [];

try {
  cart = JSON.parse(localStorage.getItem("gilda-cart") || "[]");
  if (!Array.isArray(cart)) cart = [];
} catch {
  cart = [];
}

let currentCategory = "all";

// =================================
// HELPERS
// =================================

function money(value) {
  return Number(value || 0).toLocaleString("fa-IR");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function notify(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function makeSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-")
    + "-" + Date.now().toString(36);
}

// =================================
// PAGE NAVIGATION
// =================================

function showStore() {
  $("adminLogin").classList.add("hidden");
  $("adminDashboard").classList.add("hidden");

  document.querySelector("main").classList.remove("hidden");
  document.querySelector("header").classList.remove("hidden");
  document.querySelector("footer").classList.remove("hidden");

  $("adminAccessButton").classList.remove("hidden");

  window.scrollTo(0, 0);
}

function showLogin() {
  document.querySelector("main").classList.add("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("footer").classList.add("hidden");

  $("adminLogin").classList.remove("hidden");
  $("adminDashboard").classList.add("hidden");
  $("adminAccessButton").classList.add("hidden");

  $("loginMessage").textContent = "";
  window.scrollTo(0, 0);
}

function showDashboard() {
  $("adminLogin").classList.add("hidden");
  $("adminDashboard").classList.remove("hidden");

  document.querySelector("main").classList.add("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("footer").classList.add("hidden");

  $("adminAccessButton").classList.add("hidden");

  window.scrollTo(0, 0);
}

// =================================
// AUTHENTICATION
// =================================

async function verifyAdmin() {
  if (!currentUser) return false;

  const { data, error } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error || !data) {
    await db.auth.signOut();
    currentUser = null;
    showStore();
    notify("این حساب دسترسی مدیریت ندارد.");
    return false;
  }

  return true;
}

$("adminAccessButton").addEventListener("click", async () => {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) {
      notify("خطا در بررسی ورود مدیر.");
      return;
    }

    if (data.session) {
      currentUser = data.session.user;

      if (await verifyAdmin()) {
        showDashboard();
        await loadAdminProducts();
        await loadOrders();
      }
    } else {
      showLogin();
    }
  } catch (error) {
    console.error(error);
    notify("خطا در باز کردن پنل مدیریت.");
  }
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;

  $("loginMessage").textContent = "در حال ورود...";

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      $("loginMessage").textContent =
        "ایمیل یا رمز عبور اشتباه است.";
      return;
    }

    currentUser = data.user;

    if (await verifyAdmin()) {
      $("loginMessage").textContent = "";
      showDashboard();
      await loadAdminProducts();
      await loadOrders();
    }
  } catch (error) {
    console.error(error);
    $("loginMessage").textContent = "خطا در ورود به حساب.";
  }
});

$("logoutButton").addEventListener("click", async () => {
  await db.auth.signOut();
  currentUser = null;
  showStore();
  notify("از حساب مدیریت خارج شدی.");
});

db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    showStore();
  }
});

// =================================
// IMAGE STORAGE
// =================================

async function getImageUrl(path) {
  if (!path) return "";

  const { data, error } = await db.storage
    .from("product-images")
    .createSignedUrl(path, 3600);

  if (error) {
    console.error(error);
    return "";
  }

  return data.signedUrl;
}

async function uploadImage(file) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("فقط فایل تصویری انتخاب کن.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("حجم عکس باید کمتر از ۵ مگابایت باشد.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const safeExtension = /^[a-z0-9]+$/.test(extension)
    ? extension : "jpg";

  const path = `${crypto.randomUUID()}.${safeExtension}`;

  const { error } = await db.storage
    .from("product-images")
    .upload(path, file, {
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  return path;
}

// =================================
// STORE PRODUCTS
// =================================

async function loadProducts() {
  const grid = $("productsGrid");
  grid.innerHTML = "<p>در حال دریافت محصولات...</p>";

  try {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let products = data || [];

    if (currentCategory !== "all") {
      products = products.filter(
        p => p.category === currentCategory
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
          ${image
            ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}">`
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
          <button class="main-btn"
            ${product.stock <= 0 ? "disabled" : ""}
            data-add="${escapeHTML(product.id)}">
            افزودن به سبد خرید
          </button>
        </div>
      `;

      grid.appendChild(card);
    }
  } catch (error) {
    console.error("Products error:", error);
    grid.textContent = "دریافت محصولات ناموفق بود. اتصال را بررسی کن.";
  }
}

document.querySelectorAll(".category-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category-btn")
      .forEach(item => item.classList.remove("active"));

    button.classList.add("active");
    currentCategory = button.dataset.category;
    loadProducts();
  });
});

// =================================
// SHOPPING CART
// =================================

function saveCart() {
  localStorage.setItem("gilda-cart", JSON.stringify(cart));
  renderCart();
}

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    if (existing.quantity >= product.stock) {
      notify("موجودی کافی نیست.");
      return;
    }

    existing.quantity++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price_toman,
      quantity: 1
    });
  }

  saveCart();
  notify("محصول به سبد خرید اضافه شد.");
}

function renderCart() {
  $("cartCount").textContent = money(
    cart.reduce((sum, item) => sum + item.quantity, 0)
  );

  $("cartItems").innerHTML = "";

  let total = 0;

  cart.forEach(item => {
    total += item.price * item.quantity;

    const row = document.createElement("div");
    row.className = "cart-item";

    row.innerHTML = `
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <p>${money(item.price)} تومان</p>
        <p>تعداد: ${money(item.quantity)}</p>
      </div>
      <button data-remove="${escapeHTML(item.id)}">حذف</button>
    `;

    $("cartItems").appendChild(row);
  });

  $("cartTotal").textContent = money(total);
}

$("productsGrid").addEventListener("click", async event => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("id", button.dataset.add)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data || data.stock <= 0) {
    notify("این محصول موجود نیست.");
    await loadProducts();
    return;
  }

  const quantity = cart.find(item => item.id === data.id)?.quantity || 0;

  if (quantity >= data.stock) {
    notify("موجودی کافی نیست.");
    return;
  }

  addToCart(data);
});

$("cartItems").addEventListener("click", event => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;

  cart = cart.filter(item => item.id !== button.dataset.remove);
  saveCart();
});

$("cartButton").addEventListener("click", () => {
  $("cartPanel").classList.remove("hidden");
});

$("closeCart").addEventListener("click", () => {
  $("cartPanel").classList.add("hidden");
});

// CHECKOUT - NOT YET ENABLED
$("checkoutButton").addEventListener("click", () => {
  notify("ثبت سفارش و درگاه پرداخت هنوز راه‌اندازی نشده است.");
});

// =================================
// ADMIN PRODUCTS
// =================================

async function loadAdminProducts() {
  const list = $("adminProductsList");
  list.textContent = "در حال دریافت محصولات...";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.textContent = "خطا در دریافت محصولات.";
    return;
  }

  list.innerHTML = "";

  if (!data || !data.length) {
    list.textContent = "هنوز محصولی ثبت نشده است.";
    return;
  }

  for (const product of data) {
    const image = await getImageUrl(product.image_url);

    const row = document.createElement("div");
    row.className = "admin-product";

    row.innerHTML = `
      ${image
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
        <button data-edit="${escapeHTML(product.id)}">ویرایش</button>
        <button class="delete-btn"
          data-delete="${escapeHTML(product.id)}">حذف</button>
      </div>
    `;

    list.appendChild(row);
  }
}

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !(await verifyAdmin())) return;

  const button = event.submitter;
  button.disabled = true;

  $("productMessage").textContent = "در حال ذخیره...";

  try {
    const id = $("productId").value;
    const file = $("productImage").files[0];

    const name = $("productName").value.trim();
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);

    if (!name || !Number.isSafeInteger(price) || price < 0 ||
        !Number.isInteger(stock) || stock < 0) {
      throw new Error("اطلاعات محصول معتبر نیست.");
    }

    let imagePath = null;

    if (file) {
      imagePath = await uploadImage(file);
    }

    const values = {
      name,
      category: $("productCategory").value,
      price_toman: price,
      stock,
      description: $("productDescription").value.trim()
    };

    if (id) {
      if (imagePath) values.image_url = imagePath;

      const { error } = await db
        .from("products")
        .update(values)
        .eq("id", id);

      if (error) throw error;

      notify("محصول ویرایش شد.");
    } else {
      values.slug = makeSlug(name);
      values.image_url = imagePath;
      values.is_active = true;

      const { error } = await db
        .from("products")
        .insert(values);

      if (error) throw error;

      notify("محصول جدید اضافه شد.");
    }

    $("productForm").reset();
    $("productId").value = "";
    $("cancelEdit").classList.add("hidden");

    await loadAdminProducts();
    await loadProducts();

  } catch (error) {
    console.error(error);
    $("productMessage").textContent =
      error.message || "ذخیره محصول ناموفق بود.";
  } finally {
    button.disabled = false;
  }
});

$("adminProductsList").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (!currentUser || !(await verifyAdmin())) return;

  if (editButton) {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("id", editButton.dataset.edit)
      .single();

    if (error || !data) {
      notify("محصول پیدا نشد.");
      return;
    }

    $("productId").value = data.id;
    $("productName").value = data.name;
    $("productCategory").value = data.category;
    $("productPrice").value = data.price_toman;
    $("productStock").value = data.stock;
    $("productDescription").value = data.description || "";
    $("productImage").value = "";

    $("cancelEdit").classList.remove("hidden");
    $("productForm").scrollIntoView({ behavior: "smooth" });
  }

  if (deleteButton) {
    if (!confirm("از حذف این محصول مطمئنی؟")) return;

    const { error } = await db
      .from("products")
      .delete()
      .eq("id", deleteButton.dataset.delete);

    if (error) {
      notify("حذف محصول ناموفق بود.");
      return;
    }

    notify("محصول حذف شد.");
    await loadAdminProducts();
    await loadProducts();
  }
});

$("cancelEdit").addEventListener("click", () => {
  $("productForm").reset();
  $("productId").value = "";
  $("cancelEdit").classList.add("hidden");
});

// =================================
// ADMIN ORDERS
// =================================

async function loadOrders() {
  const list = $("adminOrdersList");
  list.textContent = "در حال دریافت سفارش‌ها...";

  if (!currentUser || !(await verifyAdmin())) return;

  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.textContent = "دریافت سفارش‌ها ناموفق بود.";
    return;
  }

  list.innerHTML = "";

  if (!data || !data.length) {
    list.textContent = "هنوز سفارشی ثبت نشده است.";
    return;
  }

  const statuses = {
    pending: "در انتظار بررسی",
    confirmed: "تأیید شده",
    shipped: "ارسال شده",
    delivered: "تحویل شده",
    cancelled: "لغو شده"
  };

  data.forEach(order => {
    const row = document.createElement("div");
    row.className = "admin-product";

    row.innerHTML = `
      <div>
        <strong>${escapeHTML(order.customer_name)}</strong>
        <p>تلفن: ${escapeHTML(order.phone)}</p>
        <p>آدرس: ${escapeHTML(order.address)}</p>
        <p>مبلغ: ${money(order.total_toman)} تومان</p>
        <p>وضعیت: ${statuses[order.status] || "نامشخص"}</p>
      </div>
      <select data-order-status="${escapeHTML(order.id)}">
        <option value="pending">در انتظار بررسی</option>
        <option value="confirmed">تأیید شده</option>
        <option value="shipped">ارسال شده</option>
        <option value="delivered">تحویل شده</option>
        <option value="cancelled">لغو شده</option>
      </select>
    `;

    list.appendChild(row);
    row.querySelector("select").value = order.status;
  });
}

$("ordersAdmin").addEventListener("change", async event => {
  const select = event.target.closest("[data-order-status]");
  if (!select || !currentUser) return;

  if (!(await verifyAdmin())) return;

  const { error } = await db
    .from("orders")
    .update({ status: select.value })
    .eq("id", select.dataset.orderStatus);

  if (error) {
    notify("تغییر وضعیت سفارش ناموفق بود.");
  } else {
    notify("وضعیت سفارش تغییر کرد.");
  }
});

// =================================
// ADMIN TABS
// =================================

document.querySelectorAll(".admin-tab").forEach(button => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".admin-tab")
      .forEach(item => item.classList.remove("active"));

    button.classList.add("active");

    document.querySelectorAll(".admin-tab-content")
      .forEach(item => item.classList.add("hidden"));

    const target = $(button.dataset.tab);

    if (target) target.classList.remove("hidden");

    if (button.dataset.tab === "ordersAdmin") {
      await loadOrders();
    }
  });
});

// =================================
// INITIALIZATION
// =================================

async function initialize() {
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
      }
    }
  } catch (error) {
    console.error("Initialization error:", error);
    notify("خطا در بررسی وضعیت ورود.");
  }
}

initialize();

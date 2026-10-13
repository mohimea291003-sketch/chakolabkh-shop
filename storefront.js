(function(root) {
  "use strict";

  const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const safeImage = value => {
    const text = String(value || "").trim();
    if (/^https:\/\//i.test(text) || /^(?:assets|images)\/[A-Za-z0-9_./-]+$/.test(text)) return text;
    return "";
  };
  const models = (root.CHAKO_PRODUCTS || []).map((item, index) => ({
    ...item, productKey:item.id, id:item.legacyId || index + 1,
    category:item.category === "Stainless Steel" ? "Stainless" : item.category,
    icon:item.category === "Titanium" ? "♧" : "◯"
  }));
  const money = value => "$" + Number(value).toFixed(2);
  const placeholder = '<svg viewBox="0 0 160 220" aria-hidden="true"><path d="M66 13h28v33h12c8 0 14 6 14 14v127c0 10-8 18-18 18H58c-10 0-18-8-18-18V60c0-8 6-14 14-14h12V13Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M42 72h76M66 46h28M59 183h42" fill="none" stroke="currentColor" stroke-width="2"/><text x="80" y="130" text-anchor="middle" font-size="10" font-family="Arial">CHAKO LAB</text></svg>';
  const photosFor = product => Array.from(new Set([product.image, ...(product.images || [])]
    .map(safeImage).filter(Boolean))).slice(0, 5);
  let activeMaterial = "All", activeSeries = "All", query = "", sort = "featured";
  let activeProduct, photoIndex = 0, panel, lastFocus;
  let currentSlide = 0;
  const byId = id => models.find(item => item.id === Number(id));
  const el = id => document.getElementById(id);

  function card(product) {
    const photos = photosFor(product);
    const discount = Number(product.compareAtPrice) > Number(product.price);
    const badge = product.inStock === false ? "Sold out" : discount ? "Save " + money(product.compareAtPrice - product.price) : product.badge;
    const image = photos.length ?
      '<img class="product-photo" src="' + escapeText(photos[0]) + '" alt="' + escapeText(product.name) + '" loading="lazy" decoding="async">' +
      (photos[1] ? '<img class="product-photo product-photo-hover" src="' + escapeText(photos[1]) + '" alt="' + escapeText(product.name) + ' — another view" loading="lazy" decoding="async">' : "") :
      '<span class="product-placeholder">' + placeholder + '<span>Photos coming soon</span></span>';
    return '<article class="product-card">' +
      '<div class="product-image">' +
      '<button type="button" class="product-open" data-open-product="' + product.id + '" aria-label="View ' + escapeText(product.name) + '">' + image + '</button>' +
      (badge ? '<span class="product-badge' + (discount ? ' product-badge-sale' : '') + '">' + escapeText(badge) + '</span>' : '') +
      '<button type="button" class="quick-add" data-add-product="' + product.id + '"' + (product.inStock === false ? ' disabled' : '') + '>' + (product.inStock === false ? 'Sold out' : '+ Quick add') + '</button></div>' +
      '<div class="product-info"><div class="product-category">' + escapeText(product.collection || product.category) + '</div>' +
      '<button type="button" class="product-name" data-open-product="' + product.id + '">' + escapeText(product.name) + '</button>' +
      '<div class="product-price' + (discount ? ' price-sale' : '') + '">' + money(product.price) +
      (discount ? '<s>' + money(product.compareAtPrice) + '</s>' : '') + '</div></div></article>';
  }

  function renderCatalog() {
    const target = el("productList");
    if (!target) return;
    let visible = models.filter(product =>
      (activeMaterial === "All" || product.category === activeMaterial) &&
      (activeSeries === "All" || product.collection === activeSeries) &&
      (!query || [product.name, product.collection, product.category, product.description].join(" ").toLowerCase().includes(query)));
    if (sort === "price-low") visible = visible.slice().sort((a,b) => a.price - b.price);
    if (sort === "price-high") visible = visible.slice().sort((a,b) => b.price - a.price);
    target.innerHTML = visible.length ? visible.map(card).join("") :
      '<div class="catalog-empty"><h3>No matching models</h3><p>Try another model, material, or search term.</p><button type="button" onclick="resetCatalog()">View all models</button></div>';
    if (el("catalogCount")) el("catalogCount").textContent = visible.length + (visible.length === 1 ? " model" : " models");
    const selection = activeSeries !== "All" ? activeSeries + " series" : query ? 'Search: “' + query + '”' : "";
    if (el("catalogSelection")) el("catalogSelection").hidden = !selection;
    if (el("catalogSelectionLabel")) el("catalogSelectionLabel").textContent = selection;
    target.scrollLeft = 0;
    document.querySelectorAll(".filter-btn").forEach(button => {
      const selected = button.dataset.material === activeMaterial;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderCollections() {
    const featured = models.filter(product => product.featured);
    if (el("featuredProducts")) el("featuredProducts").innerHTML = featured.map(card).join("");
    const offers = models.filter(product => Number(product.compareAtPrice) > Number(product.price));
    if (el("offersSection")) el("offersSection").hidden = !offers.length;
    if (el("offerProducts")) el("offerProducts").innerHTML = offers.map(card).join("");
  }

  function closePanels(restoreFocus = true) {
    ["menuDrawer", "searchPanel", "productDialog"].forEach(id => el(id)?.classList.remove("show"));
    el("storeBackdrop")?.classList.remove("show");
    document.body.classList.remove("store-panel-open");
    el("menuToggle")?.setAttribute("aria-expanded", "false");
    panel = undefined;
    if (restoreFocus && lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function openPanel(id) {
    closePanels(false);
    if (typeof root.closeEverything === "function") root.closeEverything();
    lastFocus = document.activeElement;
    panel = el(id);
    if (!panel) return;
    panel.classList.add("show");
    el("storeBackdrop")?.classList.add("show");
    document.body.classList.add("store-panel-open");
    if (id === "menuDrawer") el("menuToggle")?.setAttribute("aria-expanded", "true");
    const first = panel.querySelector("input, button, a[href]");
    first?.focus();
  }

  function selectPhoto(index) {
    if (!activeProduct) return;
    const photos = photosFor(activeProduct);
    if (!photos.length) return;
    photoIndex = (Number(index) + photos.length) % photos.length;
    el("galleryImage").hidden = false;
    el("galleryPlaceholder").hidden = true;
    el("galleryImage").src = photos[photoIndex];
    el("galleryImage").alt = activeProduct.name + " — photo " + (photoIndex + 1);
    el("galleryCount").textContent = (photoIndex + 1) + " / " + photos.length;
    document.querySelectorAll(".gallery-thumb").forEach((button,index) => {
      button.classList.toggle("active", index === photoIndex);
      button.setAttribute("aria-pressed", String(index === photoIndex));
    });
  }

  function openProduct(id) {
    const product = byId(id);
    if (!product) return;
    activeProduct = product;
    const photos = photosFor(product);
    el("productDialogTitle").textContent = product.name;
    el("productDialogCollection").textContent = product.collection || product.category;
    el("productDialogPrice").textContent = money(product.price);
    el("productDialogDescription").textContent = product.description || "Find your everyday favorite from CHAKO LAB.";
    el("productMaterial").textContent = product.category === "Stainless" ? "Stainless Steel" : product.category;
    el("productSizes").textContent = product.sizes?.length ? product.sizes.join(" / ") : "See product details";
    el("productQuantity").value = "1";
    el("galleryImage").hidden = !photos.length;
    el("galleryPlaceholder").hidden = !!photos.length;
    el("galleryPlaceholder").innerHTML = placeholder + "<p>Product photos coming soon.</p>";
    el("galleryPrevious").hidden = photos.length < 2;
    el("galleryNext").hidden = photos.length < 2;
    el("galleryCount").textContent = photos.length ? "1 / " + photos.length : "";
    el("galleryThumbnails").innerHTML = photos.map((photo,index) =>
      '<button type="button" class="gallery-thumb" data-photo-index="' + index + '" aria-label="View photo ' + (index + 1) + '"><img src="' + escapeText(photo) + '" alt="" loading="lazy"></button>').join("");
    el("productDialogAdd").disabled = product.inStock === false;
    el("productDialogAdd").textContent = product.inStock === false ? "Sold out" : "Add to cart — " + money(product.price);
    openPanel("productDialog");
    if (photos.length) selectPhoto(0);
  }

  function browse(material = "All", series = "All") {
    activeMaterial = material; activeSeries = series; query = "";
    if (el("searchInput")) el("searchInput").value = "";
    renderCatalog(); closePanels(false);
    el("shop")?.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function renderSearch() {
    const text = el("searchInput").value.trim().toLowerCase();
    const found = text ? models.filter(product =>
      [product.name, product.collection, product.category].join(" ").toLowerCase().includes(text)) : models.slice(0, 3);
    el("searchResults").innerHTML = found.length ? found.map(product =>
      '<button type="button" class="search-result" data-open-product="' + product.id + '"><span>' + escapeText(product.name) + '</span><strong>' + money(product.price) + '</strong></button>').join("") :
      '<p class="search-empty">No matching models. Try a series or material.</p>';
  }

  function showSlide(index) {
    const slides = Array.from(document.querySelectorAll(".hero-slide"));
    if (!slides.length) return;
    currentSlide = (Number(index) + slides.length) % slides.length;
    slides.forEach((slide,i) => {
      slide.classList.toggle("active", i === currentSlide);
      slide.setAttribute("aria-hidden", String(i !== currentSlide));
      slide.querySelector("a")?.setAttribute("tabindex", i === currentSlide ? "0" : "-1");
    });
    document.querySelectorAll(".hero-dot").forEach((dot,i) => {
      dot.classList.toggle("active", i === currentSlide);
      dot.setAttribute("aria-pressed", String(i === currentSlide));
    });
  }

  root.getStorefrontProducts = () => models;
  root.escapeProductText = escapeText;
  root.renderProductThumbnail = item => {
    const product = byId(item.id) || item;
    const photo = photosFor(product)[0];
    return photo ? '<img src="' + escapeText(photo) + '" alt="' + escapeText(item.name) + '" loading="lazy">' : placeholder;
  };
  root.renderCatalog = function(category) {
    if (category) activeMaterial = category;
    renderCatalog(); renderCollections();
  };
  root.filterCatalog = category => browse(category, "All");
  root.browseSeries = series => browse("All", series);
  root.resetCatalog = () => browse();
  root.openProduct = openProduct;
  root.selectProductPhoto = selectPhoto;
  root.stepProductPhoto = change => selectPhoto(photoIndex + Number(change));
  root.closeStorePanels = closePanels;
  root.toggleStoreMenu = () => panel === el("menuDrawer") ? closePanels() : openPanel("menuDrawer");
  root.openStoreSearch = () => { openPanel("searchPanel"); renderSearch(); el("searchInput").focus(); };
  root.showHeroSlide = showSlide;
  root.scrollProductRow = (id,direction) => {
    const row = el(id);
    row?.scrollBy({left:direction * row.clientWidth * 0.8, behavior:"smooth"});
  };
  root.adjustProductQuantity = change => {
    const field = el("productQuantity");
    field.value = String(Math.max(1, Math.min(20, (Number(field.value) || 1) + change)));
  };
  root.addGalleryProduct = () => {
    if (!activeProduct || activeProduct.inStock === false) return;
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(el("productQuantity").value) || 1)));
    const id = activeProduct.id;
    closePanels(false);
    root.addToCart(id, quantity);
  };

  // Keep product browsing usable if a temporary photo is removed from the CDN.
  document.addEventListener("error", event => {
    const image = event.target;
    if (image.tagName !== "IMG") return;
    if (image.id === "galleryImage") {
      image.hidden = true;
      el("galleryPlaceholder").hidden = false;
      el("galleryPlaceholder").innerHTML = placeholder + "<p>This photo is unavailable. Try another view.</p>";
      return;
    }
    if (image.classList.contains("product-photo-hover")) { image.remove(); return; }
    if (image.classList.contains("product-photo")) {
      const button = image.closest(".product-open");
      if (button) button.innerHTML = '<span class="product-placeholder">' + placeholder + '<span>Photos coming soon</span></span>';
    }
  }, true);

  document.addEventListener("click", event => {
    const opener = event.target.closest?.("[data-open-product]");
    if (opener) { openProduct(opener.dataset.openProduct); return; }
    const add = event.target.closest?.("[data-add-product]");
    if (add) { const product = byId(add.dataset.addProduct); if (product && product.inStock !== false) root.addToCart(product.id); return; }
    const photo = event.target.closest?.("[data-photo-index]");
    if (photo) selectPhoto(photo.dataset.photoIndex);
  });
  document.addEventListener("keydown", event => {
    if (!panel) return;
    if (event.key === "Escape") { closePanels(); return; }
    if (panel === el("productDialog") && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
      if (event.key === "ArrowRight") { event.preventDefault(); selectPhoto(photoIndex + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); selectPhoto(photoIndex - 1); }
    }
    if (event.key === "Tab") {
      const focusable = Array.from(panel.querySelectorAll("button:not([disabled]):not([hidden]), a[href], input:not([disabled])"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  el("searchInput")?.addEventListener("input", renderSearch);
  el("searchForm")?.addEventListener("submit", event => {
    event.preventDefault(); query = el("searchInput").value.trim().toLowerCase();
    activeMaterial = "All"; activeSeries = "All";
    renderCatalog(); closePanels(false); el("shop")?.scrollIntoView({behavior:"smooth"});
  });
  el("catalogSort")?.addEventListener("change", event => { sort = event.target.value; renderCatalog(); });
  el("heroPrevious")?.addEventListener("click", () => showSlide(currentSlide - 1));
  el("heroNext")?.addEventListener("click", () => showSlide(currentSlide + 1));
  showSlide(0);
})(window);

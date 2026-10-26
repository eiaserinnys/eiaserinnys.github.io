(() => {
  const root = document.documentElement;
  const items = [...document.querySelectorAll(".index-item")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const states = new Map();
  const initialHashItem = items.find(item => item.id === window.location.hash.slice(1));
  const initialIndex = initialHashItem ? items.indexOf(initialHashItem) : 0;
  const tableScrolls = [...document.querySelectorAll(".table-scroll")];
  const springResponse = Number.parseFloat(getComputedStyle(root).getPropertyValue("--panel-response"));
  const springK = Math.pow(2 * Math.PI / springResponse, 2);
  const springC = 4 * Math.PI / springResponse;
  let endCheckQueued = false;
  let forceEndCheckQueued = false;
  let userScrollIntent = false;
  let initialHashSettled = false;

  function setHash(item) {
    const next = window.location.pathname + window.location.search + "#" + item.id;
    window.history.replaceState(null, "", next);
  }

  function scrollToSection(item, behavior) {
    const index = items.indexOf(item);
    openThrough(index);
    const following = items.slice(index + 1).filter(next =>
      next.querySelector("summary").getBoundingClientRect().top - item.getBoundingClientRect().top <= window.innerHeight * 0.7
    );
    following.forEach(next => openImmediately(next, states.get(next)));
    const sectionTop = window.scrollY + item.getBoundingClientRect().top;
    if (document.scrollingElement.scrollHeight - window.innerHeight < sectionTop) {
      items.slice(index + 1).forEach(next => openImmediately(next, states.get(next)));
    }
    measureSummaryHeights();
    const startY = window.scrollY;
    const requestedTop = startY + item.getBoundingClientRect().top;
    const maximumTop = Math.max(0, document.scrollingElement.scrollHeight - window.innerHeight);
    const targetTop = Math.min(requestedTop, maximumTop);
    window.scrollTo({ top: requestedTop, behavior });
    return { moved: Math.abs(targetTop - startY) > 1, behavior, targetTop };
  }

  function updateTableFade(tableScroll) {
    if (!tableScroll.clientWidth) return;
    const hasOverflow = tableScroll.scrollWidth > tableScroll.clientWidth + 1;
    const atEnd = tableScroll.scrollLeft + tableScroll.clientWidth >= tableScroll.scrollWidth - 1;
    tableScroll.classList.toggle("has-overflow", hasOverflow);
    tableScroll.classList.toggle("is-at-end", atEnd);
    tableScroll.classList.toggle("is-scrolled", tableScroll.scrollLeft > 0);
  }

  function updateTableFades() {
    tableScrolls.forEach(updateTableFade);
  }

  function measureSummaryHeights() {
    const stuckItems = items.filter(item => item.classList.contains("is-stuck"));
    stuckItems.forEach(item => item.classList.remove("is-stuck"));
    items.forEach(item => {
      const summary = item.querySelector("summary");
      summary.style.setProperty("--summary-h", summary.getBoundingClientRect().height + "px");
    });
    stuckItems.forEach(item => item.classList.add("is-stuck"));
  }

  function measurePanelHeight(item) {
    const panel = item.querySelector(".detail-panel");
    const wasOpen = item.open;
    panel.style.height = "auto";
    item.open = true;
    const height = panel.scrollHeight;
    item.open = wasOpen;
    panel.style.removeProperty("height");
    return height;
  }

  function openImmediately(item, state) {
    if (state.raf !== null) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
    const panel = item.querySelector(".detail-panel");
    const summary = item.querySelector("summary");
    state.targetOpen = true;
    state.target = state.maxHeight;
    state.x = state.maxHeight;
    state.v = 0;
    item.classList.add("is-immediate");
    item.classList.remove("is-opening", "is-revealing");
    item.open = true;
    panel.style.removeProperty("--panel-height");
    summary.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => item.classList.remove("is-immediate"));
  }

  function openWithSpring(item, state) {
    if (state.targetOpen) return;
    if (reducedMotion.matches) {
      openImmediately(item, state);
      return;
    }
    const panel = item.querySelector(".detail-panel");
    const summary = item.querySelector("summary");
    state.targetOpen = true;
    state.target = state.maxHeight;
    state.x = Math.max(0, state.x);
    item.open = true;
    panel.style.setProperty("--panel-height", state.x + "px");
    item.classList.remove("is-immediate", "is-revealing");
    item.classList.add("is-opening");
    summary.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (item.classList.contains("is-opening")) item.classList.add("is-revealing");
      });
    });
    let previousTime = 0;
    state.raf = requestAnimationFrame(function frame(time) {
      const dt = Math.min((time - (previousTime || time)) / 1000, 1 / 30);
      previousTime = time;
      state.v += (-springK * (state.x - state.target) - springC * state.v) * dt;
      state.x += state.v * dt;
      state.x = Math.max(0, state.x);
      panel.style.setProperty("--panel-height", state.x + "px");
      if (Math.abs(state.x - state.target) < 0.5 && Math.abs(state.v) < 1) {
        state.x = state.target;
        state.v = 0;
        state.raf = null;
        panel.style.removeProperty("--panel-height");
        item.classList.remove("is-opening", "is-revealing");
        updateTableFades();
        return;
      }
      state.raf = requestAnimationFrame(frame);
    });
  }

  function openThrough(index, options = {}) {
    for (let current = 0; current <= index; current += 1) {
      openImmediately(items[current], states.get(items[current]));
    }
    if (options.updateAddress) setHash(items[index]);
    const movement = options.scrollBehavior ? scrollToSection(items[index], options.scrollBehavior) : null;
    requestAnimationFrame(updateTableFades);
    return movement;
  }

  function openAboveRevealLine() {
    const line = window.innerHeight * 0.7;
    const atEnd = window.scrollY + window.innerHeight >= document.scrollingElement.scrollHeight - 1;
    const visible = items.filter(item => atEnd || item.querySelector("summary").getBoundingClientRect().top <= line);
    visible.forEach(item => {
      if (!states.get(item).targetOpen) openImmediately(item, states.get(item));
    });
  }

  function openRowsCrossingRevealLine(force = false) {
    if (!userScrollIntent && !force) return;
    const line = window.innerHeight * 0.7;
    items.forEach(item => {
      const state = states.get(item);
      if (!state.targetOpen && item.querySelector("summary").getBoundingClientRect().top <= line) {
        openWithSpring(item, state);
      }
    });
  }

  function openRemainingAtEnd(force = false) {
    if (!userScrollIntent && !force) return;
    const documentHeight = document.scrollingElement.scrollHeight;
    if (window.scrollY + window.innerHeight < documentHeight - 1) return;
    items.forEach(item => openWithSpring(item, states.get(item)));
  }

  function queueEndCheck(force = false) {
    forceEndCheckQueued = forceEndCheckQueued || force;
    if (endCheckQueued) return;
    endCheckQueued = true;
    requestAnimationFrame(() => {
      endCheckQueued = false;
      const shouldForce = forceEndCheckQueued;
      forceEndCheckQueued = false;
      openRemainingAtEnd(shouldForce);
    });
  }

  function scheduleNavigationChecks(movement) {
    let finished = false;
    let fallbackTimer = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      document.removeEventListener("scrollend", onScrollEnd);
      openAboveRevealLine();
      updateTableFades();
    };
    const onScrollEnd = () => {
      if (Math.abs(window.scrollY - movement.targetTop) <= 1) finish();
    };

    if (!movement || !movement.moved || movement.behavior === "instant") {
      requestAnimationFrame(finish);
      return;
    }
    if ("onscrollend" in document) {
      document.addEventListener("scrollend", onScrollEnd);
    } else {
      fallbackTimer = window.setTimeout(finish, 240);
    }
  }

  items.forEach((item, index) => {
    const panel = item.querySelector(".detail-panel");
    const summary = item.querySelector("summary");
    const maxHeight = panel.scrollHeight;
    const shouldOpen = index <= initialIndex;
    const state = {
      x: shouldOpen ? maxHeight : 0,
      v: 0,
      target: shouldOpen ? maxHeight : 0,
      maxHeight,
      targetOpen: shouldOpen,
      raf: null
    };
    states.set(item, state);
    item.open = shouldOpen;
    summary.setAttribute("aria-expanded", String(shouldOpen));
    summary.addEventListener("click", event => {
      event.preventDefault();
      initialHashSettled = true;
      userScrollIntent = false;
      const movement = openThrough(index, {
        updateAddress: true,
        scrollBehavior: reducedMotion.matches ? "instant" : "smooth"
      });
      scheduleNavigationChecks(movement);
    });
    item.addEventListener("beforematch", () => openThrough(index));
    item.addEventListener("toggle", () => {
      const current = states.get(item);
      if (item.open && !current.targetOpen) openThrough(index);
      else if (!item.open && current.targetOpen) openImmediately(item, current);
    });
  });

  root.dataset.enhanced = "true";
  measureSummaryHeights();
  openAboveRevealLine();
  if (initialHashItem) scheduleNavigationChecks(scrollToSection(initialHashItem, "instant"));
  const initialHashScrollY = window.scrollY;
  updateTableFades();

  const themeButton = document.getElementById("theme-toggle");
  function updateThemePressed() {
    if (!themeButton) return;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    themeButton.setAttribute("aria-pressed", String(dark));
  }
  const storedTheme = localStorage.getItem("index-theme");
  if (storedTheme === "light" || storedTheme === "dark") root.dataset.theme = storedTheme;
  updateThemePressed();
  if (themeButton) {
    themeButton.addEventListener("click", () => {
      const current = root.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      root.dataset.theme = current === "dark" ? "light" : "dark";
      localStorage.setItem("index-theme", root.dataset.theme);
      updateThemePressed();
    });
  }

  const stickyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const item = entry.target.closest(".index-item");
      const aboveViewport = entry.target.getBoundingClientRect().top < 0;
      if (item) item.classList.toggle("is-stuck", !entry.isIntersecting && aboveViewport);
    });
  }, { root: null, threshold: 0 });
  items.forEach(item => {
    const sentinel = item.querySelector(".stuck-sentinel");
    if (sentinel) stickyObserver.observe(sentinel);
  });

  tableScrolls.forEach(tableScroll => {
    tableScroll.addEventListener("scroll", () => updateTableFade(tableScroll), { passive: true });
  });

  function markScrollIntent() {
    initialHashSettled = true;
    userScrollIntent = true;
    queueEndCheck();
  }
  window.addEventListener("wheel", markScrollIntent, { passive: true });
  window.addEventListener("touchmove", markScrollIntent, { passive: true });
  window.addEventListener("pointerdown", markScrollIntent, { passive: true });
  window.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      markScrollIntent();
    }
  });

  function syncStuckStates() {
    items.forEach(item => {
      const sentinel = item.querySelector(".stuck-sentinel");
      if (!sentinel) return;
      if (sentinel.getBoundingClientRect().top >= 0) {
        item.classList.remove("is-stuck");
      }
    });
  }

  window.addEventListener("scroll", () => {
    syncStuckStates();
    openRowsCrossingRevealLine();
    queueEndCheck();
  }, { passive: true });

  function refreshPanelMeasurements() {
    items.forEach(item => {
      const state = states.get(item);
      const panel = item.querySelector(".detail-panel");
      const measuredHeight = measurePanelHeight(item);
      state.maxHeight = measuredHeight;
      state.target = state.targetOpen ? measuredHeight : 0;
      if (state.raf === null) {
        state.x = state.target;
        state.v = 0;
        panel.style.removeProperty("--panel-height");
      }
    });
  }

  function refreshLayoutMeasurements() {
    syncStuckStates();
    measureSummaryHeights();
    refreshPanelMeasurements();
    openAboveRevealLine();
    updateTableFades();
    queueEndCheck();
  }

  document.querySelectorAll("[data-compile-depth]").forEach(figure => {
    const buttons = [...figure.querySelectorAll(".depth-button[data-depth-value]")];
    buttons.forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.depthValue;
        figure.dataset.compileDepth = value;
        buttons.forEach(candidate => {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        });
        refreshLayoutMeasurements();
      });
    });
  });

  window.addEventListener("resize", refreshLayoutMeasurements);
  window.addEventListener("load", refreshLayoutMeasurements);
  window.addEventListener("hashchange", () => {
    initialHashSettled = true;
    const target = items.find(item => item.id === window.location.hash.slice(1));
    if (!target) return;
    const movement = openThrough(items.indexOf(target), { scrollBehavior: "instant" });
    scheduleNavigationChecks(movement);
  });

  document.fonts.ready.then(() => {
    const restoreInitialHash = initialHashItem && !initialHashSettled && Math.abs(window.scrollY - initialHashScrollY) <= 1;
    initialHashSettled = true;
    refreshLayoutMeasurements();
    if (restoreInitialHash) scheduleNavigationChecks(scrollToSection(initialHashItem, "instant"));
  });

  window.addEventListener("beforeprint", () => {
    items.forEach(item => openImmediately(item, states.get(item)));
  });
})();

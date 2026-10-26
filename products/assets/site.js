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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function renderSymlinkMotion(figure, rawSeconds) {
    const cycle = 6.5;
    const t = ((rawSeconds % cycle) + cycle) % cycle;
    const svgs = [...figure.querySelectorAll("svg")];
    const fadeOut = t >= 5.7 && t < 6.1 ? 1 - (t - 5.7) / 0.4 : t >= 6.1 ? (t - 6.1) / 0.4 : 1;
    const fadeStr = String(clamp(fadeOut, 0, 1));
    const isResetPhase = t >= 6.1;
    const sourceUpdated = !isResetPhase && t >= 1.1;
    const sourceFlash = !isResetPhase && t >= 1.1 && t < 1.65;
    const pulseStarts = [1.7, 1.98, 2.26];
    const pulseDuration = 0.55;
    const pulseTravel = 0.52;
    const targetUpdateTimes = pulseStarts.map(start => Number((start + pulseTravel).toFixed(2)));

    svgs.forEach(svg => {
      const sourceBox = svg.querySelector('[data-symlink-box="source"]');
      if (sourceBox) sourceBox.classList.toggle("symlink-box--flash", sourceFlash);

      const sourceVal = svg.querySelector('[data-symlink-val="source"]');
      const sourceNum = svg.querySelector('[data-symlink-num="source"]');
      if (sourceVal) {
        const nextText = sourceUpdated ? "48" : "24";
        if (sourceNum && sourceNum.textContent !== nextText) sourceNum.textContent = nextText;
        sourceVal.classList.toggle("symlink-value--active", sourceUpdated);
        sourceVal.setAttribute("fill-opacity", fadeStr);
        sourceVal.style.fillOpacity = fadeStr;
      }

      const sourceLine = svg.querySelector('[data-symlink-line="source"]');
      if (sourceLine) {
        sourceLine.setAttribute("fill-opacity", fadeStr);
        sourceLine.style.fillOpacity = fadeStr;
      }

      for (let i = 0; i < 3; i += 1) {
        const updated = !isResetPhase && t >= targetUpdateTimes[i];
        const flash = !isResetPhase && t >= targetUpdateTimes[i] && t < targetUpdateTimes[i] + 0.45;
        const box = svg.querySelector(`[data-symlink-box="${i}"]`);
        if (box) box.classList.toggle("symlink-box--flash", flash);

        const val = svg.querySelector(`[data-symlink-val="${i}"]`);
        const num = svg.querySelector(`[data-symlink-num="${i}"]`);
        if (val) {
          const nextText = updated ? "48" : "24";
          if (num && num.textContent !== nextText) num.textContent = nextText;
          val.classList.toggle("symlink-value--active", updated);
          val.setAttribute("fill-opacity", fadeStr);
          val.style.fillOpacity = fadeStr;
        }

        const lineText = svg.querySelector(`[data-symlink-line="${i}"]`);
        if (lineText) {
          lineText.setAttribute("fill-opacity", fadeStr);
          lineText.style.fillOpacity = fadeStr;
        }

        const pulse = svg.querySelector(`[data-symlink-pulse="${i}"]`);
        if (pulse) {
          const pStart = pulseStarts[i];
          if (!isResetPhase && t >= pStart && t <= pStart + pulseDuration) {
            const p = (t - pStart) / pulseDuration;
            const env = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
            pulse.style.opacity = String(clamp(env, 0, 1));
            pulse.style.strokeDasharray = "0.38 1";
            pulse.style.strokeDashoffset = String(0.38 - p * 1.05);
          } else {
            pulse.style.opacity = "0";
          }
        }
      }
    });
  }

  function renderSearchMotion(figure, rawSeconds) {
    const cycle = 6.8;
    const t = ((rawSeconds % cycle) + cycle) % cycle;
    const fullQuery = "결제가 두 번 되는 문제";
    const targetScores = [0.9, 0.7, 0.4];
    const svgs = [...figure.querySelectorAll("svg")];
    const isFadeOut = t >= 6.3;
    const fadeFactor = isFadeOut ? clamp(1 - (t - 6.3) / 0.42, 0, 1) : 1;

    let querySubstring = fullQuery;
    if (t < 1.2) {
      const count = clamp(Math.floor((t / 1.1) * fullQuery.length) + 1, 1, fullQuery.length);
      querySubstring = fullQuery.slice(0, count);
    } else if (t >= 6.74) {
      querySubstring = "";
    }

    const scoreProgressRaw = clamp((t - 2.0) / 1.05, 0, 1);
    const scoreProgress = 1 - Math.pow(1 - scoreProgressRaw, 3);
    const verdictPhase = t >= 3.2;
    const verdictOpacity = verdictPhase ? clamp((t - 3.2) / 0.45, 0, 1) : 0;

    svgs.forEach(svg => {
      const queryEl = svg.querySelector("[data-search-query]");
      if (queryEl) {
        if (queryEl.textContent !== querySubstring) queryEl.textContent = querySubstring;
        queryEl.style.opacity = String(fadeFactor);
      }

      for (let i = 0; i < 3; i += 1) {
        const line = svg.querySelector(`[data-search-line="${i}"]`);
        const card = svg.querySelector(`[data-search-card="${i}"]`);
        const box = svg.querySelector(`[data-search-box="${i}"]`);
        const titleEl = svg.querySelector(`[data-search-title="${i}"]`);
        const bar = svg.querySelector(`[data-search-bar="${i}"]`);
        const scoreEl = svg.querySelector(`[data-search-score="${i}"]`);
        const scoreWrap = svg.querySelector(`[data-search-score-wrap="${i}"]`);
        const verdictEl = svg.querySelector(`[data-search-verdict="${i}"]`);

        const lineStart = 1.2 + i * 0.16;
        const lineP = t < 1.2 ? 0 : clamp((t - lineStart) / 0.38, 0, 1);
        if (line) {
          line.classList.remove("svg-line", "svg-line-accent", "svg-line-muted");
          if (verdictPhase) {
            line.classList.add(i < 2 ? "svg-line-accent" : "svg-line-muted");
          } else {
            line.classList.add("svg-line");
          }
          line.style.strokeDasharray = "1";
          line.style.strokeDashoffset = String(1 - lineP);
          line.style.opacity = String(lineP > 0 ? fadeFactor : 0);
        }

        const cardStart = 1.32 + i * 0.16;
        const cardP = t < 1.32 ? 0 : clamp((t - cardStart) / 0.34, 0, 1);
        if (card) {
          const isExcludedFinal = verdictPhase && i === 2 && !isFadeOut && verdictOpacity >= 1;
          card.classList.toggle("search-card--excluded", verdictPhase && i === 2);
          if (isExcludedFinal) {
            card.style.removeProperty("opacity");
          } else if (verdictPhase && i === 2) {
            const dimTarget = 1 - 0.38 * verdictOpacity;
            card.style.opacity = String(dimTarget * fadeFactor);
          } else {
            card.style.opacity = String(cardP * fadeFactor);
          }
        }

        if (box) {
          box.classList.remove("svg-box-strong", "svg-box-accent", "svg-box-muted");
          if (verdictPhase) {
            box.classList.add(i < 2 ? "svg-box-accent" : "svg-box-muted");
          } else {
            box.classList.add("svg-box-strong");
          }
        }

        if (titleEl) {
          titleEl.classList.remove("svg-title", "svg-muted");
          titleEl.classList.add(verdictPhase && i === 2 ? "svg-muted" : "svg-title");
        }

        const currentScore = t < 2.0 ? 0 : targetScores[i] * scoreProgress;
        if (scoreEl) {
          const formatted = currentScore.toFixed(1);
          if (scoreEl.textContent !== formatted) scoreEl.textContent = formatted;
        }

        if (scoreWrap) {
          scoreWrap.classList.remove("svg-accent", "svg-muted");
          scoreWrap.classList.add(verdictPhase && i < 2 ? "svg-accent" : "svg-muted");
        }

        if (bar) {
          const maxW = Number.parseFloat(bar.dataset.barMax || "80");
          const width = t < 2.0 ? 0 : maxW * targetScores[i] * scoreProgress;
          bar.setAttribute("width", width.toFixed(1));
        }

        if (verdictEl) {
          const vStr = String(verdictOpacity);
          verdictEl.setAttribute("fill-opacity", vStr);
          verdictEl.style.fillOpacity = vStr;
        }
      }
    });
  }

  const motionFigures = [...document.querySelectorAll(".diagram-figure[data-motion]")];
  const motionControllers = new Map();

  motionFigures.forEach(figure => {
    const type = figure.dataset.motion;
    const render = type === "symlink" ? renderSymlinkMotion : renderSearchMotion;
    const endSceneTime = type === "symlink" ? 4.0 : 4.5;
    const baseLabel = (figure.getAttribute("aria-label") || "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s*(일시정지|재개)$/, "")
      .trim();
    const descEl = figure.querySelector("svg desc[id]");
    const describedBy = figure.getAttribute("aria-describedby") || (descEl ? descEl.id : "");
    const parentItem = figure.closest(".index-item");

    const controller = {
      figure,
      type,
      render,
      endSceneTime,
      baseLabel,
      describedBy,
      parentItem,
      elapsed: 0,
      lastTimestamp: null,
      raf: null,
      inViewport: false,
      userPaused: false
    };

    function updateAria() {
      if (reducedMotion.matches) {
        figure.removeAttribute("tabindex");
        figure.removeAttribute("role");
        figure.removeAttribute("aria-pressed");
        figure.removeAttribute("aria-label");
        figure.removeAttribute("aria-describedby");
        figure.style.cursor = "default";
        return;
      }
      figure.setAttribute("tabindex", "0");
      figure.setAttribute("role", "button");
      figure.setAttribute("aria-pressed", String(controller.userPaused));
      if (controller.baseLabel) {
        figure.setAttribute("aria-label", controller.baseLabel);
      }
      if (controller.describedBy) {
        figure.setAttribute("aria-describedby", controller.describedBy);
      }
      figure.style.removeProperty("cursor");
    }

    function stopLoop() {
      if (controller.raf !== null) {
        cancelAnimationFrame(controller.raf);
        controller.raf = null;
      }
      controller.lastTimestamp = null;
    }

    function tick(now) {
      if (controller.lastTimestamp === null) {
        controller.lastTimestamp = now;
      }
      const dt = Math.min((now - controller.lastTimestamp) / 1000, 0.1);
      controller.lastTimestamp = now;
      controller.elapsed += dt;
      controller.render(figure, controller.elapsed);
      controller.raf = requestAnimationFrame(tick);
    }

    function sync() {
      updateAria();
      if (reducedMotion.matches) {
        stopLoop();
        controller.render(figure, controller.endSceneTime);
        return;
      }
      const isOpen = !controller.parentItem || controller.parentItem.open;
      const shouldRun = isOpen && controller.inViewport && !controller.userPaused;
      if (shouldRun && controller.raf === null) {
        controller.render(figure, controller.elapsed);
        controller.raf = requestAnimationFrame(tick);
      } else if (!shouldRun && controller.raf !== null) {
        stopLoop();
      }
    }

    function togglePause() {
      if (reducedMotion.matches) return;
      controller.userPaused = !controller.userPaused;
      updateAria();
      sync();
    }

    figure.addEventListener("click", () => {
      togglePause();
    });

    figure.addEventListener("keydown", event => {
      if (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.code === "Space" ||
        event.key === "Enter" ||
        event.code === "Enter"
      ) {
        event.preventDefault();
        event.stopPropagation();
        togglePause();
      }
    });

    if (parentItem) {
      parentItem.addEventListener("toggle", sync);
    }

    controller.sync = sync;
    controller.stopLoop = stopLoop;
    controller.updateAria = updateAria;
    motionControllers.set(type, controller);
    sync();
  });

  if (motionFigures.length > 0) {
    const motionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const type = entry.target.dataset.motion;
        const controller = motionControllers.get(type);
        if (!controller) return;
        controller.inViewport = entry.isIntersecting;
        controller.sync();
      });
    }, { root: null, threshold: 0.15 });

    motionFigures.forEach(figure => motionObserver.observe(figure));
    reducedMotion.addEventListener("change", () => {
      motionControllers.forEach(controller => controller.sync());
    });
  }

  window.__setDiagramMotionTime = (type, seconds) => {
    const controller = motionControllers.get(type);
    if (!controller) return false;
    controller.userPaused = true;
    controller.updateAria();
    controller.stopLoop();
    controller.elapsed = seconds;
    controller.render(controller.figure, seconds);
    return true;
  };

  window.__getDiagramMotionState = type => {
    const controller = motionControllers.get(type);
    if (!controller) return null;
    return {
      elapsed: controller.elapsed,
      running: controller.raf !== null,
      inViewport: controller.inViewport,
      userPaused: controller.userPaused,
      role: controller.figure.getAttribute("role"),
      tabindex: controller.figure.getAttribute("tabindex"),
      ariaPressed: controller.figure.getAttribute("aria-pressed"),
      ariaLabel: controller.figure.getAttribute("aria-label"),
      ariaDescribedby: controller.figure.getAttribute("aria-describedby"),
      cursor: getComputedStyle(controller.figure).cursor
    };
  };

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
    motionControllers.forEach(controller => {
      controller.stopLoop();
      controller.render(controller.figure, controller.endSceneTime);
    });
  });
})();

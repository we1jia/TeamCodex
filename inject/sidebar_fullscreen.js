(() => {
  const TAB_ID = "team-context-sidebar-tab";
  const PAGE_ID = "team-context-fullscreen-page";
  const UI_VERSION = "inline-v93";

  function isPageActive() {
    const page = document.getElementById(PAGE_ID);
    if (!page) return false;
    return page.style.display !== "none" && !page.hidden && page.style.visibility !== "hidden";
  }

  const STORAGE_KEY = "team_context_config_v2";

  const TEAM_ICON_PATHS =
    '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M22 21v-2a4 4 0 0 0-3-3.87"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75"/>';
  const SEND_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

  function detectDeviceOS() {
    if (typeof window !== "undefined" && typeof window.__TEAM_CONTEXT_OS__ === "string" && window.__TEAM_CONTEXT_OS__) {
      const os = window.__TEAM_CONTEXT_OS__.toLowerCase();
      if (os.includes("darwin") || os.includes("mac")) return "mac";
      if (os.includes("win32") || os.includes("windows") || /^win/i.test(os)) return "win";
    }
    if (typeof navigator !== "undefined") {
      const p = (navigator.platform || "").toLowerCase();
      const ua = (navigator.userAgent || "").toLowerCase();
      if (p.includes("mac") || ua.includes("macintosh")) return "mac";
      if (p.includes("win") || ua.includes("windows")) return "win";
    }
    return "mac";
  }

  function formatDeviceUser(rawName) {
    const os = detectDeviceOS();
    const isWin = os === "win";
    const osLabel = isWin ? "Win" : "Mac";
    const osTag = isWin ? "win" : "mac";

    let baseName = String(rawName || "weijia").trim();
    // 清洗已存在的 (Mac)/(Win) 后缀，防止重复累加
    baseName = baseName.replace(/[\s_(-]*\b(mac|win)\b[\s_)-]*/gi, "").trim();
    if (baseName.toLowerCase() === "liuweijia" || baseName.toLowerCase() === "liu weijia") baseName = "weijia";
    if (!baseName) baseName = "weijia";

    const nickname = `${baseName} (${osLabel})`;
    const cleanId = baseName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
    const memberId = `${cleanId}_${osTag}`;

    return { baseName, nickname, memberId, osTag, osLabel };
  }

  function detectCurrentUserName() {
    let raw = "weijia";
    try {
      const profileBtn = document.querySelector(
        "[data-testid='profile-button'], button[aria-label*='账户'], button[aria-label*='Account'], button[aria-label*='个人资料']"
      );
      if (profileBtn) {
        const name = (profileBtn.textContent || profileBtn.getAttribute("aria-label") || "")
          .replace(/账户|Account|设置|Settings|个人资料/g, "")
          .trim();
        if (name && name.length > 0 && name.length < 30) raw = name;
      } else {
        const avatarImg = document.querySelector("aside img[alt]:not([alt=''])");
        if (avatarImg && avatarImg.alt && !/avatar|logo|icon|chatgpt|openai/i.test(avatarImg.alt)) {
          raw = avatarImg.alt.trim();
        }
      }
    } catch {}
    return formatDeviceUser(raw).nickname;
  }

  function getDefaultConfig() {
    const defaultHost = (window.__TEAM_CONTEXT_HOST__ || "http://127.0.0.1:18765").replace(/\/?\?.*$/, "").replace(/\/$/, "");
    const devUser = formatDeviceUser(detectCurrentUserName());
    const defaultRoom = window.__TEAM_CONTEXT_DEFAULT_ROOM__ || "1024";
    const defaultRoomKey = window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__ || (defaultRoom === "1024" ? "123456" : "");
    const roomKeys = {
      "1024": "123456",
    };
    if (defaultRoom && defaultRoomKey) {
      roomKeys[defaultRoom] = defaultRoomKey;
    }
    return {
      hubUrl: defaultHost,
      roomId: defaultRoom,
      roomKey: roomKeys[defaultRoom] || "",
      roomKeys,
      nickname: devUser.nickname,
      memberId: devUser.memberId,
      historyRooms: Array.from(new Set([defaultRoom, "1024", "Media"])),
      autoConnect: true,
    };
  }

  function loadConfig() {
    const def = getDefaultConfig();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          let roomId = typeof parsed.roomId === "string" && parsed.roomId.trim() ? parsed.roomId.trim() : def.roomId;
          const roomKeys = { ...(def.roomKeys || {}), ...(parsed.roomKeys && typeof parsed.roomKeys === "object" ? parsed.roomKeys : {}) };
          if (!roomKeys["1024"]) roomKeys["1024"] = "123456";

          let hubUrl = typeof parsed.hubUrl === "string" && parsed.hubUrl.trim() ? parsed.hubUrl.trim() : def.hubUrl;
          // 若检测到 window.__TEAM_CONTEXT_HOST__ 传入了非默认且有效的地址（如 10.211.55.2），且与本地 localStorage 不一致，优先以运行时传入的地址为准
          const runtimeHost = typeof window.__TEAM_CONTEXT_HOST__ === "string" ? window.__TEAM_CONTEXT_HOST__.trim() : "";
          let isRemoteRuntime = false;
          if (runtimeHost) {
            const cleanRuntimeHost = runtimeHost.replace(/\/?\?.*$/, "").replace(/\/$/, "");
            if (cleanRuntimeHost && cleanRuntimeHost !== "http://127.0.0.1:18765" && cleanRuntimeHost !== "http://localhost:18765") {
              if (hubUrl !== cleanRuntimeHost) {
                hubUrl = cleanRuntimeHost;
              }
              isRemoteRuntime = true;
            }
          }

          // 运行时如果指定了默认房间（例如 1024），或者在跨机连接场景下之前遗留的房间是 Media，强制升级为默认协作房间
          const runtimeRoom = typeof window.__TEAM_CONTEXT_DEFAULT_ROOM__ === "string" ? window.__TEAM_CONTEXT_DEFAULT_ROOM__.trim() : "";
          if (runtimeRoom && (roomId === "Media" || !roomId || isRemoteRuntime)) {
            roomId = runtimeRoom;
          }
          const runtimeRoomKey = typeof window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__ === "string" ? window.__TEAM_CONTEXT_DEFAULT_ROOM_KEY__.trim() : "";
          if (runtimeRoomKey) {
            roomKeys[roomId] = runtimeRoomKey;
            if (runtimeRoom) roomKeys[runtimeRoom] = runtimeRoomKey;
          }

          const roomKey = (roomId === "1024" ? (roomKeys["1024"] || "123456") : "") || roomKeys[roomId] || (typeof parsed.roomKey === "string" && parsed.roomKey ? parsed.roomKey : "");
          const historyRooms = Array.isArray(parsed.historyRooms) && parsed.historyRooms.length
            ? Array.from(new Set([roomId, ...parsed.historyRooms.filter((r) => typeof r === "string" && r.trim())]))
            : def.historyRooms;

          const rawNick = typeof parsed.nickname === "string" && parsed.nickname.trim() ? parsed.nickname.trim() : def.nickname;
          const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(rawNick) : { nickname: rawNick, memberId: rawNick };

          return {
            hubUrl,
            roomId,
            roomKey,
            roomKeys: { ...roomKeys, [roomId]: roomKey },
            nickname: devUser.nickname,
            memberId: devUser.memberId,
            historyRooms,
            autoConnect: parsed.autoConnect !== false,
          };
        }
      }
    } catch {}
    return def;
  }

  function saveConfig(cfg) {
    try {
      if (cfg && cfg.roomId) {
        cfg.roomKeys = { ...(cfg.roomKeys || {}), [cfg.roomId]: cfg.roomKey || "" };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }

  function isCodexLight() {
    const html = document.documentElement;
    const theme = html.getAttribute("data-theme") || html.getAttribute("theme") || document.body?.getAttribute?.("data-theme");
    if (theme === "light") return true;
    if (theme === "dark") return false;
    if (html.classList.contains("dark") || document.body?.classList?.contains("dark")) return false;
    if (html.classList.contains("light") || document.body?.classList?.contains("light")) return true;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  function parseRgb(colorStr) {
    if (!colorStr) return null;
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    return null;
  }

  function readHostThemeTokens() {
    const isLight = isCodexLight();
    
    let probe = document.getElementById("team-context-theme-prober");
    if (!probe) {
      probe = document.createElement("div");
      probe.id = "team-context-theme-prober";
      probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden;pointer-events:none;";
      document.documentElement.appendChild(probe);
    }

    function probeStyle(className, prop = "backgroundColor") {
      probe.className = className;
      const val = window.getComputedStyle(probe)[prop];
      return (val && val !== "rgba(0, 0, 0, 0)" && val !== "transparent") ? val : null;
    }

    const realBodyBg = typeof window !== "undefined" ? window.getComputedStyle(document.body).backgroundColor : null;
    const validBodyBg = (realBodyBg && realBodyBg !== "rgba(0, 0, 0, 0)" && realBodyBg !== "transparent") ? realBodyBg : null;
    const hostBg = probeStyle("bg-token-main-surface-primary") ||
                   probeStyle("bg-surface") ||
                   validBodyBg ||
                   (isLight ? "rgb(246, 246, 246)" : "rgb(24, 24, 24)");
    const realBodyColor = typeof window !== "undefined" ? window.getComputedStyle(document.body).color : null;
    const validBodyColor = (realBodyColor && realBodyColor !== "rgba(0, 0, 0, 0)" && realBodyColor !== "transparent") ? realBodyColor : null;
    const hostColor = probeStyle("text-token-text-primary", "color") ||
                      probeStyle("text-primary", "color") ||
                      validBodyColor ||
                      (isLight ? "rgb(26, 28, 31)" : "rgb(255, 255, 255)");

    let probedInfoBg = probeStyle("bg-info-solid");
    let probedSendBg = probeStyle("bg-composer-primary");
    let probedBubbleBg = probeStyle("bg-user-message");
    let probedBubbleText = probeStyle("text-user-message", "color");

    const nativeBubble = document.querySelector("[data-user-message-bubble]") || document.querySelector(".bg-user-message");
    if (nativeBubble) {
      const cs = window.getComputedStyle(nativeBubble);
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") probedBubbleBg = cs.backgroundColor;
      if (cs.color) probedBubbleText = cs.color;
    }

    const nativeSend = document.querySelector("button.bg-composer-primary, button[data-testid*='send'], button[aria-label*='发送'], button[aria-label*='Send']");
    if (nativeSend) {
      const cs = window.getComputedStyle(nativeSend);
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") probedSendBg = cs.backgroundColor;
    }

    let detectedFamily = "blue";
    const asideDots = Array.from(document.querySelectorAll("aside span.bg-info-solid, aside [class*=\"bg-info\"], aside [class*=\"bg-composer\"]"));
    let foundDotFamily = null;
    for (const dot of asideDots) {
      const cs = window.getComputedStyle(dot).backgroundColor;
      const rgb = parseRgb(cs);
      if (rgb && (rgb.r > 20 || rgb.g > 20 || rgb.b > 20)) {
        if ((rgb.r > 100 && rgb.b > 140 && rgb.g < 170) || (Math.abs(rgb.r - rgb.b) < 85 && rgb.r > rgb.g && rgb.b > rgb.g)) {
          foundDotFamily = "purple";
          break;
        } else if (rgb.g > rgb.r && rgb.g > rgb.b && (rgb.g - Math.max(rgb.r, rgb.b) >= 10)) {
          foundDotFamily = "green";
          break;
        } else if (rgb.b > rgb.r && rgb.b > rgb.g && (rgb.b - Math.max(rgb.r, rgb.g) >= 10)) {
          foundDotFamily = "blue";
          break;
        }
      }
    }

    if (foundDotFamily) {
      detectedFamily = foundDotFamily;
    } else {
      const colorSamples = [probedSendBg, probedInfoBg, probedBubbleBg].map(parseRgb).filter(Boolean);
      let purpleVotes = 0;
      let greenVotes = 0;
      let blueVotes = 0;
      for (const c of colorSamples) {
        if ((c.r > 100 && c.b > 140 && c.g < 170) || (Math.abs(c.r - c.b) < 85 && c.r > c.g && c.b > c.g)) {
          purpleVotes++;
        } else if (c.g > c.r && c.g > c.b && (c.g - Math.max(c.r, c.b) >= 8)) {
          greenVotes++;
        } else if (c.b > c.r && c.b > c.g && (c.b - Math.max(c.r, c.g) >= 8)) {
          blueVotes++;
        }
      }
      if (purpleVotes >= greenVotes && purpleVotes >= blueVotes && purpleVotes > 0) detectedFamily = "purple";
      else if (greenVotes > blueVotes) detectedFamily = "green";
      else if (blueVotes > greenVotes) detectedFamily = "blue";
    }

    let bubbleBg = null;
    let bubbleText = null;
    let accentColor = null;
    let composerSendBg = null;

    if (detectedFamily === "purple") {
      accentColor = probedSendBg || (isLight ? "rgb(137, 82, 238)" : "rgb(166, 125, 242)");
      composerSendBg = probedSendBg || (isLight ? "rgb(137, 82, 238)" : "rgb(147, 51, 234)");
      if (isLight) {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("232, 243, 254") && !probedBubbleBg.includes("222, 243, 229")) ? probedBubbleBg : "rgb(243, 238, 253)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("12, 39, 74") && !probedBubbleText.includes("20, 54, 26")) ? probedBubbleText : "rgb(38, 20, 60)";
      } else {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("23, 62, 118") && !probedBubbleBg.includes("44, 103, 50")) ? probedBubbleBg : "rgb(74, 43, 124)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("246, 250, 254") && !probedBubbleText.includes("239, 250, 243")) ? probedBubbleText : "rgb(250, 246, 255)";
      }
    } else if (detectedFamily === "green") {
      if (isLight) {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("232, 243, 254") && !probedBubbleBg.includes("23, 62, 118")) ? probedBubbleBg : "rgb(222, 243, 229)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("12, 39, 74") && !probedBubbleText.includes("246, 250, 254")) ? probedBubbleText : "rgb(20, 54, 26)";
        accentColor = (probedSendBg && !probedSendBg.includes("58, 131, 247")) ? probedSendBg : (probedInfoBg || "rgb(83, 181, 89)");
        composerSendBg = (probedSendBg && !probedSendBg.includes("58, 131, 247")) ? probedSendBg : "rgb(83, 181, 89)";
      } else {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("232, 243, 254") && !probedBubbleBg.includes("23, 62, 118")) ? probedBubbleBg : "rgb(44, 103, 50)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("12, 39, 74") && !probedBubbleText.includes("246, 250, 254")) ? probedBubbleText : "rgb(239, 250, 243)";
        accentColor = (probedSendBg && !probedSendBg.includes("58, 131, 247")) ? probedSendBg : (probedInfoBg || "rgb(83, 181, 89)");
        composerSendBg = (probedSendBg && !probedSendBg.includes("58, 131, 247")) ? probedSendBg : "rgb(72, 160, 76)";
      }
    } else {
      if (isLight) {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("222, 243, 229") && !probedBubbleBg.includes("44, 103, 50")) ? probedBubbleBg : "rgb(232, 243, 254)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("20, 54, 26") && !probedBubbleText.includes("239, 250, 243")) ? probedBubbleText : "rgb(12, 39, 74)";
        accentColor = (probedSendBg && !probedSendBg.includes("83, 181, 89") && !probedSendBg.includes("72, 160, 76")) ? probedSendBg : (probedInfoBg || "rgb(58, 131, 247)");
        composerSendBg = (probedSendBg && !probedSendBg.includes("83, 181, 89") && !probedSendBg.includes("72, 160, 76")) ? probedSendBg : "rgb(58, 131, 247)";
      } else {
        bubbleBg = (probedBubbleBg && !probedBubbleBg.includes("222, 243, 229") && !probedBubbleBg.includes("44, 103, 50")) ? probedBubbleBg : "rgb(23, 62, 118)";
        bubbleText = (probedBubbleText && !probedBubbleText.includes("20, 54, 26") && !probedBubbleText.includes("239, 250, 243")) ? probedBubbleText : "rgb(246, 250, 254)";
        accentColor = (probedSendBg && !probedSendBg.includes("83, 181, 89") && !probedSendBg.includes("72, 160, 76")) ? probedSendBg : (probedInfoBg || "rgb(58, 131, 247)");
        composerSendBg = (probedSendBg && !probedSendBg.includes("83, 181, 89") && !probedSendBg.includes("72, 160, 76")) ? probedSendBg : "rgb(44, 103, 197)";
      }
    }

    let composerBg = isLight ? "rgb(255, 255, 255)" : "oklab(0.297161 0.0000135154 0.00000594556 / 0.864706)";
    let composerBorder = isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "none";
    let composerShadow = isLight ? "0 2px 14px rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.2) 0px 0px 1px 0px inset";

    const bgCard = isLight ? "#f7f7f8" : "rgba(255, 255, 255, 0.06)";
    const bgCardHover = isLight ? "#ededf0" : "rgba(255, 255, 255, 0.1)";
    const bgChip = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)";
    const chipText = isLight ? "#26282b" : "#e5e5e5";
    const borderSubtle = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
    const borderStrong = isLight ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.16)";
    const railMarker = isLight ? "rgba(26, 28, 31, 0.494)" : "rgba(255, 255, 255, 0.498)";
    const railMarkerActive = isLight ? "#1a1c1f" : "#ffffff";
    const previewBg = isLight ? "rgba(255, 255, 255, 0.96)" : "rgba(36, 36, 36, 0.95)";

    return {
      isLight,
      detectedFamily,
      hostBg,
      hostColor,
      bubbleBg,
      bubbleText,
      accentColor,
      composerSendBg,
      composerBg,
      composerBorder,
      composerShadow,
      bgCard,
      bgCardHover,
      bgChip,
      chipText,
      borderSubtle,
      borderStrong,
      railMarker,
      railMarkerActive,
      previewBg,
    };
  }

  function applyCodexTheme(page) {
    if (!page) return;
    const tokens = readHostThemeTokens();
    page.dataset.theme = tokens.isLight ? "light" : "dark";
    page.dataset.themeFamily = tokens.detectedFamily;
    page.style.background = tokens.hostBg;
    page.style.color = tokens.hostColor;

    const setVars = (el) => {
      if (!el) return;
      el.style.setProperty("--bg-page", tokens.hostBg);
      el.style.setProperty("--text-primary", tokens.hostColor);
      el.style.setProperty("--text-secondary", tokens.isLight ? "#646a73" : "#a1a1aa");
      el.style.setProperty("--text-muted", tokens.isLight ? "#8f959e" : "#71717a");
      el.style.setProperty("--human-bubble-bg", tokens.bubbleBg);
      el.style.setProperty("--human-bubble-text", tokens.bubbleText);
      el.style.setProperty("--ai-bubble-text", tokens.hostColor);
      el.style.setProperty("--accent-color", tokens.accentColor);
      el.style.setProperty("--composer-send-bg", tokens.composerSendBg);
      el.style.setProperty("--composer-bg", tokens.composerBg);
      el.style.setProperty("--composer-border", tokens.composerBorder);
      el.style.setProperty("--composer-shadow", tokens.composerShadow);
      el.style.setProperty("--composer-text", tokens.hostColor);
      el.style.setProperty("--bg-card", tokens.bgCard);
      el.style.setProperty("--bg-card-hover", tokens.bgCardHover);
      el.style.setProperty("--bg-chip", tokens.bgChip);
      el.style.setProperty("--chip-text", tokens.chipText);
      el.style.setProperty("--border-subtle", tokens.borderSubtle);
      el.style.setProperty("--border-strong", tokens.borderStrong);
      el.style.setProperty("--rail-marker", tokens.railMarker);
      el.style.setProperty("--rail-marker-active", tokens.railMarkerActive);
      el.style.setProperty("--preview-bg", tokens.previewBg);
    };

    setVars(page);
    const shadow = page.shadowRoot;
    if (shadow) {
      const wrap = shadow.querySelector(".wrap");
      if (wrap) {
        wrap.classList.toggle("theme-light", tokens.isLight);
        wrap.classList.toggle("theme-dark", !tokens.isLight);
        wrap.dataset.themeFamily = tokens.detectedFamily;
        wrap.style.background = tokens.hostBg;
        wrap.style.color = tokens.hostColor;
        setVars(wrap);
      }
    }

    setTabActive(isPageActive());
  }

  function textOf(node) {
    return (node?.getAttribute?.("aria-label") || node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findSidebar() {
    return document.querySelector("aside.app-shell-left-panel");
  }

  function findNav() {
    return document.querySelector('aside.app-shell-left-panel nav[role="navigation"], nav[role="navigation"]');
  }

  function findInsertionButton(navigation) {
    const buttons = Array.from(navigation.querySelectorAll("button"));
    return (
      buttons.find((button) => /^(插件|Plugins)$/i.test(textOf(button))) ||
      buttons.find((button) => /^(定时任务|Scheduled tasks?)$/i.test(textOf(button))) ||
      buttons[buttons.length - 1]
    );
  }

  function listSidebarThreads() {
    return [...document.querySelectorAll("[data-app-action-sidebar-thread-id]")]
      .map((el) => ({
        id: el.getAttribute("data-app-action-sidebar-thread-id") || "",
        title: (
          el.getAttribute("data-app-action-sidebar-thread-title") ||
          el.getAttribute("aria-label") ||
          ""
        ).replace(/\s+/g, " ").trim(),
        selected: el.getAttribute("data-app-action-sidebar-thread-selected") === "true",
      }))
      .filter((item) => item.id && item.title && item.title !== "true");
  }

  function currentThread() {
    return listSidebarThreads().find((item) => item.selected) || null;
  }

  function setTabActive(active) {
    const isNowActive = Boolean(active);
    const wrapper = document.getElementById(TAB_ID);
    const button = wrapper?.querySelector("button");
    if (button) {
      button.dataset.active = String(isNowActive);
      button.setAttribute("aria-current", isNowActive ? "page" : "false");
      button.setAttribute("aria-pressed", String(isNowActive));
      button.setAttribute("data-state", isNowActive ? "active" : "inactive");
    }
    if (wrapper) {
      wrapper.dataset.active = String(isNowActive);
      const light = isCodexLight();
      wrapper.dataset.theme = light ? "light" : "dark";
    }

    // 关键：侧栏单一选中互斥控制
    // 当 TeamCodex 处于全屏激活时，侧栏唯一的选中项是 TeamCodex；
    // 标记 data-team-codex-open，消除原生对话项的残留高亮，彻底杜绝“同时出现2个选中菜单”；
    // 当退出 TeamCodex 时移除标记，原生对话高亮背景立刻无损恢复。
    if (isNowActive) {
      document.documentElement.setAttribute("data-team-codex-open", "true");
    } else {
      document.documentElement.removeAttribute("data-team-codex-open");
      document.body?.removeAttribute("data-team-codex-open");
    }

    ensureTabStyles();
  }

  function ensureTabStyles() {
    let style = document.getElementById(`${TAB_ID}-style`);
    if (!style) {
      style = document.createElement("style");
      style.id = `${TAB_ID}-style`;
      document.head.appendChild(style);
    }
    style.textContent = `
      #${TAB_ID} { display: block; }
      #${TAB_ID} button {
        transition: background-color 160ms cubic-bezier(.22,1,.36,1), color 160ms cubic-bezier(.22,1,.36,1), box-shadow 160ms cubic-bezier(.22,1,.36,1);
      }

      /* 侧栏单一选中互斥：当 TeamCodex 全屏激活时，压制其他项的高亮选中背景，保持单一当前选中菜单 */
      html[data-team-codex-open="true"] aside [data-app-action-sidebar-thread-selected="true"],
      html[data-team-codex-open="true"] aside [data-app-action-sidebar-thread-selected="true"] > *,
      html[data-team-codex-open="true"] aside [data-active="true"]:not(#team-context-sidebar-tab):not(#team-context-sidebar-tab *),
      html[data-team-codex-open="true"] aside [aria-current="page"]:not(#team-context-sidebar-tab):not(#team-context-sidebar-tab *),
      html[data-team-codex-open="true"] aside [class*="bg-token-sidebar-surface-tertiary"],
      html[data-team-codex-open="true"] aside [class*="bg-token-main-surface-tertiary"] {
        background: transparent !important;
        background-color: transparent !important;
        box-shadow: none !important;
      }
      #${TAB_ID} button svg {
        transition: color 160ms ease, opacity 160ms ease;
      }
      
      :root:not([data-theme="dark"]) #${TAB_ID} button:not([data-active="true"]),
      html[data-theme="light"] #${TAB_ID} button:not([data-active="true"]),
      #${TAB_ID}[data-theme="light"] button:not([data-active="true"]) {
        background: transparent !important;
        color: rgb(26, 28, 31) !important;
        box-shadow: none !important;
      }
      :root:not([data-theme="dark"]) #${TAB_ID} button:not([data-active="true"]) svg,
      html[data-theme="light"] #${TAB_ID} button:not([data-active="true"]) svg,
      #${TAB_ID}[data-theme="light"] button:not([data-active="true"]) svg {
        color: rgba(26, 28, 31, 0.85) !important;
        fill: none !important;
        stroke: currentColor !important;
        opacity: 0.85 !important;
      }
      :root:not([data-theme="dark"]) #${TAB_ID} button:not([data-active="true"]):hover,
      html[data-theme="light"] #${TAB_ID} button:not([data-active="true"]):hover,
      #${TAB_ID}[data-theme="light"] button:not([data-active="true"]):hover {
        background: rgba(0, 0, 0, 0.05) !important;
      }

      :root:not([data-theme="dark"]) #${TAB_ID} button[data-active="true"],
      html[data-theme="light"] #${TAB_ID} button[data-active="true"],
      #${TAB_ID}[data-theme="light"] button[data-active="true"] {
        background: rgba(0, 0, 0, 0.08) !important;
        color: rgb(26, 28, 31) !important;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04) !important;
      }
      :root:not([data-theme="dark"]) #${TAB_ID} button[data-active="true"] svg,
      html[data-theme="light"] #${TAB_ID} button[data-active="true"] svg,
      #${TAB_ID}[data-theme="light"] button[data-active="true"] svg {
        color: rgb(26, 28, 31) !important;
        fill: none !important;
        stroke: currentColor !important;
        opacity: 1 !important;
      }

      html[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]),
      :root[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]),
      #${TAB_ID}[data-theme="dark"] button:not([data-active="true"]) {
        background: transparent !important;
        color: #ececec !important;
        box-shadow: none !important;
      }
      html[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]) svg,
      :root[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]) svg,
      #${TAB_ID}[data-theme="dark"] button:not([data-active="true"]) svg {
        color: rgba(255, 255, 255, 0.85) !important;
        fill: none !important;
        stroke: currentColor !important;
        opacity: 0.85 !important;
      }
      html[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]):hover,
      :root[data-theme="dark"] #${TAB_ID} button:not([data-active="true"]):hover,
      #${TAB_ID}[data-theme="dark"] button:not([data-active="true"]):hover {
        background: rgba(255, 255, 255, 0.06) !important;
      }

      html[data-theme="dark"] #${TAB_ID} button[data-active="true"],
      :root[data-theme="dark"] #${TAB_ID} button[data-active="true"],
      #${TAB_ID}[data-theme="dark"] button[data-active="true"] {
        background: rgba(255, 255, 255, 0.12) !important;
        color: #ffffff !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
      }
      html[data-theme="dark"] #${TAB_ID} button[data-active="true"] svg,
      :root[data-theme="dark"] #${TAB_ID} button[data-active="true"] svg,
      #${TAB_ID}[data-theme="dark"] button[data-active="true"] svg {
        color: #ffffff !important;
        fill: none !important;
        stroke: currentColor !important;
        opacity: 1 !important;
      }

      #${TAB_ID} button:focus-visible {
        outline: 2px solid var(--accent-color, rgb(58, 131, 247)) !important;
        outline-offset: -2px;
      }
    `;
  }

  function getTitlebarHeight() {
    const isWin =
      /Windows|Win32|Win64/i.test(navigator.userAgent || navigator.platform || "") ||
      window.__TEAM_CONTEXT_OS__ === "win32" ||
      (typeof process !== "undefined" && process?.platform === "win32");
    if (!isWin) return 0;

    // 1. 优先探测原生侧边栏顶部相对于窗口顶部的距离（菜单栏下方）
    const sidebar = findSidebar();
    if (sidebar) {
      const sr = sidebar.getBoundingClientRect();
      if (sr.top >= 28 && sr.top <= 60) return Math.round(sr.top);
    }

    // 2. 探测右侧主工作区（main / thread-scroll-container）的实际 top 偏移
    const mainCandidate =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector(".thread-scroll-container") ||
      document.querySelector("aside.app-shell-left-panel + *");
    if (mainCandidate) {
      const mr = mainCandidate.getBoundingClientRect();
      if (mr.top >= 28 && mr.top <= 60) return Math.round(mr.top);
    }

    // 3. 探测系统/自定义菜单栏容器高度
    const headerEl = document.querySelector("header, [data-testid='titlebar'], .titlebar");
    if (headerEl) {
      const hr = headerEl.getBoundingClientRect();
      if (hr.height >= 28 && hr.height <= 60) return Math.round(hr.height);
    }

    // 4. Windows 11 原生菜单栏（文件 编辑 视图 帮助）物理避让标准兜底：38px
    return 38;
  }

  function positionPage(page) {
    const sidebar = findSidebar();
    const rect = sidebar?.getBoundingClientRect?.();
    const isSidebarVisible = !!(rect && rect.width > 50 && window.getComputedStyle(sidebar).display !== "none" && window.getComputedStyle(sidebar).visibility !== "hidden");
    const leftOffset = isSidebarVisible ? Math.max(0, rect.right) : 0;
    const topOffset = getTitlebarHeight();

    page.style.left = `${leftOffset}px`;
    page.style.top = `${topOffset}px`;
    page.style.right = "0px";
    page.style.bottom = "0px";
    page.style.height = topOffset > 0 ? `calc(100vh - ${topOffset}px)` : "100vh";
    page.style.maxHeight = topOffset > 0 ? `calc(100vh - ${topOffset}px)` : "100vh";
    page.style.boxSizing = "border-box";

    const isWindows = /Windows|Win32|Win64/i.test(navigator.userAgent || navigator.platform || "");
    if (isWindows) {
      page.dataset.platform = "windows";
      page.setAttribute("data-platform", "windows");
    }

    const isCollapsed = !isSidebarVisible || leftOffset < 60;
    page.dataset.sidebarCollapsed = String(isCollapsed);
    const wrap = page.shadowRoot?.querySelector(".wrap");
    if (wrap) {
      wrap.dataset.sidebarCollapsed = String(isCollapsed);
      if (isWindows) wrap.dataset.platform = "windows";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function hideNativeAppShellHeader() {
    try {
      const headers = document.querySelectorAll('header[data-pip-obstacle="app-shell-header"], header.draggable');
      headers.forEach((h) => {
        if (!("teamContextPrevDisplay" in h.dataset)) {
          h.dataset.teamContextPrevDisplay = h.style.display || "";
          h.style.display = "none";
        }
      });
    } catch (_) {}
  }

  function restoreNativeAppShellHeader() {
    try {
      const headers = document.querySelectorAll('header[data-pip-obstacle="app-shell-header"], header.draggable');
      headers.forEach((h) => {
        if ("teamContextPrevDisplay" in h.dataset) {
          h.style.display = h.dataset.teamContextPrevDisplay;
          delete h.dataset.teamContextPrevDisplay;
        }
      });
    } catch (_) {}
  }

  function closePage() {
    const page = document.getElementById(PAGE_ID);
    if (page) {
      page.style.display = "none";
      page.style.visibility = "hidden";
    }
    setTabActive(false);
    document.documentElement.removeAttribute("data-team-codex-open");
    document.body?.removeAttribute("data-team-codex-open");
    restoreNativeAppShellHeader();
  }

  function showNativeAppToast(msg) {
    if (typeof document === "undefined") return;
    let toast = document.getElementById("__team_context_global_toast__");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__team_context_global_toast__";
      toast.style.cssText = "position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(24,24,27,0.95);color:#fff;padding:8px 18px;border-radius:20px;font-size:12.5px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.38);z-index:2147483647;pointer-events:none;transition:opacity 0.18s ease,transform 0.18s ease;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
    }, 2400);
  }

  function triggerSidebarThreadClick(thread) {
    if (!thread) return false;
    let target = null;
    if (thread.id) {
      target = document.querySelector(`[data-app-action-sidebar-thread-id="${CSS.escape(thread.id)}"]`);
    }
    if (!target && thread.title) {
      target = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-id]")).find(
        (el) => (el.getAttribute("data-app-action-sidebar-thread-title") || el.getAttribute("aria-label") || el.textContent || "").trim() === thread.title.trim()
      );
    }
    if (!target) return false;
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.click();
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    return true;
  }

  function returnToConversation() {
    closePage();
  }

  function insertIntoComposer(text) {
    const editor = document.querySelector(".ProseMirror");
    if (!editor) return false;
    try {
      editor.focus();
      // 方案 1 (最高稳定性)：构造标准剪贴板粘贴事件，ProseMirror 原生捕获并生成文档事务，完整支持富文本与多行换行
      if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const pasteEvt = new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        editor.dispatchEvent(pasteEvt);
        return true;
      }
    } catch (_) {}

    try {
      editor.focus();
      const ok = document.execCommand("insertText", false, text);
      if (ok) return true;
    } catch (_) {}

    try {
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    } catch (_) {}
    return true;
  }

  function safeInsertIntoComposer(text, maxWaitMs = 4000, options = {}) {
    const { expectedThreadId = null, isNewThread = false, previousThreadId = null } = typeof options === "object" && options ? options : { expectedThreadId: options };
    return new Promise((resolve) => {
      const startTime = Date.now();
      let waitedForNewMount = false;

      const attempt = () => {
        // 1. 若为跨会话切换，等待左侧栏目标会话真正被选中
        if (expectedThreadId) {
          const currentSelected = document.querySelector('[data-app-action-sidebar-thread-selected="true"]');
          const currentId = currentSelected?.getAttribute("data-app-action-sidebar-thread-id");
          if (currentId !== expectedThreadId && Date.now() - startTime < maxWaitMs) {
            setTimeout(attempt, 60);
            return;
          }
        }

        // 2. 若为新建会话，等待旧会话卸载（当前不再是 previousThreadId）
        if (isNewThread && previousThreadId) {
          const currentSelected = document.querySelector('[data-app-action-sidebar-thread-selected="true"]');
          const currentId = currentSelected?.getAttribute("data-app-action-sidebar-thread-id");
          if (currentId === previousThreadId && Date.now() - startTime < 1200) {
            setTimeout(attempt, 60);
            return;
          }
        }

        // 3. 路由切换后的缓冲：跨会话或新建会话时，额外等待 120ms 确保 React 卸载旧编辑器并挂载全新空白 ProseMirror
        if ((expectedThreadId || isNewThread) && !waitedForNewMount) {
          waitedForNewMount = true;
          setTimeout(attempt, 120);
          return;
        }

        const editor = document.querySelector(".ProseMirror");
        if (editor) {
          const ok = insertIntoComposer(text);
          resolve(ok);
          return;
        }

        if (Date.now() - startTime < maxWaitMs) {
          setTimeout(attempt, 60);
        } else {
          resolve(false);
        }
      };

      // 跨会话或新建会话时先给 React 100ms 响应路由跳转，防止第 0ms 误中旧会话输入框
      if (expectedThreadId || isNewThread) {
        setTimeout(attempt, 100);
      } else {
        attempt();
      }
    });
  }

  function openCodexThread(thread) {
    closePage();
    triggerSidebarThreadClick(thread);
  }

  function mountCollab(page) {
    let config = loadConfig();
    let connState = {
      status: "connecting", // "disconnected" | "connecting" | "connected" | "error"
      onlineCount: 1,
      errorMessage: "",
      availableRooms: [],
    };
    let sseSource = null;
    let snapshotPollTimer = null;
    let snapshotPollInFlight = false;
    let bridgeSseListenerBound = false;
    let roomDeletionInFlight = false;

    const defaultRoomId = () => {
      const fromConfig = String(config.roomId || "").trim();
      if (fromConfig) return fromConfig;
      const runtimeRoom = typeof window.__TEAM_CONTEXT_DEFAULT_ROOM__ === "string"
        ? String(window.__TEAM_CONTEXT_DEFAULT_ROOM__).trim()
        : "";
      return runtimeRoom || "1024";
    };

    const isWindows = /Windows|Win32|Win64/i.test(navigator.userAgent || navigator.platform || "");
    if (isWindows) {
      page.dataset.platform = "windows";
      page.setAttribute("data-platform", "windows");
    }

    const root = page.shadowRoot || page.attachShadow({ mode: "open" });
    root.innerHTML = `

      <style>
        :host {
          display: block;
          height: 100%;
          overflow: hidden;
          --text-primary: #1a1c1f;
          --text-secondary: #646a73;
          --text-muted: #8f959e;
          --bg-page: #ffffff;
          --bg-card: #f7f7f8;
          --bg-card-hover: #ededf0;
          --bg-chip: rgba(0, 0, 0, 0.05);
          --chip-text: #26282b;
          --border-subtle: rgba(0, 0, 0, 0.06);
          --border-strong: rgba(0, 0, 0, 0.10);
          --composer-bg: #ffffff;
          --composer-border: 1px solid rgba(0, 0, 0, 0.08);
          --composer-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
          --composer-text: #1a1c1f;
          --human-bubble-bg: rgb(232, 243, 254);
          --human-bubble-text: rgb(12, 39, 74);
          --ai-bubble-text: #1a1c1f;
          --accent-color: rgb(58, 131, 247);
          --composer-send-bg: rgb(58, 131, 247);
          --rail-marker: rgba(26, 28, 31, 0.494);
          --rail-marker-active: #1a1c1f;
          --scrollbar-thumb: rgba(0, 0, 0, 0.15);
          --preview-bg: rgba(255, 255, 255, 0.96);
          --preview-text: #1a1c1f;
        }

        :host([data-theme="dark"]), .wrap.theme-dark {
          --text-primary: #ffffff;
          --text-secondary: #a1a1aa;
          --text-muted: #71717a;
          --bg-page: rgb(24, 24, 24);
          --bg-card: rgba(255, 255, 255, 0.06);
          --bg-card-hover: rgba(255, 255, 255, 0.1);
          --bg-chip: rgba(255, 255, 255, 0.08);
          --chip-text: #e5e5e5;
          --border-subtle: rgba(255, 255, 255, 0.06);
          --border-strong: rgba(255, 255, 255, 0.10);
          --composer-bg: oklab(0.297161 0.0000135154 0.00000594556 / 0.864706);
          --composer-border: 1px solid rgba(255, 255, 255, 0.06);
          --composer-shadow: 0 8px 28px -4px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.05);
          --composer-text: #ffffff;
          --human-bubble-bg: rgb(44, 103, 50);
          --human-bubble-text: rgb(239, 250, 243);
          --ai-bubble-text: #ffffff;
          --accent-color: rgb(83, 181, 89);
          --composer-send-bg: rgb(72, 160, 76);
          --rail-marker: rgba(255, 255, 255, 0.498);
          --rail-marker-active: #ffffff;
          --scrollbar-thumb: rgba(255, 255, 255, 0.15);
          --preview-bg: rgba(36, 36, 36, 0.95);
          --preview-text: #ffffff;
        }

        * { box-sizing: border-box; }
        .wrap {
          height: 100%;
          display: grid;
          grid-template-rows: auto 1fr auto;
          background: var(--bg-page);
          color: var(--text-primary);
          overflow: hidden;
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Segoe UI", sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          animation: collab-enter 180ms cubic-bezier(.22,1,.36,1);
          transition: background-color 0.2s ease, color 0.2s ease;
        }
        @keyframes collab-enter {
          from { opacity: 0; transform: translate3d(8px, 0, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .scroll {
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .scroll::-webkit-scrollbar-track { background: transparent; }
        .scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 99px; }
        
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 48px;
          height: 48px;
          padding: 0 20px;
          border-bottom: 1px solid var(--border-subtle);
          white-space: nowrap !important;
          user-select: none;
          box-sizing: border-box;
          transition: padding-left 0.18s cubic-bezier(0.2, 0, 0, 1);
          -webkit-app-region: no-drag !important;
          pointer-events: auto !important;
        }
        :host([data-sidebar-collapsed="true"]) .top,
        .wrap[data-sidebar-collapsed="true"] .top {
          padding-left: 84px !important;
        }

        .top, .top * {
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          -webkit-app-region: no-drag !important;
          pointer-events: auto !important;
        }
        .sidebar-toggle-btn {
          display: none;
          align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 6px; border: 1px solid transparent;
          background: transparent; color: var(--text-secondary); cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease;
          padding: 0;
          margin-right: 4px;
        }
        .sidebar-toggle-btn:hover {
          background: var(--bg-card-hover); color: var(--text-primary);
        }
        :host([data-sidebar-collapsed="true"]) .sidebar-toggle-btn,
        .wrap[data-sidebar-collapsed="true"] .sidebar-toggle-btn {
          display: inline-flex !important;
        }
        .top-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          line-height: 1;
        }
        .top-action-btn:hover {
          background: var(--bg-chip);
          color: var(--text-primary);
          border-color: var(--border-subtle);
        }
        .top-action-btn:active {
          background: var(--bg-card-hover);
        }
        .top-action-btn .header-icon {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
          color: var(--text-secondary);
          transition: color 0.15s ease;
        }
        .top-action-btn:hover .header-icon {
          color: var(--text-primary);
        }
        .exit-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 999px;
          border: 1px solid var(--border-subtle); background: var(--bg-chip);
          color: var(--text-primary); font-size: 12px; font-weight: 500; cursor: pointer;
          transition: all 0.15s ease;
        }
        .exit-btn:hover {
          background: var(--bg-card-hover); border-color: var(--border-strong);
        }
        .kbd-badge {
          display: inline-block; font-size: 10px; line-height: 1; padding: 2px 4px;
          border-radius: 4px; background: rgba(255, 255, 255, 0.12); color: var(--text-secondary);
          border: 1px solid var(--border-subtle); font-family: inherit;
        }
        :host([data-theme="light"]) .kbd-badge,
        .wrap.theme-light .kbd-badge {
          background: rgba(0, 0, 0, 0.06);
        }

        /* 状态与房间切换胶囊 */
        .room-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 550;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .room-status-pill:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pill-dot.connected {
          background: #10a37f;
          box-shadow: 0 0 6px rgba(16, 163, 127, 0.7);
        }
        .pill-dot.connecting {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.7);
          animation: pulse-dot 1.2s infinite ease-in-out;
        }
        .pill-dot.error {
          background: #ef4444;
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
        }
        .pill-dot.disconnected {
          background: var(--text-muted);
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
        .pill-chevron {
          opacity: 0.6;
          transition: transform 0.15s ease;
        }
        .room-status-pill[aria-expanded="true"] .pill-chevron {
          transform: rotate(180deg);
        }

        /* 快捷切换 Popover */
        .room-popover {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: 320px;
          background: var(--bg-page);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          box-shadow: 0 16px 40px -4px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.04);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 120;
          animation: popover-fade 0.15s cubic-bezier(0.2, 0, 0, 1);
        }
        @keyframes popover-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .room-popover[hidden] { display: none; }
        .popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .popover-title { font-weight: 600; font-size: 12.5px; letter-spacing: -0.01em; }
        .popover-sub { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace; }
        .popover-section { display: flex; flex-direction: column; gap: 6px; }
        .popover-label { font-size: 11px; font-weight: 550; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; }
        .history-room-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 100px;
          overflow-y: auto;
        }
        .room-tag-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-chip);
          padding: 2px 4px 2px 10px;
          font-size: 11.5px;
          color: var(--text-primary);
          transition: all 0.15s ease;
          user-select: none;
          max-width: 200px;
          box-sizing: border-box;
        }
        .room-tag-chip:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .room-tag-chip[data-active="true"] {
          background: var(--accent-color);
          color: #ffffff;
          border-color: transparent;
          font-weight: 600;
        }
        .room-tag-chip-name {
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 1px 2px 1px 0;
          line-height: 1.2;
          flex: 1;
        }
        .room-tag-chip-del {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: inherit;
          opacity: 0.55;
          cursor: pointer;
          font-size: 11px;
          line-height: 1;
          margin-left: 3px;
          padding: 0;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .room-tag-chip[data-active="true"] .room-tag-chip-del {
          color: inherit;
          opacity: 0.8;
        }
        .room-tag-chip-del:hover {
          background: color-mix(in srgb, currentColor 16%, transparent);
          color: inherit;
          opacity: 1;
        }
        .room-tag-chip.new-room-chip {
          border-style: dashed;
          border-color: var(--accent-color);
          color: var(--accent-color);
          background: transparent;
          padding: 2px 10px;
          cursor: pointer;
        }
        .room-tag-chip.new-room-chip:hover {
          background: rgba(16, 163, 127, 0.12);
        }
        .collab-token-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: rgba(16, 163, 127, 0.12);
          border: 1px solid rgba(16, 163, 127, 0.35);
          border-radius: 12px;
          padding: 7px 12px;
          margin-bottom: 8px;
          font-size: 12px;
          color: var(--text-primary);
        }
        .collab-token-bar[hidden] {
          display: none !important;
        }
        .collab-token-left {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
        }
        .collab-token-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .collab-token-btn {
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }
        .collab-token-btn.primary {
          background: var(--accent-color);
          color: #ffffff;
        }
        .collab-token-btn.primary:hover {
          opacity: 0.9;
        }
        .collab-token-btn.ghost {
          background: transparent;
          color: var(--text-secondary);
          border-color: var(--border-subtle);
        }
        .collab-token-btn.ghost:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }
        .room-history-item {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .popover-input {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          padding: 4px 8px;
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
        }
        .popover-input:focus { border-color: var(--accent-color); }
        .popover-btn {
          background: var(--accent-color);
          color: #ffffff;
          border: 0;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          cursor: pointer;
          font-weight: 500;
        }
        .popover-footer {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
        }
        .popover-link-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          margin: 0;
          background: transparent;
          border: 0;
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.2;
          cursor: pointer;
          padding: 8px 10px;
          text-align: left;
        }
        .popover-link-btn svg {
          flex-shrink: 0;
        }
        .popover-link-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          text-decoration: none;
        }
        .popover-link-btn.danger:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }

        .ghost { border: 0; cursor: pointer; font: 13px inherit; border-radius: 999px; padding: 6px 12px; background: transparent; color: var(--text-secondary); }
        .ghost:hover { background: var(--bg-chip); color: var(--text-primary); }
        .body { position: relative; min-height: 0; height: 100%; width: 100%; }
        .column { width: min(768px, calc(100% - 48px)); margin: 0 auto; }
        /* 顶部极简协同上下文栏 */
        .context-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 6px 2px 10px 2px;
          margin: 0;
          user-select: none;
          min-height: 28px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        :host([data-theme="light"]) .context-bar, .theme-light .context-bar {
          border-bottom-color: rgba(0, 0, 0, 0.06);
        }

        /* 左侧：纯文本面包屑上下文，无按钮外框，无生硬用词 */
        .context-path {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .context-room-badge {
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .context-divider {
          opacity: 0.35;
          font-weight: 300;
          flex-shrink: 0;
        }
        .context-thread-meta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          color: var(--text-secondary);
        }
        .context-thread-icon {
          flex-shrink: 0;
          opacity: 0.7;
        }
        .context-thread-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: min(380px, 45vw);
          color: var(--text-secondary);
          font-weight: 450;
        }

        /* 右侧：Avatar Stack 头像重叠组，无外边框文字胶囊 */
        .avatar-stack-container {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .avatar-stack {
          display: flex;
          align-items: center;
          position: relative;
        }
        .stack-avatar {
          position: relative;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10.5px;
          font-weight: 600;
          color: #ffffff;
          background: #374151;
          box-shadow: 0 0 0 2px var(--bg-page);
          margin-left: -5px;
          cursor: pointer;
          transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.16s ease, z-index 0.16s ease;
          outline: none;
          border: none;
          padding: 0;
          user-select: none;
        }
        .stack-avatar:first-child {
          margin-left: 0;
        }
        .stack-avatar:hover {
          transform: translateY(-1.5px) scale(1.1);
          z-index: 20;
          box-shadow: 0 0 0 2px var(--bg-page), 0 3px 8px rgba(0, 0, 0, 0.16);
        }
        .stack-avatar.is-active {
          box-shadow: 0 0 0 1.5px var(--bg-page), 0 0 0 3px var(--accent-color);
          z-index: 5;
        }
        .stack-avatar.is-active:hover {
          box-shadow: 0 0 0 1.5px var(--bg-page), 0 0 0 3px var(--accent-color), 0 3px 8px color-mix(in srgb, var(--accent-color) 35%, transparent);
        }
        .stack-avatar.is-ai {
          background: linear-gradient(135deg, #10a37f 0%, #059669 100%);
          font-size: 9px;
          letter-spacing: -0.2px;
        }
        .stack-avatar.is-human {
          background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
        }
        .stack-avatar.is-mac {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
        }
        .stack-avatar.is-win {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%) !important;
        }
        /* 隐藏外挂冗余设备角标，由头像内部微图标/文字优雅承载 */
        .stack-avatar .stack-device-badge {
          display: none !important;
        }
        .stack-avatar .stack-online-dot {
          position: absolute;
          right: -1px;
          bottom: -1px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10a37f;
          box-shadow: 0 0 0 1.5px var(--bg-page);
          pointer-events: none;
        }

        /* 邀请加号圆圈：微胶囊质感，与头像同规格，彻底无粗糙虚线 */
        .stack-invite-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed var(--border-subtle);
          background: var(--bg-chip);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
          outline: none;
          margin-left: 2px;
        }
        .stack-invite-btn:hover {
          border-color: var(--accent-color);
          border-style: solid;
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 12%, transparent);
          transform: translateY(-1px);
        }
        .stack-invite-btn.is-copied {
          border-color: var(--accent-color);
          border-style: solid;
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 18%, transparent);
        }

        .tool-btn {
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          background: color-mix(in srgb, var(--bg-chip) 85%, transparent);
          color: var(--text-secondary);
          border-radius: 999px;
          height: 28px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: -0.01em;
          display: inline-flex;
          align-items: center;
          gap: 5.5px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          outline: none;
          white-space: nowrap;
        }
        .tool-btn svg {
          flex-shrink: 0;
          opacity: 0.75;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .tool-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-strong);
          box-shadow: 0 3px 10px -2px rgba(0, 0, 0, 0.12);
          transform: translateY(-0.5px);
        }
        .tool-btn:hover svg {
          opacity: 1;
          transform: translateY(-0.5px);
        }
        .tool-btn:active {
          transform: scale(0.97);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        :host([data-theme="dark"]) .tool-btn,
        .wrap.theme-dark .tool-btn {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.07);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        :host([data-theme="dark"]) .tool-btn:hover,
        .wrap.theme-dark .tool-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.35);
        }
        .room-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 50px 24px;
          margin: 30px auto auto;
          max-width: 440px;
          border-radius: 16px;
          background: var(--bg-card);
          border: 1px dashed var(--border-subtle);
        }
        .empty-icon {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: rgba(58, 131, 247, 0.1);
          color: var(--accent-color);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .empty-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
        }
        .empty-desc {
          font-size: 12.5px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 18px;
        }
        .btn-share-empty {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px;
          border-radius: 8px;
          border: 1px solid var(--accent-color);
          background: var(--accent-color);
          color: #fff;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .btn-share-empty:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .toast-notification {
          position: fixed;
          top: 56px;
          left: 50%;
          transform: translateX(-50%);
          padding: 7px 16px;
          border-radius: 20px;
          background: rgba(20, 20, 20, 0.9);
          border: 1px solid var(--border-subtle);
          color: #fff;
          font-size: 12.5px;
          box-shadow: 0 8px 24px -4px rgba(0,0,0,0.35), 0 0 0 1px rgba(255, 255, 255, 0.05);
          z-index: 10000;
          pointer-events: none;
          animation: toastFade 0.2s ease-out;
        }
        @keyframes toastFade {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .messages {
          min-height: 0; padding: 8px 0 40px; display: flex; flex-direction: column; gap: 14px;
          scroll-behavior: smooth; scrollbar-width: none;
        }
        .messages::-webkit-scrollbar { display: none; }
        .row {
          display: flex;
          align-items: center;
          width: 100%;
          position: relative;
          padding: 6px 10px;
          margin: 0;
          border-radius: 12px;
          box-sizing: border-box;
          transition: background-color 0.12s ease, box-shadow 0.12s ease;
        }
        /* 左右对称系统：本地我发送的靠右，团队成员发来的靠左 */
        .row.is-me, .row.outgoing { justify-content: flex-end; }
        .row.is-peer, .row.incoming { justify-content: flex-start; }
        .stack { display: flex; flex-direction: column; max-width: 80%; }
        .row.is-me .stack, .row.outgoing .stack { align-items: flex-end; }
        .row.is-peer .stack, .row.incoming .stack { align-items: flex-start; }
        .bubble {
          padding: 10px 16px;
          border-radius: 20px;
          font-size: 14px;
          overflow-wrap: anywhere;
          line-height: 1.55;
          transition: background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .row.is-me .bubble, .row.outgoing .bubble {
          background: var(--human-bubble-bg);
          color: var(--human-bubble-text);
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .row.is-peer .bubble, .row.incoming .bubble {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        :host([data-theme="dark"]) .row.is-peer .bubble,
        .wrap.theme-dark .row.is-peer .bubble,
        :host([data-theme="dark"]) .row.incoming .bubble,
        .wrap.theme-dark .row.incoming .bubble {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.28);
        }
        /* 快照卡片在左右两侧的自适应 */
        .row.is-me.context-snapshot-card .stack { align-items: flex-end; }
        .row.is-peer.context-snapshot-card .stack { align-items: flex-start; }
        .snapshot-meta {
          margin: 0 2px 5px;
          color: var(--text-muted);
          font-size: 10.5px;
          line-height: 1.35;
        }
        .row.is-me .who, .row.outgoing .who { display: none; }
        .row.is-peer .who, .row.incoming .who {
          display: block;
          font-size: 11.5px;
          color: var(--text-muted);
          margin-bottom: 5px;
          font-weight: 500;
          padding-left: 2px;
        }
        .ref { margin-top: 6px; font-size: 12px; color: var(--accent-color); cursor: pointer; }
        .ref:hover { text-decoration: underline; }
        .dock { padding: 8px 0 20px; }
        .dock .column { position: relative; }

        /* 关联对话与成员弹出菜单 (Picker) */
        .picker {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 0;
          right: 0;
          max-height: 320px;
          background: var(--bg-page);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          box-shadow: 0 16px 40px -4px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.04);
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 150;
          overflow-y: auto;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          animation: picker-fade 0.15s cubic-bezier(0.2, 0, 0, 1);
        }
        @keyframes picker-fade {
          from { opacity: 0; transform: translateY(6px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .picker[hidden] { display: none !important; }
        .picker-section {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .picker-section + .picker-section {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid var(--border-subtle);
        }
        .picker-group-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 4px 8px 4px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          user-select: none;
        }
        .picker-group-count {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 400;
        }
        .picker-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 8px;
          border: 0;
          background: transparent;
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          transition: background 0.12s ease, color 0.12s ease;
          font-family: inherit;
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
        }
        .picker-item:hover, .picker-item:focus-visible {
          background: var(--bg-card-hover);
        }
        .picker-item:active {
          background: var(--bg-chip);
        }
        .picker-item-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          flex-shrink: 0;
          background: var(--bg-chip);
          color: var(--text-secondary);
        }
        .picker-item-icon svg {
          width: 13px;
          height: 13px;
        }
        .picker-item-icon.member-human {
          background: rgba(58, 131, 247, 0.12);
          color: var(--accent-color);
          font-weight: 600;
          font-size: 11px;
        }
        .picker-item-icon.member-ai {
          background: color-mix(in srgb, var(--accent-color) 14%, transparent);
          color: var(--accent-color);
        }
        .picker-item-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .picker-item-title {
          font-size: 13px;
          color: var(--text-primary);
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          line-height: 1.35;
        }
        .picker-item-sub {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .picker-item-badge {
          font-size: 10.5px;
          font-weight: 500;
          padding: 1.5px 6px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .picker-item-badge.active-thread {
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          color: var(--accent-color);
        }
        .picker-item-action {
          background: var(--bg-card, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--border-subtle);
          margin-bottom: 6px;
          border-radius: 9px;
        }
        .picker-item-action:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .picker-item-icon.action-icon {
          background: color-mix(in srgb, var(--accent-color) 14%, transparent);
          color: var(--accent-color);
        }
        .room-tag-btn.new-room-tag {
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          background: var(--bg-chip);
        }
        .room-tag-btn.new-room-tag:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
          color: var(--text-primary);
        }
        .picker-empty {
          padding: 20px 12px;
          text-align: center;
          color: var(--text-muted);
          font-size: 12.5px;
        }
        .composer {
          background: var(--composer-bg);
          border: var(--composer-border, none);
          border-radius: 24px; min-height: 80px; padding: 12px 16px 10px;
          display: flex; flex-direction: column;
          box-shadow: var(--composer-shadow);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        /* 待发图片预览条 */
        .composer-image-preview-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0 8px;
          border-bottom: 1px solid var(--composer-border, rgba(128, 128, 128, 0.15));
          margin-bottom: 6px;
        }
        .composer-image-preview-bar[hidden] { display: none !important; }
        .composer-image-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-hover, rgba(128, 128, 128, 0.12));
          border: 1px solid var(--border-subtle, rgba(128, 128, 128, 0.2));
          border-radius: 10px;
          padding: 4px 8px 4px 4px;
          max-width: 100%;
        }
        .composer-image-chip img {
          width: 32px;
          height: 32px;
          object-fit: cover;
          border-radius: 6px;
          flex-shrink: 0;
        }
        .composer-image-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .composer-image-name {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }
        .composer-image-size {
          font-size: 11px;
          color: var(--text-muted);
        }
        .composer-image-remove {
          background: transparent;
          border: 0;
          color: var(--text-muted);
          cursor: pointer;
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .composer-image-remove:hover {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }

        /* 消息气泡中的图片展示 */
        .msg-image-wrap {
          margin-top: 6px;
          border-radius: 12px;
          overflow: hidden;
          max-width: min(280px, 100%);
          cursor: zoom-in;
          border: 1px solid rgba(128, 128, 128, 0.15);
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .msg-image-wrap:hover {
          transform: scale(1.015);
          box-shadow: 0 4px 16px rgba(0,0,0,0.18);
        }
        .msg-chat-image {
          display: block;
          width: 100%;
          height: auto;
          max-height: 260px;
          object-fit: cover;
        }

        /* Lightbox 大图预览模态框 */
        .image-lightbox-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.78);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 99999;
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .image-lightbox-modal[hidden] { display: none !important; }
        .image-lightbox-container {
          position: relative;
          max-width: min(92vw, 980px);
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .image-lightbox-container img {
          max-width: 100%;
          max-height: 80vh;
          object-fit: contain;
          border-radius: 12px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
          user-select: none;
        }
        .image-lightbox-close {
          position: absolute;
          top: -36px;
          right: 0;
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          border: 0;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: background 0.12s ease;
        }
        .image-lightbox-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .image-lightbox-toolbar {
          margin-top: 10px;
          display: flex;
          gap: 12px;
        }
        .image-lightbox-toolbar a {
          color: #ffffff;
          font-size: 12.5px;
          text-decoration: underline;
          opacity: 0.85;
          cursor: pointer;
        }
        .image-lightbox-toolbar a:hover { opacity: 1; }
        textarea {
          width: 100%; min-height: 44px; max-height: 160px; border: 0; outline: none;
          background: transparent; color: var(--composer-text); font: 14px/1.5 inherit; resize: none; padding: 2px 0 6px;
        }
        textarea::placeholder { color: var(--text-muted); }
        .composer-toolbar {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px;
        }
        .composer-left { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .safe-badge {
          display: inline-flex; align-items: center; gap: 3.5px; font-size: 11px; color: var(--text-muted); padding: 0 4px; opacity: 0.65; user-select: none;
        }
        .safe-badge svg { opacity: 0.8; }
        .composer-right { display: flex; align-items: center; }
        .send {
          width: 32px; height: 32px; border: 0; border-radius: 99px;
          background: var(--composer-send-bg, var(--accent-color)); color: #ffffff; cursor: pointer;
          display: grid; place-items: center; transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .send:hover { opacity: 0.88; }
        .send:active { transform: scale(0.95); }
        .send:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

        /* 轮次定位轨 */
        /* 轮次定位轨 (Minimap / Native Nav Rail) */
        .native-nav-rail {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 20;
          display: block;
          opacity: 1;
          transition: opacity 160ms ease;
          user-select: none;
        }
        .native-nav-rail[hidden] { display: none !important; }
        .native-nav-rail-list {
          display: flex;
          flex-direction: column;
          max-height: min(70vh, 40rem);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: none;
          padding: 8px 6px;
        }
        .native-nav-rail-list::-webkit-scrollbar { display: none; }
        .nav-item-btn {
          display: flex; height: 11px; width: 36px; flex-shrink: 0; cursor: pointer;
          align-items: center; outline: none; background: transparent; border: 0; padding: 0; margin: 0;
          position: relative;
        }
        .nav-item-wrap { display: flex; height: 2px; width: 30px; align-items: center; }
        ._Marker {
          --marker-progress: 0;
          width: 26px; height: 2px; color: var(--rail-marker); opacity: 0.38; display: flex; position: relative;
          transition: color 0.16s ease, opacity 0.16s ease;
        }
        ._MarkerLine {
          transition: transform 0.16s cubic-bezier(0.2, 0, 0, 1), background-color 0.16s ease;
          background-color: currentColor; width: 100%; height: 100%;
          transform: scaleX(calc(0.2308 + 0.7692 * var(--marker-progress)));
          transform-origin: 0px center; border-radius: 99px;
        }

        /* 1. 当前视口所在轮次：默认严格保持短横线，仅高亮指示阅读位置 */
        .nav-item-btn[aria-current="true"] ._Marker {
          --marker-progress: 0;
          color: var(--rail-marker-active);
          opacity: 0.78;
        }

        /* 2. 悬停或拖拽滑动时：原本未被 hover 的项同样保持短横线且微降亮度 */
        .native-nav-rail-list:hover .nav-item-btn[aria-current="true"]:not(:hover):not([data-scrub-target]) ._Marker,
        .native-nav-rail-list[data-scrubbing] .nav-item-btn[aria-current="true"]:not([data-scrub-target]) ._Marker,
        .native-nav-rail-list:has([data-scrub-target]) .nav-item-btn[aria-current="true"]:not([data-scrub-target]) ._Marker {
          --marker-progress: 0 !important;
          color: var(--rail-marker) !important;
          opacity: 0.38 !important;
        }

        /* 3. Scrubbing 拖拽滑动状态：0 延时物理跟手响应 */
        .native-nav-rail-list[data-scrubbing] :is(._MarkerLine, ._Marker) {
          transition-duration: 0s !important;
        }
        :is(.nav-item-btn:has(+ .nav-item-btn[data-scrub-target]), .nav-item-btn[data-scrub-target] + .nav-item-btn) ._Marker {
          --marker-progress: 0.72 !important;
          opacity: 0.78 !important;
          color: var(--rail-marker-active) !important;
        }
        :is(.nav-item-btn:has(+ .nav-item-btn + .nav-item-btn[data-scrub-target]), .nav-item-btn[data-scrub-target] + .nav-item-btn + .nav-item-btn) ._Marker {
          --marker-progress: 0.44 !important;
          opacity: 0.58 !important;
        }
        :is(.nav-item-btn:has(+ .nav-item-btn + .nav-item-btn + .nav-item-btn[data-scrub-target]), .nav-item-btn[data-scrub-target] + .nav-item-btn + .nav-item-btn + .nav-item-btn) ._Marker {
          --marker-progress: 0.22 !important;
          opacity: 0.45 !important;
        }
        :is(.nav-item-btn:focus-visible, .nav-item-btn[data-scrub-target]) ._Marker {
          --marker-progress: 1 !important;
          color: var(--rail-marker-active) !important;
          opacity: 1 !important;
        }

        /* 4. 鼠标悬停时的波浪级联展开动效 (Wave Animation) */
        @media (hover: hover) {
          .native-nav-rail-list:not([data-scrubbing]):not(:has([data-scrub-target])):hover .nav-item-btn:hover ._Marker,
          .native-nav-rail-list:not([data-scrubbing]):not(:has([data-scrub-target])):hover .nav-item-btn:focus-visible ._Marker {
            --marker-progress: 1 !important;
            color: var(--rail-marker-active) !important;
            opacity: 1 !important;
          }

          .native-nav-rail-list:not([data-scrubbing]):not(:has([data-scrub-target])):hover :is(.nav-item-btn:has(+ .nav-item-btn:hover), .nav-item-btn:hover + .nav-item-btn) ._Marker {
            --marker-progress: 0.72 !important;
            opacity: 0.78 !important;
            color: var(--rail-marker-active) !important;
          }

          .native-nav-rail-list:not([data-scrubbing]):not(:has([data-scrub-target])):hover :is(.nav-item-btn:has(+ .nav-item-btn + .nav-item-btn:hover), .nav-item-btn:hover + .nav-item-btn + .nav-item-btn) ._Marker {
            --marker-progress: 0.44 !important;
            opacity: 0.58 !important;
          }

          .native-nav-rail-list:not([data-scrubbing]):not(:has([data-scrub-target])):hover :is(.nav-item-btn:has(+ .nav-item-btn + .nav-item-btn + .nav-item-btn:hover), .nav-item-btn:hover + .nav-item-btn + .nav-item-btn + .nav-item-btn) ._Marker {
            --marker-progress: 0.22 !important;
            opacity: 0.45 !important;
          }
        }

        /* 5. 悬浮预览卡片动效与位置跟随 */
        .native-preview-card {
          position: fixed; max-width: 340px; min-width: 220px;
          background: var(--preview-bg); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 12px;
          padding: 10px 14px; box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.04); z-index: 60; pointer-events: none;
          transition: top 0.12s cubic-bezier(0.2, 0, 0, 1), opacity 0.14s ease, transform 0.14s ease;
        }
        .native-preview-card.pop-in {
          animation: preview-pop 0.14s cubic-bezier(0.2, 0, 0, 1);
        }
        @keyframes preview-pop {
          from { opacity: 0; transform: translateX(-6px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        .native-preview-card[hidden] { display: none !important; }
        .preview-title { font-weight: 600; font-size: 12.5px; margin-bottom: 4px; color: var(--accent-color); }
        .preview-body { font-size: 12px; color: var(--text-secondary); line-height: 1.45; word-break: break-word; }

        /* 连接模态弹层 */
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          z-index: 150; display: flex; align-items: center; justify-content: center;
        }
        .modal-backdrop[hidden] { display: none; }
        .modal-card {
          background: var(--bg-page); color: var(--text-primary);
          width: min(520px, calc(100% - 32px)); border-radius: 18px;
          border: 1px solid var(--border-subtle); box-shadow: 0 24px 60px -8px rgba(0,0,0,0.38), 0 0 0 1px rgba(255, 255, 255, 0.04);
          display: flex; flex-direction: column; overflow: hidden;
          animation: modal-up 0.18s cubic-bezier(.22,1,.36,1);
        }
        @keyframes modal-up {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-header {
          padding: 18px 22px; display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
        }
        .modal-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; }
        .form-sublabel { font-size: 11px; font-weight: 400; color: var(--text-muted); line-height: 1.4; }
        .form-input {
          background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle);
          border-radius: 8px; padding: 8px 12px; font-size: 13px; font-family: inherit; outline: none;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
          width: 100%; box-sizing: border-box;
        }
        .form-input:focus {
          border-color: var(--accent-color);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 3px color-mix(in srgb, var(--accent-color) 20%, transparent);
        }
        .form-input[type="password"], #cfg-hub-url, #cfg-room-key {
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
          letter-spacing: -0.01em;
        }
        .form-btn-secondary {
          background: var(--bg-chip); border: 1px solid var(--border-subtle); color: var(--text-primary);
          border-radius: 8px; padding: 8px 12px; font-size: 12px; cursor: pointer; white-space: nowrap;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .form-btn-secondary:hover { background: var(--bg-card-hover); border-color: var(--border-strong); }
        .error-banner {
          background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444; border-radius: 8px; padding: 8px 12px; font-size: 12.5px;
        }
        .error-banner[hidden] { display: none; }
        .modal-footer {
          padding: 16px 22px; background: var(--bg-card); display: flex; justify-content: flex-end; gap: 10px;
          border-top: 1px solid var(--border-subtle);
        }
        .btn-connect-primary {
          background: var(--accent-color); color: #ffffff; border: 0; padding: 8px 18px; border-radius: 999px;
          font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .btn-connect-primary:hover { opacity: 0.92; }
        .btn-connect-primary:active { transform: scale(0.98); }
        .btn-connect-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .pwd-toggle {
          position: absolute; right: 10px; background: transparent; border: 0; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 4px; border-radius: 4px; transition: color 0.15s ease;
        }
        .pwd-toggle:hover { color: var(--text-primary); }

        /* 共享 Hook 弹出层 */
        .share-modal {
          background: var(--bg-page); color: var(--text-primary);
          width: min(540px, calc(100% - 32px)); max-height: 85vh; border-radius: 16px;
          border: 1px solid var(--border-subtle); box-shadow: 0 20px 48px -6px rgba(0,0,0,0.35), 0 0 0 1px rgba(255, 255, 255, 0.04);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .share-header { padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); }
        .share-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
        .share-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .share-tip { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; background: var(--bg-chip); padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-subtle); }
        .share-link-box { display: flex; gap: 8px; align-items: center; background: var(--bg-chip); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); }
        .share-link-input { flex: 1; border: 0; background: transparent; color: var(--text-primary); font-size: 12.5px; outline: none; }
        .share-btn-primary { background: var(--accent-color); color: #ffffff; border: 0; padding: 8px 16px; border-radius: 99px; cursor: pointer; font-weight: 550; font-size: 13px; }
        .share-btn-revoke { background: transparent; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 10px; border-radius: 99px; cursor: pointer; font-size: 12px; }
        .share-list { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
        .share-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-radius: 8px; background: var(--bg-chip); border: 1px solid var(--border-subtle); font-size: 12.5px; }
        .context-select-card {
          background: var(--bg-page); color: var(--text-primary);
          width: min(760px, calc(100% - 32px)); max-height: 86vh; border-radius: 16px;
          border: 1px solid var(--border-subtle); box-shadow: 0 24px 64px -8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255, 255, 255, 0.04);
          display: flex; flex-direction: column; overflow: hidden;
          animation: modal-up 0.18s cubic-bezier(.22,1,.36,1);
        }
        .context-select-header {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          padding: 18px 20px 14px; border-bottom: 1px solid var(--border-subtle);
        }
        .context-select-title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
        .context-select-subtitle { margin-top: 4px; color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
        .context-select-body { min-height: 0; padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
        .context-select-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-secondary); font-size: 12px; }
        .context-select-list {
          min-height: 120px; max-height: 42vh; overflow: auto; display: flex; flex-direction: column; gap: 4px;
          padding: 2px; border-radius: 10px; background: var(--bg-card); border: 1px solid var(--border-subtle);
        }
        .context-message-option {
          display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; align-items: start;
          padding: 9px 10px; border-radius: 8px; cursor: pointer; user-select: none;
          transition: background-color 120ms ease, box-shadow 120ms ease;
        }
        .context-message-option:hover { background: var(--bg-card-hover); }
        .context-message-option[data-selected="true"] { background: color-mix(in srgb, var(--accent-color) 12%, transparent); box-shadow: inset 2px 0 0 var(--accent-color); }
        .context-message-option[data-selection-active="false"] .context-select-checkbox { opacity: 0; transform: scale(0.82); pointer-events: none; }
       .context-snapshot-card { cursor: pointer; }
       .context-snapshot-card .bubble { max-height: 180px; overflow: hidden; position: relative; }
       .context-snapshot-card .bubble.snapshot-expanded { max-height: none; overflow: visible; }

        /* 微信式消息主体直接多选与复选圈 */
        .msg-select-check {
          display: none !important;
          flex-shrink: 0;
          width: 17px;
          height: 17px;
          border-radius: 50%;
          border: 1.5px solid var(--border-strong);
          background: var(--bg-card);
          color: #ffffff;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.14s cubic-bezier(0.2, 0, 0, 1);
          user-select: none;
          align-self: center;
          margin-left: 12px;
          margin-right: 2px;
          margin-top: 0;
        }
        .messages.multi-select-active .msg-select-check {
          display: inline-flex !important;
        }
        /* 外侧对齐：右侧消息选择框在右侧外沿，左侧消息选择框在左侧外沿 */
        .messages.multi-select-active .row.is-me .msg-select-check,
        .messages.multi-select-active .row.outgoing .msg-select-check {
          order: 2;
          margin-left: 12px;
          margin-right: 2px;
        }
        .messages.multi-select-active .row.is-peer .msg-select-check,
        .messages.multi-select-active .row.incoming .msg-select-check {
          order: 0;
          margin-left: 2px;
          margin-right: 12px;
        }
        .messages.multi-select-active .row {
          cursor: pointer;
          user-select: none;
        }
        .messages.multi-select-active .row:hover {
          background: color-mix(in srgb, var(--accent-color) 4%, transparent);
        }
        .messages.multi-select-active .row[data-selected="true"] {
          background: color-mix(in srgb, var(--accent-color) 7%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 25%, transparent);
        }
        .row[data-selected="true"] .msg-select-check {
          background: var(--accent-color);
          border-color: var(--accent-color);
        }
        .row[data-selected="true"] .msg-select-check svg {
          opacity: 1 !important;
          transform: scale(1);
        }
        .row:not([data-selected="true"]) .msg-select-check svg {
          opacity: 0 !important;
          transform: scale(0.6);
        }

        /* 微信交互风格：紧凑胶囊多选工具栏，置于对话框上方，自适应缩短不占空间 */
        .selection-dock-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: fit-content;
          max-width: 90%;
          margin: 0 auto 10px auto;
          padding: 4px 10px;
          border-radius: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 6px 22px -2px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          animation: popover-fade 0.14s ease;
          gap: 12px;
          box-sizing: border-box;
        }
        .selection-dock-bar[hidden] { display: none !important; }
        .selection-dock-left {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .selection-dock-badge {
          display: inline-flex;
          align-items: center;
          font-size: 10px;
          font-weight: 600;
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 12%, transparent);
          padding: 1.5px 5px;
          border-radius: 4px;
          letter-spacing: 0.2px;
        }
        .selection-dock-count {
          font-size: 11.5px;
          font-weight: 550;
          color: var(--text-primary);
          white-space: nowrap;
        }
        .selection-dock-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .selection-dock-divider {
          width: 1px;
          height: 14px;
          background: var(--border-subtle);
          margin: 0 3px;
        }
        .sel-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid var(--border-subtle);
          background: var(--bg-chip);
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.12s ease;
          font-family: inherit;
          white-space: nowrap;
          min-height: 23px;
        }
        .sel-action-btn:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .sel-action-btn.primary {
          background: var(--accent-color);
          color: #ffffff;
          border-color: transparent;
        }
        .sel-action-btn.primary:hover {
          opacity: 0.9;
        }
        .sel-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* 快照卡片与详情弹窗 */
        .snapshot-card-container {
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          padding: 12px 14px;
          max-width: 540px;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.03);
          transition: border-color 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .snapshot-card-container:hover {
          border-color: color-mix(in srgb, var(--accent-color) 40%, transparent);
          box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.25), 0 0 0 1px color-mix(in srgb, var(--accent-color) 25%, transparent);
          transform: translateY(-0.5px);
        }
        .snapshot-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .snapshot-card-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 12%, transparent);
          padding: 2px 8px;
          border-radius: 6px;
        }
        .snapshot-card-id {
          font-size: 10.5px;
          color: var(--text-muted);
          font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
        }
        .snapshot-card-title {
          font-size: 14px;
          font-weight: 650;
          color: var(--text-primary);
          line-height: 1.4;
        }
        .snapshot-card-preview {
          font-size: 12.5px;
          color: var(--text-secondary);
          line-height: 1.5;
          max-height: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .snapshot-card-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
        }
        .snapshot-open-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          box-sizing: border-box;
          gap: 4px;
          font-size: 11.5px;
          font-weight: 550;
          line-height: 1;
          color: var(--text-secondary);
          background: color-mix(in srgb, var(--bg-chip) 85%, transparent);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          padding: 0 8px;
          border-radius: 999px;
          text-decoration: none;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          flex-shrink: 0;
        }
        .snapshot-open-link svg {
          width: 12px;
          height: 12px;
          flex-shrink: 0;
        }
        .snapshot-open-link:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
          transform: translateY(-0.5px);
          text-decoration: none;
        }
        .snapshot-open-link:active {
          transform: scale(0.96);
        }

        /* 快照与原生分享详情弹窗 (对齐官方图 2 原生分享) */
        .snapshot-detail-card {
          background: var(--bg-page);
          color: var(--text-primary);
          width: min(600px, calc(100vw - 32px));
          max-height: 90vh;
          border-radius: 24px;
          border: 1px solid var(--border-subtle);
          box-shadow: 0 24px 64px -8px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          animation: modal-up 0.18s cubic-bezier(.22, 1, .36, 1);
        }
        .snapshot-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 24px 12px;
          gap: 16px;
        }
        .snapshot-detail-header-left {
          flex: 1;
          min-width: 0;
        }
        .snapshot-detail-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: -0.015em;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .snapshot-detail-subtitle {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .snapshot-detail-subtitle a {
          color: var(--accent-color);
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
        }
        .snapshot-detail-subtitle a:hover {
          opacity: 0.85;
        }
        .snapshot-detail-close-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .snapshot-detail-close-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
        }
        .snapshot-detail-body {
          padding: 8px 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
          overflow-y: auto;
        }
        /* 中部对话气泡预览卡片 (完全复刻图 2 原生卡片) */
        .snapshot-native-preview-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          min-height: 160px;
          max-height: 260px;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          box-sizing: border-box;
          box-shadow: 0 2px 10px -2px rgba(0, 0, 0, 0.06);
        }
        .snapshot-native-preview-image-wrap {
          display: flex;
          justify-content: flex-end;
        }
        .snapshot-native-preview-thumb {
          width: 64px;
          height: 64px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          object-fit: cover;
          background: var(--bg-chip);
        }
        .snapshot-native-bubble {
          max-width: 85%;
          background: var(--bg-card-hover);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 10px 14px;
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--text-primary);
          word-break: break-word;
          white-space: pre-wrap;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        :host([data-theme="dark"]) .snapshot-native-bubble,
        .wrap.theme-dark .snapshot-native-bubble {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.06);
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.25);
        }
        .snapshot-native-badge-row {
          align-self: flex-start;
          margin-top: auto;
          padding-top: 4px;
        }
        .snapshot-native-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          padding: 3px 8px;
          border-radius: 10px;
        }
        /* 官方链接状态栏 */
        .snapshot-detail-linkbar {
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          gap: 8px;
        }
        .snapshot-detail-link-text {
          color: var(--accent-color);
          font-family: ui-monospace, monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .snapshot-detail-link-copy-inline {
          font-size: 11px;
          color: var(--text-secondary);
          cursor: pointer;
          border: none;
          background: transparent;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .snapshot-detail-link-copy-inline:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
        }
        /* 可折叠的上下文对话区 */
        .snapshot-detail-context-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }
        .snapshot-detail-context-toggle:hover {
          color: var(--text-primary);
        }
        .snapshot-detail-full-content {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 180px;
          overflow-y: auto;
          background: var(--bg-card);
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
        }
        /* 底部操作区 (高颜值双层布局：整行说明置顶 + 底部操作左右平衡) */
        .snapshot-detail-footer {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 18px 24px 22px;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-page);
        }
        .snapshot-detail-footer-info {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.4;
        }
        .snapshot-detail-footer-icon {
          opacity: 0.65;
          flex-shrink: 0;
        }
        .snapshot-detail-footer-note {
          font-size: 13px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .snapshot-detail-footer-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: nowrap;
        }
        .snapshot-detail-actions-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .snapshot-detail-actions-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .snapshot-detail-native-import-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--accent-color);
          color: #ffffff;
          border: none;
          padding: 7px 15px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap !important;
          flex-shrink: 0;
          box-shadow: 0 2px 10px color-mix(in srgb, var(--accent-color) 35%, transparent);
          transition: background 0.12s ease, transform 0.08s ease, box-shadow 0.12s ease;
        }
        .snapshot-detail-native-import-btn:hover {
          opacity: 0.92;
          box-shadow: 0 4px 14px color-mix(in srgb, var(--accent-color) 45%, transparent);
        }
        .snapshot-detail-native-import-btn:active {
          transform: scale(0.98);
        }
        .snapshot-detail-native-copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 6.5px 12px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap !important;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }
        .snapshot-detail-native-copy-btn:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .snapshot-detail-native-copy-btn:active {
          transform: scale(0.98);
        }
        .snapshot-detail-native-open-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 6.5px 12px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap !important;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }
        .snapshot-detail-native-open-btn:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .snapshot-detail-native-open-btn:active {
          transform: scale(0.98);
        }
        .snapshot-detail-aux-btn {
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 12.5px;
          cursor: pointer;
          white-space: nowrap !important;
          flex-shrink: 0;
          transition: all 0.12s ease;
        }
        .snapshot-detail-aux-btn:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .snapshot-detail-aux-btn.primary {
          background: var(--accent-color);
          color: #fff;
          border-color: transparent;
        }
        .snapshot-detail-aux-btn.primary:hover {
          opacity: 0.9;
        }

        .snapshot-detail-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--bg-chip);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          padding: 6.5px 12px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap !important;
          flex-shrink: 0;
          transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
        }
        .snapshot-detail-action-btn:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-strong);
        }
        .snapshot-detail-action-btn:active {
          transform: scale(0.98);
        }
        .snapshot-detail-action-btn.secondary {
          background: var(--bg-chip);
          border-color: var(--border-subtle);
        }

        /* 通用对话选择模态框 (Share 时挑对话、Import 时挑对话) */
        .thread-select-card {
          width: min(560px, calc(100vw - 32px));
          max-height: min(620px, calc(100vh - 80px));
          background: var(--bg-page);
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          box-shadow: 0 24px 64px -8px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modal-card-in 0.18s cubic-bezier(0.2, 0, 0, 1);
        }
        .thread-select-header {
          padding: 12px 16px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
        }
        .thread-select-title {
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.25;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin: 0;
        }
        .thread-select-subtitle {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
          line-height: 1.35;
        }
        .thread-select-search-wrap {
          padding: 10px 14px 6px;
          border-bottom: none;
          position: relative;
          display: flex;
          align-items: center;
        }
        .thread-select-search-wrap svg {
          position: absolute;
          left: 24px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .thread-select-search-wrap input {
          width: 100%;
          height: 32px;
          box-sizing: border-box;
          padding: 0 10px 0 28px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .thread-select-search-wrap input:focus {
          border-color: var(--accent-color);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03), 0 0 0 3px color-mix(in srgb, var(--accent-color) 20%, transparent);
        }
        .thread-select-notice {
          margin: 0 16px 8px;
          padding: 0 2px;
          border: none;
          background: transparent;
          font-size: 11px;
          color: var(--text-muted);
          opacity: 0.85;
          display: flex;
          align-items: center;
          gap: 5px;
          line-height: 1.35;
          user-select: none;
        }
        .thread-select-notice svg {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          opacity: 0.85;
          color: var(--accent-color);
        }
        .thread-select-notice span {
          flex: 1;
        }
        .thread-select-list {
          flex: 1;
          overflow-y: auto;
          padding: 2px 10px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .thread-select-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 5px 8px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-primary);
          cursor: default;
          user-select: text;
          text-align: left;
          font-family: inherit;
          font-size: 12.5px;
          transition: background 0.12s ease;
        }
        .thread-select-item:hover {
          background: var(--bg-card-hover);
        }
        .thread-select-item.is-current {
          background: color-mix(in srgb, var(--accent-color) 8%, transparent);
          border-color: color-mix(in srgb, var(--accent-color) 25%, transparent);
        }
        .thread-select-item-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex: 1;
        }
        .thread-select-item-icon {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          background: var(--bg-chip);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .thread-select-item-icon svg {
          width: 12px;
          height: 12px;
        }
        .thread-select-item.is-current .thread-select-item-icon {
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          color: var(--accent-color);
        }
        .thread-select-item-content {
          min-width: 0;
          flex: 1;
        }
        .thread-select-item-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
          line-height: 1.35;
        }
        .thread-select-item-badge {
          font-size: 10px;
          padding: 1.5px 6px;
          border-radius: 4px;
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          color: var(--accent-color);
          font-weight: 500;
          flex-shrink: 0;
        }
        .thread-select-item-project {
          font-size: 10.5px;
          padding: 1.5px 6px;
          border-radius: 4px;
          background: var(--bg-chip);
          color: var(--text-muted);
          border: 1px solid var(--border-subtle);
          font-weight: 400;
          flex-shrink: 0;
        }
        .thread-select-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px 2px;
          font-size: 10.5px;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.02em;
          border-top: none;
          margin-top: 4px;
        }
        .thread-select-group-header:first-child {
          margin-top: 0;
        }
        .thread-select-group-title {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .thread-select-group-badge {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 400;
        }
        .thread-select-item-action {
          font-size: 11px;
          padding: 2.5px 9px;
          height: 22px;
          box-sizing: border-box;
          border-radius: 999px;
          background: color-mix(in srgb, var(--bg-chip) 85%, transparent);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          font-weight: 500;
          flex-shrink: 0;
          cursor: pointer;
          user-select: none;
          transition: all 0.14s cubic-bezier(0.16, 1, 0.3, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .thread-select-item-action:hover:not(:disabled) {
          background: var(--accent-color) !important;
          color: #ffffff !important;
          border-color: var(--accent-color) !important;
          transform: translateY(-0.5px);
        }
        .thread-select-item-action:active:not(:disabled) {
          transform: scale(0.96);
        }
        .thread-select-item-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .context-select-checkbox { width: 15px; height: 15px; margin: 1px 0 0; accent-color: var(--accent-color); opacity: 1; transform: scale(1); transition: opacity 120ms ease, transform 120ms ease; pointer-events: none; }
        .context-message-meta { display: flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 11px; margin-bottom: 3px; }
        .context-message-role { color: var(--text-primary); font-weight: 600; }
        .context-message-text { color: var(--text-primary); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
        .context-markdown-preview {
          margin: 0; min-height: 74px; max-height: 19vh; overflow: auto; padding: 10px 12px;
          border: 1px solid var(--border-subtle); border-radius: 9px; background: var(--bg-chip);
          color: var(--text-secondary); font: 11.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          white-space: pre-wrap; overflow-wrap: anywhere;
        }
        .context-select-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-subtle); background: var(--bg-card); }
        .context-select-footer .primary { background: var(--accent-color); color: #fff; border-color: transparent; }
        .context-select-footer button:disabled { opacity: 0.45; cursor: not-allowed; }

      </style>
      <div class="wrap ${isWindows ? "is-windows" : ""}" ${isWindows ? 'data-platform="windows"' : ""}>
        <div class="top ${isWindows ? "is-windows" : ""}">

          <div class="top-left" style="display:flex;align-items:center;gap:8px;">
            <button class="sidebar-toggle-btn" id="btn-toggle-sidebar" type="button" title="展开侧边栏">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.83 4C6.38 4 6.01 4.01 5.7 4.04C5.31 4.07 5.04 4.12 4.82 4.2L4.62 4.29C4.18 4.51 3.81 4.85 3.56 5.27L3.46 5.45C3.33 5.7 3.25 6.01 3.21 6.53C3.17 7.05 3.17 7.72 3.17 8.66V11.33C3.17 12.27 3.17 12.94 3.21 13.46C3.25 13.98 3.33 14.29 3.46 14.54L3.56 14.72C3.81 15.14 4.18 15.48 4.62 15.7L4.82 15.79C5.04 15.87 5.31 15.92 5.7 15.95C6.01 15.98 6.38 15.99 6.83 16V4ZM18.17 11.33V8.66C18.17 7.74 18.17 7.01 18.12 6.42C18.07 5.82 17.99 5.31 17.73 4.85C17.4 4.19 16.88 3.64 16.26 3.25C15.52 2.86 14.41 2.71 12.17 2.71H7.83C6.91 2.71 6.18 2.71 5.59 2.71C5.07 2.76 4.61 2.84 4.2 3.02L4.02 3.1C3.36 3.44 2.81 3.95 2.42 4.57L2.27 4.85C2.03 5.31 1.93 5.82 1.88 6.42C1.83 7.01 1.83 7.74 1.83 8.66V11.33C1.83 12.25 1.83 12.98 1.88 13.57C1.93 14.17 2.03 14.68 2.27 15.14C2.66 15.77 3.21 16.27 3.87 16.61C4.48 16.92 5.17 17.07 7.83 17.07H12.17C14.41 17.07 15.52 16.92 16.26 16.53C16.88 16.14 17.4 15.59 17.73 14.93C17.99 14.47 18.07 13.96 18.12 13.57C18.17 12.98 18.17 12.25 18.17 11.33ZM8.16 16H12.17C14.3 16 15.38 15.91 16.26 15.45C16.83 15.1 17.18 14.54 17.33 13.84C17.42 13.43 17.42 12.85 17.42 11.33V8.66C17.42 7.15 17.42 6.57 17.33 6.16C17.18 5.46 16.83 4.9 16.26 4.55C15.38 4.09 14.3 4 12.17 4H8.16V16Z" fill="currentColor"/>
              </svg>
            </button>
            <div style="display:flex;align-items:center;gap:8px;position:relative;">
              <h1 style="margin:0;font-size:14.5px;font-weight:600;color:var(--text-primary);">Team</h1>
              
              <!-- 核心状态胶囊 -->
              <button class="room-status-pill" id="room-status-pill" type="button" title="点击切换房间或管理服务连接">
                <span class="pill-dot connecting" id="pill-dot"></span>
                <span class="pill-text" id="pill-text">正在连接...</span>
                <svg class="pill-chevron" viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                  <path d="M4.427 6.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 6H4.604a.25.25 0 0 0-.177.427z"/>
                </svg>
              </button>

              <!-- 轻量快捷 Popover 面板 -->
              <div class="room-popover" id="room-popover" hidden>
                <div class="popover-header">
                  <span class="popover-title">协作空间与房间</span>
                  <span class="popover-sub" id="popover-hub-label">127.0.0.1:18765</span>
                </div>
                <div class="popover-section">
                  <div class="popover-label">历史房间</div>
                  <div class="history-room-list" id="popover-history-rooms"></div>
                </div>
                <div class="popover-section">
                  <div class="popover-label">快速切换 / 进入房间</div>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <input class="popover-input" id="popover-new-room" placeholder="输入房间名..." />
                    <button class="popover-btn" id="btn-popover-switch-room" type="button">进入</button>
                  </div>
                </div>
                <div class="popover-footer">
                  <button class="popover-link-btn" id="btn-copy-collab-token" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>复制空间邀请口令</span>
                  </button>
                  <button class="popover-link-btn" id="btn-open-config-modal" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>连接与密码设置</span>
                  </button>
                  <button class="popover-link-btn danger" id="btn-disconnect" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <span>断开连接</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="top-actions" style="display:flex;gap:6px;align-items:center;">
            <button class="top-action-btn" id="btn-header-config" type="button" title="服务连接与房间详细配置">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="header-icon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>连接设置</span>
            </button>
            <button class="top-action-btn" id="btn-share-hook" type="button" title="将当前对话生成快照分享给团队或在浏览器查看">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="header-icon"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              <span>分享对话</span>
            </button>
            <button class="exit-btn" id="back" type="button" title="退出协作，返回刚才的对话 (快捷键: Esc)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>退出协作</span>
              <kbd class="kbd-badge">Esc</kbd>
            </button>
          </div>
        </div>

        <div class="body">
          <nav class="native-nav-rail" id="minimap-panel" aria-label="对话轮次导航" hidden>
            <div class="native-nav-rail-list" id="minimap" data-floating-navigation-rail-list="true"></div>
          </nav>
          <div class="column" style="display:grid;grid-template-rows:auto 1fr;min-height:0;height:100%;">
            <div class="context-bar" id="context-bar">
              <div class="context-path" id="link-row"></div>
              <div class="avatar-stack-container" id="people"></div>
            </div>
            <div class="messages scroll" id="messages"></div>
          </div>
          <div class="native-preview-card" id="tip" hidden></div>
        </div>

        <div class="dock">
          <div class="column">
            <div class="picker scroll" id="picker" hidden></div>
            <!-- 紧凑胶囊多选工具栏：置于对话框上方，间距独立不粘连 -->
            <div class="selection-dock-bar" id="selection-bar" hidden>
              <div class="selection-dock-left">
                <span class="selection-dock-badge">多选</span>
                <span class="selection-dock-count" id="selection-count">未选择消息</span>
              </div>
              <div class="selection-dock-right">
                <button class="sel-action-btn" id="btn-select-all" type="button">全选</button>
                <button class="sel-action-btn" id="btn-select-clear" type="button">清空</button>
                <button class="sel-action-btn" id="btn-select-cancel" type="button">取消</button>
                <span class="selection-dock-divider"></span>
                <button class="sel-action-btn primary" id="btn-select-import-select" type="button" disabled title="选择本地对话注入选中的团队内容，或新建空白对话导入">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>选择对话导入...</span>
                </button>
              </div>
            </div>
            <!-- 空间邀请口令快捷加入提示横幅 -->
            <div class="collab-token-bar" id="collab-token-bar" hidden>
              <div class="collab-token-left">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.85;color:var(--accent-color);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span id="collab-token-text">检测到空间邀请口令</span>
              </div>
              <div class="collab-token-actions">
                <button class="collab-token-btn primary" id="btn-collab-token-join" type="button">加入此空间</button>
                <button class="collab-token-btn ghost" id="btn-collab-token-dismiss" type="button">仅作为消息发送</button>
              </div>
            </div>
            <form id="composer" class="composer">
              <!-- 待发图片预览条 -->
              <div class="composer-image-preview-bar" id="composer-image-preview-bar" hidden>
                <div class="composer-image-chip" id="composer-image-chip">
                  <img id="composer-image-thumb" src="" alt="待发图片" />
                  <div class="composer-image-info">
                    <span class="composer-image-name" id="composer-image-name"></span>
                    <span class="composer-image-size" id="composer-image-size"></span>
                  </div>
                  <button class="composer-image-remove" id="btn-composer-image-remove" type="button" title="移除图片">
                    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                  </button>
                </div>
              </div>
              <textarea id="input" placeholder="随心输入，或按 Cmd+V 粘贴截图、输入 @ 关联对话..."></textarea>
              <div class="composer-toolbar">
                <div class="composer-left">
                  <button class="tool-btn" id="btn-upload-image" type="button" title="上传或粘贴图片 (支持剪贴板 Cmd+V)">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>图片</span>
                  </button>
                  <input type="file" id="file-upload-image" accept="image/*" style="display:none;" />
                  <button class="tool-btn" id="share-thread" type="button" title="选择本地对话并分享到当前团队空间">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    <span>分享对话...</span>
                  </button>
                  <button class="tool-btn" id="review" type="button" title="选择团队消息并导入到本地对话">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>导入上下文</span>
                  </button>
                </div>
                <div class="composer-right">
                  <button class="send" type="submit" aria-label="发送">${SEND_ICON}</button>
                </div>
              </div>
            </form>
          </div>
        </div>

       <!-- 首次打开 / 未连接引导模态弹层 -->
        <div class="modal-backdrop" id="connect-modal" hidden>
          <div class="modal-card">
            <div class="modal-header">
              <div style="display:flex;align-items:center;gap:10px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent-color);"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <div>
                  <h2 style="margin:0;font-size:15px;font-weight:600;">服务连接与空间配置</h2>
                  <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">连接至 Context Team Hub 协同中枢</div>
                </div>
              </div>
              <button class="ghost" id="connect-close" type="button" aria-label="关闭">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
            <form class="modal-body" id="connect-form">
              <div class="error-banner" id="connect-error-banner" hidden></div>

              <div class="form-group">
                <label class="form-label" for="cfg-hub-url">
                  <span>Hub 协同服务地址</span>
                  <span class="form-sublabel">支持本机或局域网协同服务</span>
                </label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input class="form-input" id="cfg-hub-url" placeholder="http://127.0.0.1:18765" style="flex:1;" required />
                  <button class="form-btn-secondary" id="btn-reset-hub" type="button" title="重置为默认或自动探测的服务地址">恢复默认</button>
                </div>
                <div id="cfg-hub-status" style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;">● 正在使用协同服务</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cfg-room-id">
                  <span>房间号 / 空间名称</span>
                  <span class="form-sublabel">按项目或模块隔离协同上下文</span>
                </label>
                <input class="form-input" id="cfg-room-id" placeholder="例如 Media" required />
                <div class="history-room-list" id="cfg-quick-rooms" style="margin-top:4px;"></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cfg-room-key">
                  <span>访问密码 / 密钥 (Room Key)</span>
                  <span class="form-sublabel">选填，房间受密码保护时必填</span>
                </label>
                <div style="position:relative;display:flex;align-items:center;">
                  <input class="form-input" id="cfg-room-key" type="password" placeholder="若未设密码可留空" />
                  <button class="pwd-toggle" id="btn-toggle-pwd" type="button" title="显示/隐藏密码" aria-label="显示/隐藏密码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cfg-nickname">
                  <span>成员昵称</span>
                  <span class="form-sublabel">在协同消息和记录中显示的身份</span>
                </label>
                <input class="form-input" id="cfg-nickname" placeholder="例如 liuweijia" required />
              </div>

              <div class="form-group" style="margin-top:8px;padding:10px 12px;background:var(--bg-chip);border:1px solid var(--border-subtle);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div>
                  <div style="font-size:12px;font-weight:600;color:var(--text-primary);">TeamCodex 协同组件</div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;" id="cfg-version-text">插件版本: inline-v93 · 免重装热更新生效中</div>
                </div>
                <div id="cfg-update-box">
                  <button class="form-btn-secondary" id="btn-check-update" type="button" style="font-size:11.5px;padding:4px 10px;cursor:pointer;">检查更新</button>
                </div>
              </div>
            </form>
            <div class="modal-footer">
              <button class="ghost" id="btn-cancel-connect" type="button">暂不连接</button>
              <button class="btn-connect-primary" id="btn-confirm-connect" type="button">
                <span id="btn-connect-text">连接并进入房间</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 分享对话与快照管理弹层 -->
        <div class="modal-backdrop" id="share-modal" hidden>
          <div class="share-modal">
            <div class="share-header">
              <h2>分享当前对话给团队</h2>
              <button class="ghost" id="share-close" type="button" aria-label="关闭">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
            <div class="share-body">
              <div class="share-error-banner" id="share-error-banner" hidden style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#ef4444;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:12px;line-height:1.4;"></div>
              <div class="share-tip">
                支持生成对话快照并一键发布至当前团队空间，协作成员可随时点击查看并导入对话。
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:13px;">生成新快照</span>
                <button class="share-btn-primary" id="btn-create-share" type="button">+ 生成当前会话快照</button>
              </div>
              <div id="latest-share-box" hidden style="margin-top:12px;padding:10px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">最新生成的分享链接：</div>
                <div class="share-link-box" style="margin-bottom:8px;">
                  <input class="share-link-input" id="latest-share-url" readonly />
                  <button class="ghost" id="btn-copy-share" type="button" style="padding:4px 10px;font-size:12px;background:var(--bg-card);">复制</button>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <button class="share-btn-primary" id="btn-send-share-to-room" type="button" style="background:var(--accent-color);flex:1;font-size:12.5px;padding:6px 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                    <span>发送到当前协作房间</span>
                  </button>
                  <button class="ghost" id="btn-preview-share-browser" type="button" style="font-size:12px;padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-subtle);display:inline-flex;align-items:center;gap:4px;">
                    <span>浏览器打开预览</span>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="opacity:0.75;"><path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
                  </button>
                </div>
              </div>
              <div style="font-weight:600;font-size:13px;margin-top:12px;">已分享的快照记录：</div>
             <div class="share-list" id="shares-list">
               <div style="font-size:12.5px;color:var(--text-muted);text-align:center;padding:12px;">暂无分享记录</div>
             </div>
           </div>
         </div>
       </div>
        <!-- 对话原生分享详情弹层 (100% 像素级对齐官方图 2 原生弹窗) -->
        <div class="modal-backdrop" id="snapshot-detail-modal" hidden>
          <div class="snapshot-detail-card" role="dialog" aria-modal="true" aria-labelledby="snapshot-detail-title">
            <div class="snapshot-detail-header">
              <div class="snapshot-detail-header-left">
                <h2 class="snapshot-detail-title" id="snapshot-detail-title">分享 对话</h2>
                <div class="snapshot-detail-subtitle">
                  分享后，你的姓名以及你添加的新消息不会显示在共享聊天中。<a href="https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq" class="official-help-link" target="_blank" rel="noopener noreferrer">了解更多</a>
                </div>
              </div>
              <button class="snapshot-detail-close-btn" id="snapshot-detail-close" type="button" aria-label="关闭">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
            <div class="snapshot-detail-body">
              <!-- 中部原生预览卡片 (100% 对齐图 2 深色气泡卡片) -->
              <div class="snapshot-native-preview-card" id="snapshot-native-preview-card">
                <div class="snapshot-native-preview-image-wrap" id="snapshot-native-thumb-wrap" style="display:none;">
                  <img class="snapshot-native-preview-thumb" id="snapshot-native-thumb" alt="预览缩略图" />
                </div>
                <div class="snapshot-native-bubble" id="snapshot-native-bubble">
                  对话首条提问内容...
                </div>
                <div class="snapshot-native-badge-row" id="snapshot-native-badge-row" style="display:none;">
                  <span class="snapshot-native-badge" id="snapshot-native-badge">已查看 1 张图像</span>
                </div>
              </div>
              <div class="snapshot-detail-context-toggle" id="snapshot-detail-context-toggle" role="button" tabindex="0">
                <span id="snapshot-detail-context-toggle-text">展开查看完整对话记录</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <pre class="snapshot-detail-full-content" id="snapshot-detail-full-content" hidden></pre>
            </div>

            <div class="snapshot-detail-footer">
              <div class="snapshot-detail-footer-info">
                <svg class="snapshot-detail-footer-icon" aria-hidden="true" focusable="false" height="15" viewBox="0 0 16 16" width="15" fill="currentColor">
                  <path d="M8 0a8 8 0 1 0 8 8A8.01 8.01 0 0 0 8 0Zm5.93 7h-2.58a13.3 13.3 0 0 0-1.09-4.32A6.53 6.53 0 0 1 13.93 7ZM8 1.52c.67 1.15 1.25 2.82 1.48 5.48H6.52C6.75 4.34 7.33 2.67 8 1.52ZM1.52 9h2.58a13.3 13.3 0 0 0 1.09 4.32A6.53 6.53 0 0 1 1.52 9Zm2.58-2H1.52a6.53 6.53 0 0 1 4.19-4.32A13.3 13.3 0 0 0 4.1 7ZM8 14.48c-.67-1.15-1.25-2.82-1.48-5.48h2.96c-.23 2.66-.81 4.33-1.48 5.48Zm1.74-2.16A13.3 13.3 0 0 0 10.83 8h2.58a6.53 6.53 0 0 1-3.67 4.32Z"/>
                </svg>
                <span class="snapshot-detail-footer-note">任何拥有此链接的人都可以查看此聊天</span>
              </div>
              <div class="snapshot-detail-footer-actions">
                <div class="snapshot-detail-actions-left">
                  <button class="snapshot-detail-native-open-btn" id="snapshot-detail-native-open" type="button" title="在系统浏览器中打开此官方分享">
                    <span>网页打开</span>
                    <svg aria-hidden="true" focusable="false" height="11" viewBox="0 0 16 16" width="11" fill="currentColor" style="opacity:0.75;margin-left:2px;">
                      <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                      <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                    </svg>
                  </button>
                  <button class="snapshot-detail-native-copy-btn" id="snapshot-detail-native-copy" type="button" title="复制官方公开分享链接">
                    <svg aria-hidden="true" focusable="false" height="14" viewBox="0 0 16 16" width="14" fill="currentColor">
                      <path d="M3.69541 6.25121C3.89761 6.04427 4.22909 6.03985 4.43662 6.24145C4.64426 6.44372 4.64953 6.77691 4.44736 6.98461L3.61338 7.84008L3.6085 7.84496C2.42952 9.02432 2.40771 10.9534 3.72666 12.2727C5.04612 13.5922 6.97593 13.5702 8.15537 12.3909L8.16025 12.386L9.01572 11.553C9.22335 11.3509 9.55562 11.3553 9.75791 11.5627C9.96017 11.7704 9.9566 12.1036 9.74912 12.3059L8.89365 13.1389C7.28179 14.7455 4.68893 14.7213 2.9835 13.0159C1.27845 11.3104 1.25498 8.71842 2.86143 7.10668L3.69541 6.25121Z"></path>
                      <path d="M9.629 5.62914C9.83403 5.42415 10.1662 5.42413 10.3712 5.62914C10.5761 5.83417 10.5761 6.16634 10.3712 6.37133L6.37119 10.3713C6.16621 10.5763 5.83404 10.5762 5.629 10.3713C5.42398 10.1663 5.42398 9.83417 5.629 9.62914L9.629 5.62914Z"></path>
                      <path d="M7.10654 2.86157C8.71829 1.25511 11.3103 1.27855 13.0157 2.98364C14.7212 4.68907 14.7453 7.28193 13.1388 8.89379L12.3058 9.74926C12.1034 9.95672 11.7702 9.96029 11.5626 9.75805C11.3552 9.55576 11.3507 9.22349 11.5528 9.01586L12.3858 8.16039L12.3907 8.15551C13.5701 6.97606 13.592 5.04626 12.2726 3.7268C10.9532 2.40781 9.02419 2.42965 7.84482 3.60864L7.83994 3.61352L6.98447 4.4475C6.77678 4.64965 6.44358 4.64438 6.24131 4.43676C6.03972 4.22923 6.04415 3.89775 6.25107 3.69555L7.10654 2.86157Z"></path>
                    </svg>
                    <span id="snapshot-detail-native-copy-text">复制链接</span>
                  </button>
                </div>
                <div class="snapshot-detail-actions-right">
                  <button class="snapshot-detail-action-btn secondary" id="snapshot-detail-import-select" type="button" title="从历史会话列表中选择要注入的目标对话">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>选对话...</span>
                  </button>
                  <button class="snapshot-detail-action-btn secondary" id="snapshot-detail-native-import" type="button" title="将团队上下文注入到当前打开的对话输入框">
                    <svg aria-hidden="true" focusable="false" height="13" viewBox="0 0 16 16" width="13" fill="currentColor">
                      <path d="M2.5 13.5A.5.5 0 0 1 3 13h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5ZM8 1a.5.5 0 0 1 .5.5v7.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 9.293V1.5A.5.5 0 0 1 8 1Z"/>
                    </svg>
                    <span>导入到当前对话</span>
                  </button>
                  <button class="primary snapshot-detail-native-import-btn" id="snapshot-detail-import-new" type="button" title="新建空白对话并注入团队上下文，不污染手头工作">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
                    <span>新建并导入</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-backdrop" id="context-select-modal" hidden>
          <div class="context-select-card" role="dialog" aria-modal="true" aria-labelledby="context-select-title">
            <div class="context-select-header">
              <div>
                <h2 class="context-select-title" id="context-select-title">选择要导入的团队对话</h2>
                <div class="context-select-subtitle">按住鼠标在消息上滑动即可连续勾选；再次从已选消息开始滑动可取消选择。选中的内容会按 Markdown 原文插入当前 Codex 对话。关闭或取消只结束本次导入，不会修改本地对话。</div>
              </div>
              <button class="ghost" id="context-select-close" type="button" aria-label="关闭上下文选择">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
            <div class="context-select-body">
              <div class="context-select-toolbar">
                <span id="context-select-count">尚未选择消息</span>
                <button class="ghost" id="context-select-clear" type="button">清空选择</button>
              </div>
              <div class="context-select-list" id="context-select-list"></div>
              <pre class="context-markdown-preview" id="context-markdown-preview">请选择至少一条消息</pre>
            </div>
            <div class="context-select-footer">
              <button class="ghost" id="context-select-cancel" type="button">取消</button>
              <button class="ghost" id="context-select-copy" type="button" disabled>复制 Markdown</button>
              <button class="ghost primary" id="context-select-import" type="button" disabled>导入到当前对话</button>
            </div>
          </div>
        </div>
        <!-- 通用选择对话弹窗 (用于 Share 时选对话分享、Import 时选对话导入) -->
        <div class="modal-backdrop" id="thread-select-modal" hidden>
          <div class="thread-select-card" role="dialog" aria-modal="true" aria-labelledby="thread-select-title">
            <div class="thread-select-header">
              <div>
                <h2 class="thread-select-title" id="thread-select-title">选择要分享的对话</h2>
                <div class="thread-select-subtitle" id="thread-select-subtitle">选择本地对话打包生成快照并发布至团队空间</div>
              </div>
              <button class="ghost" id="thread-select-close" type="button" aria-label="关闭对话选择">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
            <div class="thread-select-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="thread-select-search" placeholder="搜索会话标题或所属项目..." autocomplete="off">
            </div>
            <div class="thread-select-notice" id="thread-select-notice">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span id="thread-select-notice-text">仅显示左侧栏当前已展开的对话，其他会话请先在侧栏展开</span>
            </div>
            <div class="thread-select-list scroll" id="thread-select-list"></div>
          </div>
        </div>

        <!-- 图片 Lightbox 大图弹层 -->
        <div class="image-lightbox-modal" id="image-lightbox-modal" hidden>
          <div class="image-lightbox-container">
            <button class="image-lightbox-close" id="image-lightbox-close" type="button" aria-label="关闭预览">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
              </svg>
            </button>
            <img id="image-lightbox-img" src="" alt="大图预览" />
            <div class="image-lightbox-toolbar">
              <a id="image-lightbox-open-new" href="#" target="_blank" rel="noreferrer">在新标签页打开原图</a>
              <a id="image-lightbox-copy-link" href="#">复制图片链接</a>
            </div>
          </div>
        </div>
      </div>
    `;

    // DOM 引用
    const messagesEl = root.getElementById("messages");
    const minimapPanel = root.getElementById("minimap-panel");
    const input = root.getElementById("input");
    const picker = root.getElementById("picker");
    const peopleEl = root.getElementById("people");
    const linkRow = root.getElementById("link-row");
    const roomStatusPill = root.getElementById("room-status-pill");
    const pillDot = root.getElementById("pill-dot");
    const pillText = root.getElementById("pill-text");
    const roomPopover = root.getElementById("room-popover");
    const popoverHubLabel = root.getElementById("popover-hub-label");
    const popoverHistoryRooms = root.getElementById("popover-history-rooms");
    const popoverNewRoom = root.getElementById("popover-new-room");
    const btnPopoverSwitchRoom = root.getElementById("btn-popover-switch-room");
    const btnOpenConfigModal = root.getElementById("btn-open-config-modal");
    const btnDisconnect = root.getElementById("btn-disconnect");
    const btnHeaderConfig = root.getElementById("btn-header-config");
    const connectModal = root.getElementById("connect-modal");
    const connectClose = root.getElementById("connect-close");
    const btnCancelConnect = root.getElementById("btn-cancel-connect");
    const btnConfirmConnect = root.getElementById("btn-confirm-connect");
    const cfgHubUrl = root.getElementById("cfg-hub-url");
    const btnResetHub = root.getElementById("btn-reset-hub");
    const cfgHubStatus = root.getElementById("cfg-hub-status");
    const cfgRoomId = root.getElementById("cfg-room-id");
    const cfgQuickRooms = root.getElementById("cfg-quick-rooms");
    const cfgRoomKey = root.getElementById("cfg-room-key");
    const btnTogglePwd = root.getElementById("btn-toggle-pwd");
    const cfgNickname = root.getElementById("cfg-nickname");
    const connectErrorBanner = root.getElementById("connect-error-banner");
    const btnConnectText = root.getElementById("btn-connect-text");

    // 图片上传与预览相关 DOM 及工具状态
    const btnUploadImage = root.getElementById("btn-upload-image");
    const fileUploadImage = root.getElementById("file-upload-image");
    const composerImagePreviewBar = root.getElementById("composer-image-preview-bar");
    const composerImageThumb = root.getElementById("composer-image-thumb");
    const composerImageName = root.getElementById("composer-image-name");
    const composerImageSize = root.getElementById("composer-image-size");
    const btnComposerImageRemove = root.getElementById("btn-composer-image-remove");

    // Lightbox 大图弹层 DOM
    const imageLightboxModal = root.getElementById("image-lightbox-modal");
    const imageLightboxClose = root.getElementById("image-lightbox-close");
    const imageLightboxImg = root.getElementById("image-lightbox-img");
    const imageLightboxOpenNew = root.getElementById("image-lightbox-open-new");
    const imageLightboxCopyLink = root.getElementById("image-lightbox-copy-link");

    let pendingImage = null; // { name, size, base64 }

    const formatFileSize = (bytes) => {
      if (!bytes || bytes <= 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const setPendingImage = (fileData) => {
      if (!fileData) {
        pendingImage = null;
        if (composerImagePreviewBar) composerImagePreviewBar.hidden = true;
        if (composerImageThumb) composerImageThumb.src = "";
        if (composerImageName) composerImageName.textContent = "";
        if (composerImageSize) composerImageSize.textContent = "";
        if (fileUploadImage) fileUploadImage.value = "";
        return;
      }
      pendingImage = fileData;
      if (composerImageThumb) composerImageThumb.src = fileData.base64;
      if (composerImageName) composerImageName.textContent = fileData.name || "图片";
      if (composerImageSize) composerImageSize.textContent = formatFileSize(fileData.size);
      if (composerImagePreviewBar) composerImagePreviewBar.hidden = false;
      input?.focus();
    };

    const handleImageFile = (file) => {
      if (!file || !file.type.startsWith("image/")) {
        showToast("请选择有效的图片文件");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast("图片大小不能超过 10MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        setPendingImage({
          name: file.name || `image_${Date.now()}.png`,
          size: file.size,
          base64,
        });
      };
      reader.onerror = () => {
        showToast("读取图片失败");
      };
      reader.readAsDataURL(file);
    };

    const openImageLightbox = (imgSrc) => {
      if (!imageLightboxModal || !imageLightboxImg) return;
      imageLightboxImg.src = imgSrc;
      if (imageLightboxOpenNew) imageLightboxOpenNew.href = imgSrc;
      imageLightboxModal.hidden = false;
    };

    const closeImageLightbox = () => {
      if (!imageLightboxModal) return;
      imageLightboxModal.hidden = true;
      if (imageLightboxImg) imageLightboxImg.src = "";
    };

    const resolveImageUrl = (img) => {
      if (!img) return "";
      if (typeof img === "string") {
        if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("data:")) return img;
        const hub = (config.hubUrl || window.__TEAM_CONTEXT_HOST__ || "").replace(/\/+$/, "");
        if (hub) return `${hub}${img.startsWith("/") ? "" : "/"}${img}`;
        return img;
      }
      if (img.full_url && !img.full_url.includes("127.0.0.1") && !img.full_url.includes("localhost")) {
        return img.full_url;
      }
      const hub = (config.hubUrl || window.__TEAM_CONTEXT_HOST__ || "").replace(/\/+$/, "");
      if (hub && img.url && img.url.startsWith("/")) {
        return `${hub}${img.url}`;
      }
      return img.full_url || img.url || "";
    };

    // 智能协同口令条与复制按钮
    const btnCopyCollabToken = root.getElementById("btn-copy-collab-token");
    const collabTokenBar = root.getElementById("collab-token-bar");
    const collabTokenText = root.getElementById("collab-token-text");
    const btnCollabTokenJoin = root.getElementById("btn-collab-token-join");
    const btnCollabTokenDismiss = root.getElementById("btn-collab-token-dismiss");
    let currentPendingCollabToken = null;
    let activeMemberIds = new Set();

    const parseCollabToken = (raw) => {
      if (!raw || typeof raw !== "string") return null;
      const text = raw.trim();
      const hubMatch = text.match(/(?:Hub|Host|服务(?:器)?|主机)\s*[:：]\s*([^\s|｜]+)/i);
      const roomMatch = text.match(/(?:Room|空间|房间)\s*[:：]\s*([^\s|｜]+)/i);
      const keyMatch = text.match(/(?:Key|密钥|密码)\s*[:：]\s*([^\s|｜]+)/i);

      if (hubMatch && roomMatch) {
        let hubUrl = hubMatch[1].trim();
        if (!/^https?:\/\//i.test(hubUrl)) {
          hubUrl = "http://" + hubUrl;
        }
        hubUrl = hubUrl.replace(/\/+$/, "");

        const runtimeHost = (window.__TEAM_CONTEXT_HOST__ || "").trim();
        if (runtimeHost && /127\.0\.0\.1|localhost/i.test(hubUrl) && !/127\.0\.0\.1|localhost/i.test(runtimeHost)) {
          try {
            const rUrl = new URL(runtimeHost);
            const hUrl = new URL(hubUrl);
            hUrl.hostname = rUrl.hostname;
            hubUrl = hUrl.origin;
          } catch {}
        }

        const roomId = sanitizeRoomName(roomMatch[1].trim());
        const roomKey = keyMatch ? keyMatch[1].trim() : "";
        return { hubUrl, roomId, roomKey };
      }
      return null;
    };

    const generateCollabToken = () => {
      const currentHub = (config.hubUrl || "http://127.0.0.1:18765").replace(/\/+$/, "");
      const currentRoom = config.roomId || "Media";
      const currentKey = config.roomKey || (config.roomKeys?.[currentRoom] || "");
      if (currentKey) {
        return `Hub: ${currentHub} | Room: ${currentRoom} | Key: ${currentKey}`;
      }
      return `Hub: ${currentHub} | Room: ${currentRoom}`;
    };
    const contextSelectModal = root.getElementById("context-select-modal");
    const contextSelectList = root.getElementById("context-select-list");
    const contextSelectCount = root.getElementById("context-select-count");
    const contextMarkdownPreview = root.getElementById("context-markdown-preview");
    const contextSelectCopy = root.getElementById("context-select-copy");
    const contextSelectImport = root.getElementById("context-select-import");
   const contextSelectClear = root.getElementById("context-select-clear");
   const contextSelectClose = root.getElementById("context-select-close");
   const contextSelectCancel = root.getElementById("context-select-cancel");

    // 多选与快照详情 DOM 引用
    const selectionBar = root.getElementById("selection-bar");
    const selectionCount = root.getElementById("selection-count");
    const btnSelectAll = root.getElementById("btn-select-all");
    const btnSelectClear = root.getElementById("btn-select-clear");
    const btnSelectCancel = root.getElementById("btn-select-cancel");
    const btnSelectImport = root.getElementById("btn-select-import");
    const btnSelectImportNew = root.getElementById("btn-select-import-new");
    const btnSelectImportSelect = root.getElementById("btn-select-import-select");
    const snapshotDetailModal = root.getElementById("snapshot-detail-modal");
    const snapshotDetailTitle = root.getElementById("snapshot-detail-title");
    const snapshotDetailClose = root.getElementById("snapshot-detail-close");
    const snapshotDetailNativeImport = root.getElementById("snapshot-detail-native-import");
    const snapshotDetailImportNew = root.getElementById("snapshot-detail-import-new");
    const snapshotDetailImportSelect = root.getElementById("snapshot-detail-import-select");
    const snapshotDetailNativeCopy = root.getElementById("snapshot-detail-native-copy");
    const snapshotDetailNativeCopyText = root.getElementById("snapshot-detail-native-copy-text");
    const snapshotDetailNativeOpen = root.getElementById("snapshot-detail-native-open");
    const snapshotNativeBubble = root.getElementById("snapshot-native-bubble");
    const snapshotNativeThumbWrap = root.getElementById("snapshot-native-thumb-wrap");
    const snapshotNativeThumb = root.getElementById("snapshot-native-thumb");
    const snapshotNativeBadgeRow = root.getElementById("snapshot-native-badge-row");
    const snapshotNativeBadge = root.getElementById("snapshot-native-badge");
    const snapshotDetailContextToggle = root.getElementById("snapshot-detail-context-toggle");
    const snapshotDetailContextToggleText = root.getElementById("snapshot-detail-context-toggle-text");
    const snapshotDetailFullContent = root.getElementById("snapshot-detail-full-content");
    const snapshotDetailFooterNote = root.querySelector(".snapshot-detail-footer-note");

    // 通用选择对话弹窗引用 (用于 Share 时挑对话、Import 时挑对话)
    const threadSelectModal = root.getElementById("thread-select-modal");
    const threadSelectTitle = root.getElementById("thread-select-title");
    const threadSelectSubtitle = root.getElementById("thread-select-subtitle");
    const threadSelectSearch = root.getElementById("thread-select-search");
    const threadSelectNotice = root.getElementById("thread-select-notice");
    const threadSelectNoticeText = root.getElementById("thread-select-notice-text");
    const threadSelectList = root.getElementById("thread-select-list");
    const threadSelectClose = root.getElementById("thread-select-close");

    const knownIds = new Set();
    let actorType = "human";
    let actorId = config.memberId || (typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname).memberId : "weijia_mac");
    let members = [];
    let linkedThread = null;
    let lastSnapshot = { messages: [] };
    let selectionMessages = [];
    let selectionTitle = "当前对话";
    let selectionThread = null;
    const selectedContextIndexes = new Set();
    let selectionAnchorIndex = -1;
    let selectionValue = true;
    let selectionPointerActive = false;
    let selectionDragged = false;

    // 常驻原生桥接 iframe：穿透宿主 Electron/React monkey-patched fetch 并保持上下文常驻
    const getBridgeWindow = () => {
      if (typeof window === "undefined" || typeof document === "undefined") return null;
      let ifr = document.getElementById("__team_context_bridge_frame__");
      if (!ifr || !ifr.contentWindow) {
        ifr = document.createElement("iframe");
        ifr.id = "__team_context_bridge_frame__";
        ifr.style.display = "none";
        document.documentElement.appendChild(ifr);
      }
      return ifr.contentWindow;
    };

    const safeFetch = async (url, options = {}) => {
      const bw = getBridgeWindow();
      if (bw && typeof bw.fetch === "function") {
        try {
          return await bw.fetch(url, options);
        } catch (_) {}
      }
      return fetch(url, options);
    };

    const getRawEventSource = () => {
      const bw = getBridgeWindow();
      return (bw && bw.EventSource) || (typeof EventSource !== "undefined" ? EventSource : null);
    };

    window.__teamContextRpcCallbacks = window.__teamContextRpcCallbacks || new Map();
    window.__teamContextPendingCalls = window.__teamContextPendingCalls || [];
    window.__teamContextTakePendingCalls = () => {
      if (!window.__teamContextPendingCalls || !window.__teamContextPendingCalls.length) return null;
      const calls = [...window.__teamContextPendingCalls];
      window.__teamContextPendingCalls = [];
      return calls;
    };
    window.__teamContextOnNativeResponse = (id, resp) => {
      if (window.__teamContextRpcCallbacks && window.__teamContextRpcCallbacks.has(id)) {
        const cb = window.__teamContextRpcCallbacks.get(id);
        window.__teamContextRpcCallbacks.delete(id);
        if (Array.isArray(window.__teamContextPendingCalls)) {
          window.__teamContextPendingCalls = window.__teamContextPendingCalls.filter((p) => p && p.id !== id);
        }
        cb(resp);
      }
    };

    window.__teamContextTrace = window.__teamContextTrace || [];
    const logTrace = (step, detail) => {
      try {
        window.__teamContextTrace.push({ t: new Date().toISOString(), step, detail });
        if (window.__teamContextTrace.length > 100) window.__teamContextTrace.shift();
      } catch {}
    };

    const callRpc = (fullPath, options = {}) => {
      const id = "rpc_" + Math.random().toString(36).slice(2) + Date.now();
      const targetHub = options.hubUrl || config.hubUrl || "";
      logTrace("callRpc_start", { id, fullPath, method: options.method || "GET", hubUrl: targetHub });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          window.__teamContextRpcCallbacks.delete(id);
          logTrace("callRpc_timeout", { id, fullPath });
          reject(new Error("代理请求响应超时"));
        }, 8000);

        window.__teamContextRpcCallbacks.set(id, (resp) => {
          clearTimeout(timer);
          logTrace("callRpc_callback_received", { id, ok: resp?.ok, status: resp?.status });
          if (!resp || !resp.ok) {
            const err = new Error((resp && (resp.error || resp.data?.message || resp.data?.error)) || `HTTP ${resp?.status || 500}`);
            err.status = resp?.status || 500;
            err.data = resp?.data;
            reject(err);
          } else {
            resolve(resp.data);
          }
        });

        const reqPayload = {
          id,
          hubUrl: targetHub,
          path: fullPath,
          method: options.method || "GET",
          headers: {
            "X-Room-Id": defaultRoomId(),
            ...(config.roomKey ? { "X-Room-Key": config.roomKey } : {}),
            ...(options.headers || {}),
          },
          body: options.body || null,
        };

        logTrace("callRpc_dispatching", { id, fullPath, hasNative: typeof window.__teamContextNativeCall === "function" });
        // 挂入轮询队列作为兜底保底，防止生命周期中 binding 丢失导致死锁
        window.__teamContextPendingCalls.push(reqPayload);

        // 如果存在原生绑定，则尝试即时触发提高响应速度
        if (typeof window.__teamContextNativeCall === "function") {
          try {
            window.__teamContextNativeCall(JSON.stringify(reqPayload));
            logTrace("callRpc_native_invoked", { id });
          } catch (e) {
            logTrace("callRpc_native_error", { id, err: e.message });
            console.warn("[TeamContext] native binding call failed:", e);
          }
        }
      });
    };
    window.__teamContextCallRpc = callRpc;

    window.__teamContextClientId = window.__teamContextClientId || `client_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    // API 通用封装 (自动携带 room 和 roomKey，统一走守护进程原生网络桥接，避免渲染层 fetch 拦截)
    const api = async (path, options = {}) => {
      const separator = path.includes("?") ? "&" : "?";
      const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname) : { nickname: config.nickname, memberId: config.nickname };
      const myMemberId = config.memberId || devUser.memberId || "";
      const myMemberName = config.nickname || devUser.nickname || "";
      const roomParams = `room=${encodeURIComponent(defaultRoomId())}${config.roomKey ? `&room_key=${encodeURIComponent(config.roomKey)}` : ""}&member_id=${encodeURIComponent(myMemberId)}&member_name=${encodeURIComponent(myMemberName)}&client_id=${encodeURIComponent(window.__teamContextClientId || "")}`;
      const fullPath = `${path}${separator}${roomParams}`;
      logTrace("api_call", { path, fullPath });

      try {
        return await callRpc(fullPath, options);
      } catch (err) {
        logTrace("api_error", { path, err: err.message, status: err.status });
        if (err.status === 401) {
          const curRoom = config.roomId || "Media";
          const fallbackKey = (curRoom === "1024" ? "123456" : "") || config.roomKeys?.[curRoom];
          if (fallbackKey && config.roomKey !== fallbackKey) {
            console.log(`[TeamContext] api 调用鉴权 401，尝试携带已知默认密钥自愈重试...`);
            config.roomKey = fallbackKey;
            config.roomKeys = { ...(config.roomKeys || {}), [curRoom]: fallbackKey };
            saveConfig(config);
            return await api(path, options);
          }
          connState.status = "error";
          connState.errorMessage = "房间密码错误或未提供";
          updatePillUI();
          showConnectModal("该房间设置了访问密钥保护，请输入正确的 Room Key");
          throw new Error("401 Unauthorized: 房间访问密码错误");
        }
        throw err;
      }
    };
    window.__teamContextApi = api;

    const openExternalUrl = async (targetUrl) => {
      if (!targetUrl) return;
      try {
        await api("/api/open-url", {
          method: "POST",
          body: JSON.stringify({ url: targetUrl }),
        });
        showToast("✓ 已在系统浏览器中打开");
      } catch (err) {
        console.warn("[TeamContext] open-url api failed, fallback to window.open:", err);
        try {
          window.open(targetUrl, "_blank");
        } catch {}
      }
    };
    window.__teamContextOpenExternalUrl = openExternalUrl;

    // 更新顶栏胶囊状态
    const updatePillUI = () => {
      pillDot.className = "pill-dot";
      if (connState.status === "connected") {
        pillDot.classList.add("connected");
        const liveCount = Math.max(Number(connState.onlineCount) || 1, activeMemberIds ? activeMemberIds.size : 1);
        pillText.textContent = `${config.roomId} · ${liveCount}人在线`;
        roomStatusPill.title = `已连接至 ${config.hubUrl} (房间: ${config.roomId})`;
      } else if (connState.status === "connecting") {
        pillDot.classList.add("connecting");
        pillText.textContent = `${config.roomId} · 连接中...`;
        roomStatusPill.title = "正在连接协同服务...";
      } else if (connState.status === "error") {
        pillDot.classList.add("error");
        pillText.textContent = `${config.roomId} · ${connState.errorMessage || "连接异常"}`;
        roomStatusPill.title = "点击重新配置连接或密钥";
      } else {
        pillDot.classList.add("disconnected");
        pillText.textContent = "未连接 · 点击配置";
        roomStatusPill.title = "协同服务未连接，点击立即接入";
      }
    };

    const forgetRoomLocally = (roomId) => {
      const cleanRoom = String(roomId || "").trim();
      if (!cleanRoom) return false;
      const remaining = (config.historyRooms || []).filter((item) => item !== cleanRoom);
      if (!remaining.length && cleanRoom === config.roomId) return false;
      config.historyRooms = remaining;
      const roomKeys = { ...(config.roomKeys || {}) };
      delete roomKeys[cleanRoom];
      config.roomKeys = roomKeys;
      saveConfig(config);
      return true;
    };

    const renderPopoverHistory = () => {
      popoverHubLabel.textContent = config.hubUrl.replace(/^https?:\/\//, "");
      popoverHistoryRooms.innerHTML = "";
      const rooms = Array.from(new Set([...(config.historyRooms || []), config.roomId]));
      rooms.forEach((r) => {
        const chip = document.createElement("span");
        chip.className = "room-tag-chip";
        chip.dataset.active = String(r === config.roomId);
        chip.title = `空间: ${r}`;

        const nameSpan = document.createElement("span");
        nameSpan.className = "room-tag-chip-name";
        nameSpan.textContent = r;
        nameSpan.addEventListener("click", () => {
          roomPopover.hidden = true;
          switchRoom(r);
        });
        chip.appendChild(nameSpan);

        if (rooms.length > 1) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "room-tag-chip-del";
          delBtn.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          delBtn.title = `从历史记录中移除空间 ${r}`;
          delBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const wasCurrent = r === config.roomId;
            if (forgetRoomLocally(r)) {
              if (wasCurrent) {
                const fallback = (config.historyRooms || []).find((item) => item && item !== r) || "1024";
                switchRoom(fallback);
              }
              renderPopoverHistory();
              showToast(`已从历史记录中移除空间 ${r}`);
            }
          });
          chip.appendChild(delBtn);
        }

        popoverHistoryRooms.appendChild(chip);
      });

      if (connState.status === "disconnected") {
        btnDisconnect.textContent = "立即重连";
        btnDisconnect.classList.remove("danger");
      } else {
        btnDisconnect.textContent = "断开连接";
        btnDisconnect.classList.add("danger");
      }
    };

    const deleteCurrentRoom = async () => {
      const roomId = String(config.roomId || "").trim();
      if (!roomId || roomId === "Media") {
        showToast("系统空间 Media 不允许删除");
        return;
      }
      if (!window.confirm(`确定删除团队 Hub 空间“${roomId}”及其消息、规则和共享凭据吗？此操作不可恢复，但不会删除 Codex 本地对话。`)) return;

      roomDeletionInFlight = true;
      roomPopover.hidden = true;
      try {
        await api(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "DELETE",
          body: JSON.stringify({ confirm_room: roomId }),
        });
        forgetRoomLocally(roomId);
        config = {
          ...config,
          roomId: "Media",
          roomKey: config.roomKeys?.Media || "",
          historyRooms: Array.from(new Set(["Media", ...(config.historyRooms || []).filter((item) => item !== roomId)])),
        };
        saveConfig(config);
        await connectHub(config, true);
        renderPopoverHistory();
        showToast(`空间 ${roomId} 已删除，已切换到 Media`);
      } catch (err) {
        showToast(`删除空间失败: ${err.message || "请求失败"}`);
      } finally {
        roomDeletionInFlight = false;
      }
    };

    const stopSnapshotPoll = () => {
      if (snapshotPollTimer) {
        clearInterval(snapshotPollTimer);
        snapshotPollTimer = null;
      }
      snapshotPollInFlight = false;
    };

    const pollSnapshotOnce = async () => {
      if (snapshotPollInFlight) return;
      if (connState.status === "disconnected") return;
      snapshotPollInFlight = true;
      try {
        const snap = await api("/api/snapshot");
        apply(snap);
      } catch (err) {
        logTrace("snapshot_poll_failed", { err: err?.message || String(err) });
      } finally {
        snapshotPollInFlight = false;
      }
    };

    const startSnapshotPoll = () => {
      stopSnapshotPoll();
      snapshotPollTimer = setInterval(() => { pollSnapshotOnce(); }, 2000);
    };

    const ingestSsePayload = (kind, raw) => {
      try {
        if (kind === "open") {
          connState.status = "connected";
          updatePillUI();
          return;
        }
        if (kind === "error") return;
        const data = typeof raw === "string" ? JSON.parse(raw || "null") : raw;
        if (kind === "snapshot") {
          apply(data);
          return;
        }
        if (kind === "chat" || kind === "message") {
          renderMessage(data);
          return;
        }
        if (kind === "room_status") {
          if (typeof data?.online_count === "number") {
            connState.onlineCount = data.online_count;
          }
          if (Array.isArray(data?.active_members)) {
            activeMemberIds = new Set(data.active_members);
            renderPeople(true);
          }
          updatePillUI();
          return;
        }
        if (kind === "room_deleted") {
          const info = data || {};
          connState.status = "disconnected";
          updatePillUI();
          if (roomDeletionInFlight || info.room_id !== config.roomId) return;
          const deletedRoom = config.roomId;
          forgetRoomLocally(deletedRoom);
          config = {
            ...config,
            roomId: info.fallback_room || "Media",
            roomKey: config.roomKeys?.[info.fallback_room || "Media"] || "",
            historyRooms: Array.from(new Set([info.fallback_room || "Media", ...(config.historyRooms || []).filter((item) => item !== deletedRoom)])),
          };
          saveConfig(config);
          connectHub(config, true);
          showToast(info.message || `空间 ${deletedRoom} 已删除，已切换到 ${config.roomId}`);
          return;
        }
        if (kind === "auth_revoked") {
          connState.status = "error";
          connState.errorMessage = "密钥已更新";
          updatePillUI();
          showConnectModal(data?.message || "房间访问密钥已更新，请输入新密钥");
        }
      } catch {}
    };

    // 建立 SSE 实时监听
    const setupSSE = () => {
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      const hub = (config.hubUrl || "http://127.0.0.1:18765").replace(/\/$/, "");
      const myClientId = window.__teamContextClientId || (window.__teamContextClientId = `client_${Math.random().toString(36).slice(2)}_${Date.now()}`);
      const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname) : { nickname: config.nickname, memberId: config.nickname };
      const myMemberId = config.memberId || devUser.memberId;
      const myMemberName = config.nickname || devUser.nickname;
      const params = new URLSearchParams({
        room: defaultRoomId(),
        room_key: config.roomKey || "",
        member_id: myMemberId,
        member_name: myMemberName,
        client_id: myClientId,
      });
      const sseUrl = `${hub}/api/events?${params.toString()}`;

      if (!bridgeSseListenerBound) {
        bridgeSseListenerBound = true;
        window.addEventListener("message", (event) => {
          const payload = event && event.data;
          if (!payload || payload.__tcSse !== true) return;
          ingestSsePayload(payload.kind, payload.data);
        });
      }

      try {
        const bootSseInBridge = () => {
          const ifr = document.getElementById("__team_context_bridge_frame__") || getBridgeWindow()?.frameElement;
          const idoc = ifr && ifr.contentDocument;
          if (!idoc) return false;
          const existing = idoc.getElementById("__tc_sse_boot__");
          if (existing) existing.remove();
          try {
            if (idoc.defaultView && idoc.defaultView.__tcEs) {
              idoc.defaultView.__tcEs.close();
              idoc.defaultView.__tcEs = null;
            }
          } catch {}
          const boot = idoc.createElement("script");
          boot.id = "__tc_sse_boot__";
          boot.textContent = `
            (function () {
              try { if (window.__tcEs) { window.__tcEs.close(); window.__tcEs = null; } } catch (e) {}
              var es = new EventSource(${JSON.stringify(sseUrl)});
              window.__tcEs = es;
              function emit(kind, ev) {
                try { parent.postMessage({ __tcSse: true, kind: kind, data: ev && ev.data }, "*"); } catch (e) {}
              }
              es.addEventListener("snapshot", function (e) { emit("snapshot", e); });
              es.addEventListener("chat", function (e) { emit("chat", e); });
              es.addEventListener("message", function (e) { emit("chat", e); });
              es.onmessage = function (e) { emit("chat", e); };
              es.addEventListener("room_status", function (e) { emit("room_status", e); });
              es.addEventListener("room_deleted", function (e) { emit("room_deleted", e); });
              es.addEventListener("auth_revoked", function (e) { emit("auth_revoked", e); });
              es.onopen = function () { emit("open", { data: "{}" }); };
              es.onerror = function () { emit("error", { data: String(es.readyState) }); };
            })();
          `;
          (idoc.documentElement || idoc.body || idoc).appendChild(boot);
          sseSource = {
            close() {
              try {
                if (idoc.defaultView && idoc.defaultView.__tcEs) {
                  idoc.defaultView.__tcEs.close();
                  idoc.defaultView.__tcEs = null;
                }
              } catch {}
            },
            readyState: 1,
          };
          return true;
        };

        if (!bootSseInBridge()) {
          const RawEventSource = getRawEventSource();
          if (!RawEventSource) return;
          sseSource = new RawEventSource(sseUrl);
          const onChat = (e) => ingestSsePayload("chat", e.data);
          sseSource.addEventListener("chat", onChat);
          sseSource.addEventListener("message", onChat);
          sseSource.onmessage = onChat;
          sseSource.addEventListener("snapshot", (e) => ingestSsePayload("snapshot", e.data));
          sseSource.addEventListener("room_status", (e) => ingestSsePayload("room_status", e.data));
          sseSource.addEventListener("room_deleted", (e) => ingestSsePayload("room_deleted", e.data));
          sseSource.addEventListener("auth_revoked", (e) => ingestSsePayload("auth_revoked", e.data));
          sseSource.onopen = () => ingestSsePayload("open");
          sseSource.onerror = () => {
            if (sseSource?.readyState === EventSource.CLOSED) {
              ingestSsePayload("error", String(sseSource.readyState));
            }
          };
        }
      } catch (err) {
        connState.status = "error";
        connState.errorMessage = "SSE 连接失败";
        updatePillUI();
      }
    };

    // 连接或切换房间核心逻辑
    const connectHub = async (newConfig, isSwitch = false) => {
      connState.status = "connecting";
      updatePillUI();
      btnConnectText.textContent = "正在验证...";
      btnConfirmConnect.disabled = true;
      connectErrorBanner.hidden = true;

      // 立即更新本地状态与持久化存储
      const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(newConfig.nickname || config.nickname) : { nickname: newConfig.nickname, memberId: newConfig.nickname };
      config = {
        ...config,
        ...newConfig,
        nickname: devUser.nickname,
        memberId: devUser.memberId,
        roomKeys: { ...(config.roomKeys || {}), [newConfig.roomId]: newConfig.roomKey || "" },
        historyRooms: Array.from(new Set([newConfig.roomId, ...(config.historyRooms || [])])),
      };
      saveConfig(config);
      actorId = config.memberId;

      // 通知守护进程在 Node 层面进行鉴权中继
      window.__teamContextPendingConfig = newConfig;

      // 4500ms 兜底重置按钮，绝不让按钮死锁在 disabled
      const safetyTimer = setTimeout(() => {
        if (btnConfirmConnect.disabled) {
          btnConnectText.textContent = "连接并进入房间";
          btnConfirmConnect.disabled = false;
        }
      }, 4500);

      try {
        const hub = (newConfig.hubUrl || "http://127.0.0.1:18765").replace(/\/$/, "");
        const verifyBody = {
          room: newConfig.roomId,
          room_key: newConfig.roomKey,
          auto_create: true,
          member_id: config.memberId,
          member_name: config.nickname,
          client_id: window.__teamContextClientId || "",
        };

        let verifyData;
        let rpcVerified = false;

        // 优先走 callRpc（或安全降级），确保在 Electron/Node 环境下穿透私网跨域与 PNA 限制
        if (typeof window.__teamContextNativeCall === "function" || (Array.isArray(window.__teamContextPendingCalls))) {
          try {
            verifyData = await callRpc("/api/rooms/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: verifyBody,
              hubUrl: hub,
            });
            rpcVerified = true;
          } catch (rpcErr) {
            if (rpcErr.status === 401 || (rpcErr.message && rpcErr.message.includes("401"))) {
              throw new Error("房间访问密码错误，请核对 Secret Token / Room Key");
            }
            console.warn("[TeamContext] callRpc verify failed, falling back to direct safeFetch:", rpcErr.message);
          }
        }

        if (!rpcVerified) {
          const fetchPromise = safeFetch(`${hub}/api/rooms/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(verifyBody),
          });

          // 渲染进程 3500ms 超时赛跑，避免渲染层直连阻断挂起，适配跨网段握手延迟
          const verifyRes = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("直连超时 (3500ms)")), 3500)),
          ]);

          if (verifyRes.status === 401) {
            throw new Error("房间访问密码错误，请核对 Secret Token / Room Key");
          }
          if (!verifyRes.ok) {
            throw new Error(`无法连接到 Hub 服务 (${verifyRes.status})`);
          }

          verifyData = await verifyRes.json();
        }
        if (window.__teamContextRetryTimer) {
          clearTimeout(window.__teamContextRetryTimer);
          window.__teamContextRetryTimer = null;
        }
        connState.status = "connected";
        connState.errorMessage = "";
        connState.onlineCount = verifyData.online_count || 1;
        updatePillUI();
        connectModal.hidden = true;

        // 清空旧房间消息并重新加载
        messagesEl.innerHTML = "";
        knownIds.clear();
        const snap = await api("/api/snapshot");
        apply(snap);
        setupSSE();
        startSnapshotPoll();
      } catch (err) {
        if (err.message.includes("401") || err.message.includes("密码")) {
          const curRoom = config.roomId || "Media";
          const fallbackKey = (curRoom === "1024" ? "123456" : "") || config.roomKeys?.[curRoom];
          if (fallbackKey && config.roomKey !== fallbackKey) {
            console.log(`[TeamContext] 房间 [${curRoom}] 验证收到 401，尝试携带已知默认密钥自愈重连...`);
            config.roomKey = fallbackKey;
            config.roomKeys = { ...(config.roomKeys || {}), [curRoom]: fallbackKey };
            saveConfig(config);
            return connectHub(config, isSwitch);
          }
          connState.status = "error";
          connState.errorMessage = "密钥错误";
          updatePillUI();
          connectErrorBanner.textContent = err.message;
          connectErrorBanner.hidden = false;
          cfgRoomKey.value = config.roomKey || (curRoom === "1024" ? "123456" : "");
          connectModal.hidden = false;
          setTimeout(() => cfgRoomKey?.focus(), 120);
        } else {
          console.warn("[TeamContext] direct fetch failed/fallback:", err.message);
          const defaultHost = (window.__TEAM_CONTEXT_HOST__ || "http://127.0.0.1:18765").replace(/\/?\?.*$/, "").replace(/\/$/, "");
          if (hub !== defaultHost) {
            console.log(`[TeamContext] 远端 Hub [${hub}] 连接受阻，自动回退到本地中枢 [${defaultHost}]...`);
            config.hubUrl = defaultHost;
            saveConfig(config);
            return connectHub(config, isSwitch);
          }
          // 无论是超时还是其他网络错误，明确设置 connState.status = "error"，绝不允许静默停留在 "connecting"
          connState.status = "error";
          connState.errorMessage = err.message.includes("超时") ? "连接超时" : "连接失败";
          updatePillUI();
          connectErrorBanner.textContent = `协同服务连接受阻: ${err.message}`;
          connectErrorBanner.hidden = false;

          // 自动重试调度
          if (!window.__teamContextRetryTimer) {
            window.__teamContextRetryTimer = setTimeout(() => {
              window.__teamContextRetryTimer = null;
              if (connState.status === "error" && config.autoConnect !== false) {
                console.log("[TeamContext] 正在调度自动重试连接...");
                connectHub(config);
              }
            }, 8000);
          }
        }
      } finally {
        clearTimeout(safetyTimer);
        btnConnectText.textContent = "连接并进入房间";
        btnConfirmConnect.disabled = false;
      }
    };

    const switchRoom = (roomId) => {
      let cleanRoom = String(roomId || "Media").trim();
      let hubUrl = config.hubUrl;
      let roomKey = "";
      const token = typeof parseCollabToken === "function" ? parseCollabToken(cleanRoom) : null;
      if (token) {
        cleanRoom = token.roomId;
        hubUrl = token.hubUrl || hubUrl;
        roomKey = token.roomKey || config.roomKeys?.[cleanRoom] || "";
      } else {
        cleanRoom = sanitizeRoomName(cleanRoom);
        roomKey = config.roomKeys?.[cleanRoom] || (cleanRoom === config.roomId ? config.roomKey : "") || "";
      }
      connectHub({ ...config, hubUrl, roomId: cleanRoom, roomKey }, true);
    };

    const sanitizeRoomName = (raw) => {
      if (!raw) return "Media";
      let val = String(raw).trim();
      if (val.includes("http://") || val.includes("https://") || val.includes("token=") || val.includes("api/shared")) {
        const match = val.match(/[?&]room=([^&]+)/);
        if (match && match[1]) {
          const extracted = decodeURIComponent(match[1]).trim();
          showToast(`检测到分享链接，已自动提取空间名 [${extracted}]`);
          return extracted || "Media";
        }
        showToast("检测到粘贴了长链接，已自动调整为默认空间 Media");
        return "Media";
      }
      val = val.replace(/[\r\n\t]/g, "").slice(0, 30);
      return val || "Media";
    };

    // 检查并提示新版本
    const btnCheckUpdate = root.getElementById("btn-check-update");
    const cfgVersionText = root.getElementById("cfg-version-text");
    const cfgUpdateBox = root.getElementById("cfg-update-box");

    const doCheckUpdate = async (silent = false) => {
      try {
        let data = null;
        try {
          const r = await fetch("http://127.0.0.1:18767/api/update");
          if (r.ok) data = await r.json();
        } catch {}
        if (!data) {
          const res = await callRpc({
            path: "/api/update",
            hubUrl: "http://127.0.0.1:18767",
            method: "GET",
          }).catch(() => null);
          if (res?.ok) data = res.data;
        }
        if (data?.has_update) {
          if (cfgVersionText) cfgVersionText.textContent = `发现新版本: ${data.latest} (当前: ${UI_VERSION})`;
          if (cfgUpdateBox) {
            cfgUpdateBox.innerHTML = '<button class="form-btn-primary" id="btn-do-update-now" type="button" style="font-size:11.5px;padding:4px 12px;background:var(--accent-color);color:#fff;border-radius:6px;cursor:pointer;border:none;font-weight:600;">立即更新</button>';
            const btnDoUpdate = root.getElementById("btn-do-update-now");
            if (btnDoUpdate) {
              btnDoUpdate.onclick = async () => {
                btnDoUpdate.disabled = true;
                btnDoUpdate.textContent = "下载中...";
                showToast("正在拉取最新安装包...");
                try {
                  await fetch("http://127.0.0.1:18767/api/update/download", { method: "POST" });
                  showToast("已打开安装包");
                } catch {
                  if (data.url) window.open(data.url, "_blank");
                }
                btnDoUpdate.disabled = false;
              };
            }
          }
          if (btnHeaderConfig && !btnHeaderConfig.querySelector(".update-dot")) {
            const dot = document.createElement("span");
            dot.className = "update-dot";
            dot.style.cssText = "display:inline-block;width:6px;height:6px;background:#38bdf8;border-radius:50%;position:relative;top:-3px;margin-left:2px;";
            btnHeaderConfig.appendChild(dot);
          }
        } else if (!silent) {
          if (cfgVersionText) cfgVersionText.textContent = `插件版本: ${UI_VERSION} · 当前已是最新版本`;
          showToast("当前已是最新版本");
        }
      } catch {
        if (!silent) showToast("无法连接控制面，请确认本地服务正常");
      }
    };

    if (btnCheckUpdate) {
      btnCheckUpdate.onclick = () => doCheckUpdate(false);
    }

    // 模态弹窗控制
    const showConnectModal = (errMsg = "") => {
      doCheckUpdate(true);
      cfgHubUrl.value = config.hubUrl || "http://127.0.0.1:18765";
      cfgRoomId.value = config.roomId || "Media";
      cfgRoomKey.value = config.roomKey || (config.roomKeys?.[config.roomId] || "");
      cfgNickname.value = config.nickname || detectCurrentUserName();

      if (cfgHubStatus) {
        if (connState.status === "connected") {
          cfgHubStatus.textContent = `● 协同服务正常 (${config.hubUrl.replace(/^https?:\/\//, "")})`;
          cfgHubStatus.style.color = "var(--accent-color)";
        } else if (connState.status === "connecting") {
          cfgHubStatus.textContent = `● 正在尝试连接协同服务...`;
          cfgHubStatus.style.color = "var(--text-secondary)";
        } else {
          cfgHubStatus.textContent = `○ 协同服务未连通，可直接修改上方地址`;
          cfgHubStatus.style.color = "#ef4444";
        }
      }

      const renderQuickRooms = () => {
        cfgQuickRooms.innerHTML = "";
        (config.historyRooms || ["Media"]).forEach((r) => {
          const chip = document.createElement("span");
          chip.className = "room-tag-chip";
          chip.title = `点击填入空间 ${r}`;

          const nameSpan = document.createElement("span");
          nameSpan.className = "room-tag-chip-name";
          nameSpan.textContent = r;
          nameSpan.addEventListener("click", () => {
            cfgRoomId.value = r;
            if (config.roomKeys?.[r]) {
              cfgRoomKey.value = config.roomKeys[r];
            }
          });
          chip.appendChild(nameSpan);

          if ((config.historyRooms || []).length > 1) {
            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "room-tag-chip-del";
            delBtn.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            delBtn.title = `从历史中移除空间 ${r}`;
            delBtn.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (forgetRoomLocally(r)) {
                if (cfgRoomId.value === r) {
                  cfgRoomId.value = (config.historyRooms || [])[0] || "1024";
                }
                renderQuickRooms();
                renderPopoverHistory();
                showToast(`已从历史中移除空间 ${r}`);
              }
            });
            chip.appendChild(delBtn);
          }

          cfgQuickRooms.appendChild(chip);
        });

        // 快捷新建空间标签
        const newRoomChip = document.createElement("span");
        newRoomChip.className = "room-tag-chip new-room-chip";
        newRoomChip.textContent = "+ 新建空间";
        newRoomChip.title = "输入新空间名称进行创建与接入";
        newRoomChip.addEventListener("click", () => {
          cfgRoomId.value = "";
          cfgRoomId.placeholder = "输入新空间名称 (如 1024 或 Project-A)";
          cfgRoomId.focus();
        });
        cfgQuickRooms.appendChild(newRoomChip);
      };

      renderQuickRooms();

      if (errMsg) {
        connectErrorBanner.textContent = errMsg;
        connectErrorBanner.hidden = false;
      } else {
        connectErrorBanner.hidden = true;
      }
      connectModal.hidden = false;
    };

    // 弹窗表单事件绑定
    btnResetHub?.addEventListener("click", () => {
      const defaultHost = (window.__TEAM_CONTEXT_HOST__ || "http://127.0.0.1:18765").replace(/\/?\?.*$/, "").replace(/\/$/, "");
      cfgHubUrl.value = defaultHost;
      showToast(`已恢复为默认服务地址: ${defaultHost}`);
    });

    cfgRoomId.addEventListener("blur", () => {
      cfgRoomId.value = sanitizeRoomName(cfgRoomId.value);
    });

    const eyeIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    btnTogglePwd.addEventListener("click", () => {
      const isPwd = cfgRoomKey.type === "password";
      cfgRoomKey.type = isPwd ? "text" : "password";
      btnTogglePwd.innerHTML = isPwd ? eyeOffIconSvg : eyeIconSvg;
    });

    // 弹窗各输入框粘贴智能识别分拆口令
    [cfgHubUrl, cfgRoomId, cfgRoomKey].forEach((inputEl) => {
      inputEl?.addEventListener("paste", (e) => {
        const text = e.clipboardData?.getData("text") || "";
        const token = parseCollabToken(text);
        if (token) {
          e.preventDefault();
          cfgHubUrl.value = token.hubUrl;
          cfgRoomId.value = token.roomId;
          if (token.roomKey) {
            cfgRoomKey.value = token.roomKey;
          }
          if (connectErrorBanner) {
            connectErrorBanner.hidden = false;
            connectErrorBanner.style.color = "var(--accent-color)";
            connectErrorBanner.style.borderColor = "color-mix(in srgb, var(--accent-color) 30%, transparent)";
            connectErrorBanner.style.background = "color-mix(in srgb, var(--accent-color) 10%, transparent)";
            connectErrorBanner.textContent = `✓ 已自动识别空间口令并分拆填入：${token.roomId} (${token.hubUrl.replace(/^https?:\/\//, "")})`;
          }
          showToast(`✓ 已自动识别空间口令并分拆填入配置`);
        }
      });
    });

    btnCopyCollabToken?.addEventListener("click", async () => {
      const token = generateCollabToken();
      try {
        if (!navigator.clipboard?.writeText) throw new Error("剪贴板不可用");
        await navigator.clipboard.writeText(token);
        const originalHtml = btnCopyCollabToken.innerHTML;
        btnCopyCollabToken.innerHTML = `<span>✓ 已复制口令!</span>`;
        setTimeout(() => {
          btnCopyCollabToken.innerHTML = originalHtml;
        }, 1800);
        showToast("✓ 已复制空间邀请口令！在另一台电脑直接粘贴即可一键加入");
      } catch (err) {
        showToast(`复制失败: ${err.message || "剪贴板不可用"}`);
      }
    });

    btnConfirmConnect.addEventListener("click", () => {
      let hubUrl = cfgHubUrl.value.trim() || "http://127.0.0.1:18765";
      let rawRoomId = cfgRoomId.value.trim() || "Media";
      let roomKey = cfgRoomKey.value.trim();

      const tokenInRoom = parseCollabToken(rawRoomId);
      const tokenInHub = parseCollabToken(hubUrl);
      const foundToken = tokenInRoom || tokenInHub;
      if (foundToken) {
        hubUrl = foundToken.hubUrl;
        rawRoomId = foundToken.roomId;
        if (foundToken.roomKey) roomKey = foundToken.roomKey;
      }

      const roomId = sanitizeRoomName(rawRoomId);
      cfgRoomId.value = roomId;
      cfgHubUrl.value = hubUrl;
      const rawNickname = cfgNickname.value.trim() || detectCurrentUserName();
      const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(rawNickname) : { nickname: rawNickname, memberId: rawNickname };
      const nickname = devUser.nickname;
      const memberId = devUser.memberId;

      connectHub({ hubUrl, roomId, roomKey, nickname, memberId, autoConnect: true });
    });

    btnCancelConnect.addEventListener("click", () => { connectModal.hidden = true; });
    connectClose.addEventListener("click", () => { connectModal.hidden = true; });
    connectModal.addEventListener("click", (e) => {
      if (e.target === connectModal) connectModal.hidden = true;
    });

    // 顶栏胶囊与 Popover 事件
    roomStatusPill.addEventListener("click", (e) => {
      e.stopPropagation();
      const willShow = roomPopover.hidden;
      if (willShow) {
        renderPopoverHistory();
        roomPopover.hidden = false;
        roomStatusPill.setAttribute("aria-expanded", "true");
      } else {
        roomPopover.hidden = true;
        roomStatusPill.setAttribute("aria-expanded", "false");
      }
    });

    root.addEventListener("click", (e) => {
      if (!e.composedPath().includes(roomPopover) && !e.composedPath().includes(roomStatusPill)) {
        roomPopover.hidden = true;
        roomStatusPill.setAttribute("aria-expanded", "false");
      }
    });

    btnPopoverSwitchRoom.addEventListener("click", () => {
      const targetRoom = popoverNewRoom.value.trim();
      if (targetRoom) {
        roomPopover.hidden = true;
        popoverNewRoom.value = "";
        switchRoom(targetRoom);
      }
    });

    popoverNewRoom.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnPopoverSwitchRoom.click();
      }
    });

    btnOpenConfigModal.addEventListener("click", () => {
      roomPopover.hidden = true;
      showConnectModal();
    });

    btnHeaderConfig.addEventListener("click", () => {
      showConnectModal();
    });

    btnDisconnect.addEventListener("click", () => {
      roomPopover.hidden = true;
      if (connState.status === "disconnected") {
        connectHub(config);
      } else {
        if (sseSource) {
          sseSource.close();
          sseSource = null;
        }
        stopSnapshotPoll();
        connState.status = "disconnected";
        updatePillUI();
      }
    });

    // 滚动与 Minimap 同步
    let minimapFrame = 0;
    const scheduleMinimapSync = () => {
      if (minimapFrame) return;
      minimapFrame = window.requestAnimationFrame(() => {
        minimapFrame = 0;
        syncMinimap();
      });
    };
    messagesEl.addEventListener("scroll", scheduleMinimapSync, { passive: true });

    const showToast = (msg) => {
      let toast = root.getElementById("team-context-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "team-context-toast";
        toast.className = "toast-notification";
        root.appendChild(toast);
      }
      toast.textContent = msg;
      toast.hidden = false;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => { toast.hidden = true; }, 2400);
    };

    const messageNodeToMarkdown = (node) => {
      const walk = (current) => {
        if (current.nodeType === Node.TEXT_NODE) return current.nodeValue || "";
        if (current.nodeType !== Node.ELEMENT_NODE) return "";
        const tag = current.tagName.toLowerCase();
        if (tag === "button" || current.getAttribute("aria-hidden") === "true" || current.getAttribute("role") === "button") return "";
        if (tag === "br") return "\n";
        if (tag === "img") {
          const alt = current.getAttribute("alt") || "图片";
          return `\n[图片：${alt}]\n`;
        }
        if (tag === "pre") {
          const code = (current.innerText || current.textContent || "").trim();
          return code ? "\n\n```\n" + code + "\n```\n\n" : "";
        }
        const children = Array.from(current.childNodes).map(walk).join("");
        if (tag === "a") {
          const text = children.trim();
          const href = current.getAttribute("href") || current.href || "";
          return href && text ? `[${text}](${href})` : text;
        }
        if (tag === "code") return children.trim() ? "`" + children.trim() + "`" : "";
        if (tag === "li") return `\n- ${children.trim()}`;
        if (/^(p|div|section|article|blockquote|h[1-6]|ul|ol)$/.test(tag)) return `\n${children.trim()}\n`;
        return children;
      };

      return walk(node).replace(/\n{3,}/g, "\n\n").trim();
    };

    const detectCodexRunMetadata = () => {
      const labels = Array.from(document.querySelectorAll("button, [role='button']"))
        .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
        .filter((label) => label && label.length <= 100);
      const modelLabel = labels
        .map((label) => label.match(/(?:GPT-\d+(?:\.\d+)?(?:\s+[A-Za-z][A-Za-z0-9.-]*)?|Claude(?:\s+[A-Za-z0-9.-]+){0,2}|Gemini(?:\s+[A-Za-z0-9.-]+){0,2}|o\d(?:[.-][A-Za-z0-9.-]+)?)/i)?.[0] || null)
        .find((label) => label && !/^Codex$/i.test(label));
      const reasoningLabel = labels.find((label) => /reasoning|thinking|思考|推理/i.test(label));
      return {
        model_label: modelLabel || null,
        reasoning_label: reasoningLabel || null,
      };
    };

    const extractLocalThreadMessages = () => {
      const thread = linkedThread || currentThread();
      const title = thread?.title || document.title.replace(/\s*-\s*ChatGPT|\s*-\s*Codex/i, "").trim() || "当前对话";
      
      let nodes = [];
      let streaming = false;
      try {
       const page = document.getElementById(PAGE_ID);
       const isInsideTeamPage = (node) => page && (node === page || page.contains(node));
       const container = document.querySelector(".thread-scroll-container") || document.body;

       // 优先匹配精准的 Markdown 消息根节点（支持原生 Codex 与 ChatGPT 客户端）
       const primaryNodes = Array.from(container.querySelectorAll(
         "[data-markdown-text-tone='user-message'], [data-markdown-text-style='assistant-message']"
       )).filter((n) => !isInsideTeamPage(n));

       if (primaryNodes.length) {
         nodes = primaryNodes;
       } else {
         const roleNodes = Array.from(container.querySelectorAll("[data-message-author-role], [data-message-role], [data-testid*='assistant'], [data-testid*='response'], [data-testid*='message']"));
         const toneNodes = Array.from(container.querySelectorAll("[data-markdown-text-tone], [data-markdown-text-style]"));
         const fallbackNodes = Array.from(container.querySelectorAll("[data-user-message-bubble], .bg-user-message"));
         const semanticNodes = Array.from(new Set([...roleNodes, ...toneNodes, ...fallbackNodes]))
           .filter((node) => !isInsideTeamPage(node));
         const topLevelSemanticNodes = semanticNodes.filter((node) => !semanticNodes.some((candidate) => candidate !== node && candidate.contains(node)));
         if (topLevelSemanticNodes.length) {
           nodes = topLevelSemanticNodes;
         } else {
          const articleNodes = Array.from(container.querySelectorAll("article, [data-message-id]"))
             .filter((node) => !isInsideTeamPage(node));
           nodes = articleNodes.filter((node) => !articleNodes.some((candidate) => candidate !== node && candidate.contains(node)));
         }
       }

       // 严格根据 DOM 文档位置排序，保证时间线绝对正确
       nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

       streaming = nodes.some((node) => (
          node.getAttribute("data-is-streaming") === "true" ||
          node.getAttribute("aria-busy") === "true" ||
          node.closest?.("[data-is-streaming='true'], [aria-busy='true']")
        ));
      } catch {}

     const messages = nodes.map((node, index) => {
       const rawRole = `${node.getAttribute("data-message-author-role") || ""} ${node.getAttribute("data-message-role") || ""} ${node.getAttribute("data-markdown-text-tone") || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("aria-label") || ""}`;
       const isUser =
         node.getAttribute("data-markdown-text-tone") === "user-message" ||
         /user|human|user-message/i.test(rawRole) ||
         node.hasAttribute("data-user-message-bubble") ||
         /user-message/i.test(node.className || "") ||
         /bg-user-message/i.test(node.className || "");
       const role = isUser ? "用户" : "Codex";
       const text = messageNodeToMarkdown(node);
       return { index, role, text };
     }).filter((item) => item.text.length > 0);

      const hasCodexResponse = messages.some((item) => item.role === "Codex");
      const omitted = ["internal_context_window", "tool_calls", "shell_commands", "tool_input_output"];
      if (!messages.length) omitted.unshift("no_rendered_messages");
      if (!hasCodexResponse) omitted.unshift("codex_response_not_detected");
      if (streaming) omitted.unshift("response_still_streaming");
      const runMetadata = detectCodexRunMetadata();

      // 优先从消息及页面中嗅探官方公开只读分享链接 (https://chatgpt.com/s/cx_...)
      let shareUrl = null;
      for (const m of messages) {
        const match = m.text.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/);
        if (match) {
          shareUrl = match[0];
          break;
        }
      }

      const firstUserMsg = messages.find(m => m.role === "用户");
      const firstUserPrompt = firstUserMsg ? firstUserMsg.text : (messages[0]?.text || "");
      let imageUrl = null;
      let imageCount = 0;
      try {
        const imgs = Array.from(document.querySelectorAll("img[src*='blob:'], img[alt*='用户附件']"));
        if (imgs.length) {
          imageUrl = imgs[0].src;
          imageCount = imgs.length;
        }
      } catch {}

      return {
        title,
        thread,
        messages,
        shareUrl,
        firstUserPrompt,
        imageUrl,
        imageCount,
        capture: {
          source: "codex_visible_thread_dom",
          status: messages.length && !streaming
            ? (hasCodexResponse ? "captured_visible_thread" : "captured_without_codex_response")
            : (streaming ? "response_still_streaming" : "empty"),
          complete: Boolean(messages.length && hasCodexResponse && !streaming),
          message_count: messages.length,
          has_codex_response: hasCodexResponse,
          char_count: messages.reduce((total, item) => total + item.text.length, 0),
          model_label: runMetadata.model_label,
          reasoning_label: runMetadata.reasoning_label,
          omitted,
        },
      };
    };

    const formatContextMarkdown = (title, thread, messages, sourceText = "", snapshotId = "", shareUrl = "") => {
      const msgs = messages || [];
      const fullConversation = msgs.map((m) => `- **${m.role}**:\n${m.text}`).join("\n\n");
      if (shareUrl) {
        return `**官方公开链接**：${shareUrl}\n\n${fullConversation}`.trim();
      }
      return `# ${title}\n\n${fullConversation}`.trim();
    };

  // 微信式消息主体直接多选状态
  let isMultiSelectMode = false;
  const selectedMessageIds = new Set();
  let pointerDragging = false;
  let dragAnchorIndex = -1;
  let dragTargetValue = true;

   const getMessageRows = () => Array.from(messagesEl.querySelectorAll(".row[data-id]"));

   const updateMultiSelectUI = () => {
     const count = selectedMessageIds.size;
     if (selectionCount) {
       selectionCount.textContent = count ? `已选 ${count} 条` : "未选择消息";
     }
      if (btnSelectImportSelect) {
        btnSelectImportSelect.disabled = count === 0;
      }
      if (btnSelectImport) {
        btnSelectImport.disabled = count === 0;
        const curThread = currentThread();
        if (curThread?.title) {
          btnSelectImport.title = `导入到当前本地会话: 《${curThread.title}》`;
        } else {
          btnSelectImport.title = "导入到当前打开的本地会话输入框";
        }
      }
      if (btnSelectImportNew) {
        btnSelectImportNew.disabled = count === 0;
      }
     if (btnSelectClear) {
       btnSelectClear.disabled = count === 0;
     }
     const rows = getMessageRows();
     rows.forEach((row) => {
       const id = row.dataset.id;
       const isSelected = selectedMessageIds.has(id);
       row.dataset.selected = String(isSelected);
       const checkSvg = row.querySelector(".msg-select-check svg");
       if (checkSvg) checkSvg.style.opacity = isSelected ? "1" : "0";
     });
   };

   const toggleMessageSelection = (msgId) => {
     if (!msgId) return;
     if (selectedMessageIds.has(msgId)) {
       selectedMessageIds.delete(msgId);
     } else {
       selectedMessageIds.add(msgId);
     }
     updateMultiSelectUI();
   };

   const enterMultiSelectMode = (initialMessageId = null) => {
     if (isMultiSelectMode && !initialMessageId) return;
     isMultiSelectMode = true;
     selectionPointerActive = true;
     messagesEl.classList.add("multi-select-active");
     if (selectionBar) selectionBar.hidden = false;
     if (initialMessageId) {
       selectedMessageIds.add(initialMessageId);
     }
     updateMultiSelectUI();
   };

   const exitMultiSelectMode = () => {
     isMultiSelectMode = false;
     selectionPointerActive = false;
     selectedMessageIds.clear();
     messagesEl.classList.remove("multi-select-active");
     if (selectionBar) selectionBar.hidden = true;
     pointerDragging = false;
     dragAnchorIndex = -1;
     updateMultiSelectUI();
   };

   const toggleMultiSelectMode = () => {
     if (isMultiSelectMode) {
       exitMultiSelectMode();
     } else {
       enterMultiSelectMode();
       showToast("已进入多选模式：点击或拖拽滑动消息进行勾选");
     }
   };

   const applyRowRange = (fromIdx, toIdx, targetValue) => {
     const rows = getMessageRows();
     const start = Math.min(fromIdx, toIdx);
     const end = Math.max(fromIdx, toIdx);
     for (let i = start; i <= end; i++) {
       const id = rows[i]?.dataset.id;
       if (!id) continue;
       if (targetValue) {
         selectedMessageIds.add(id);
       } else {
         selectedMessageIds.delete(id);
       }
     }
     updateMultiSelectUI();
   };

    // 全局导入互斥锁与防重状态
    let isImportingInProgress = false;

    // 独立新建会话并导入团队上下文
    const importIntoNewThread = (content) => {
      const prevSelected = document.querySelector('[data-app-action-sidebar-thread-selected="true"]');
      const prevId = prevSelected?.getAttribute("data-app-action-sidebar-thread-id");
      createNewThreadAndLink();
      closePage();
      return safeInsertIntoComposer(content, 4500, { isNewThread: true, previousThreadId: prevId }).then((ok) => {
        if (ok) {
          showNativeAppToast("✓ 已新建对话并导入团队上下文！");
        } else {
          showNativeAppToast("⚠️ 新建会话导入超时，请检查输入框");
        }
        return ok;
      });
    };

    // 导入到当前已打开的对话输入框
    const importIntoCurrentThread = (content) => {
      closePage();
      return safeInsertIntoComposer(content, 2500).then((ok) => {
        if (ok) {
          showNativeAppToast("✓ 已将团队上下文导入当前对话输入框！");
        } else {
          showNativeAppToast("⚠️ 导入超时，请检查输入框");
        }
        return ok;
      });
    };

    // 切换到指定的已有会话并导入
    const importIntoSpecificThread = (thread, content) => {
      const currentSelected = document.querySelector('[data-app-action-sidebar-thread-selected="true"]');
      const currentId = currentSelected?.getAttribute("data-app-action-sidebar-thread-id");
      if (thread?.id && thread.id === currentId) {
        return importIntoCurrentThread(content);
      }
      triggerSidebarThreadClick(thread);
      closePage();
      return safeInsertIntoComposer(content, 4500, { expectedThreadId: thread?.id }).then((ok) => {
        if (ok) {
          const title = thread?.title ? thread.title.slice(0, 14) : "目标对话";
          showNativeAppToast(`✓ 已将团队上下文导入对话《${title}...》！`);
        } else {
          showNativeAppToast("⚠️ 切换对话导入超时，请检查目标对话输入框");
        }
        return ok;
      });
    };

    // 通用选择对话弹窗交互逻辑 (Share 时挑对话、Import 时挑对话)
    let currentThreadSelectConfig = null;

    const closeThreadSelectModal = () => {
      if (threadSelectModal) threadSelectModal.hidden = true;
      if (threadSelectList) threadSelectList.style.pointerEvents = "auto";
      currentThreadSelectConfig = null;
    };

    threadSelectClose?.addEventListener("click", closeThreadSelectModal);
    threadSelectModal?.addEventListener("click", (e) => {
      if (e.target === threadSelectModal) closeThreadSelectModal();
    });

    // 增强版：获取包含所属项目名称的所有会话列表 (基于当前侧边栏展开状态，不暴力展开用户目录)
    function listSidebarThreadsDetailed() {
      const folderEls = Array.from(document.querySelectorAll(".group\\/folder-row, button.group\\/section-toggle"));
      const detectedProjects = folderEls.map(el => (el.textContent || "").trim().split("\n")[0].trim()).filter(Boolean);
      if (!detectedProjects.includes("最近")) detectedProjects.push("最近");

      const allThreads = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-id]"));
      return allThreads.map((el) => {
        const id = el.getAttribute("data-app-action-sidebar-thread-id") || "";
        const title = (
          el.getAttribute("data-app-action-sidebar-thread-title") ||
          el.getAttribute("aria-label") ||
          el.textContent ||
          ""
        ).replace(/\s+/g, " ").trim();
        const selected = el.getAttribute("data-app-action-sidebar-thread-selected") === "true";

        // 向上查找所属的项目文件夹
        let project = "最近";
        let p = el;
        while (p && p !== document.body) {
          let s = p.previousElementSibling;
          while (s) {
            const text = (s.textContent || "").trim();
            for (const name of detectedProjects) {
              if (text.startsWith(name)) {
                project = name;
                break;
              }
            }
            if (project !== "最近") break;
            s = s.previousElementSibling;
          }
          if (project !== "最近") break;
          p = p.parentElement;
        }

        return { id, title, selected, project };
      }).filter((item) => item.id && item.title && item.title !== "true");
    }

    const openThreadSelectModal = ({ mode = "share", content = "" } = {}) => {
      if (!threadSelectModal) return;
      currentThreadSelectConfig = { mode, content };
      
      const isShare = mode === "share";
      if (threadSelectTitle) {
        threadSelectTitle.textContent = isShare ? "选择要分享的对话" : "选择要导入的目标对话";
      }
      if (threadSelectSubtitle) {
        threadSelectSubtitle.textContent = isShare 
          ? `将本地对话打包生成脱敏快照发布至团队空间 [${config.roomId || "Media"}]`
          : "选择将团队内容注入到哪个本地会话中继续推进工作";
      }
      if (threadSelectSearch) {
        threadSelectSearch.value = "";
        threadSelectSearch.placeholder = "搜索会话标题或所属项目...";
      }

      threadSelectModal.hidden = false;
      renderThreadSelectList();
      if (threadSelectSearch) {
        setTimeout(() => threadSelectSearch.focus(), 50);
      }
    };

    const renderThreadSelectList = () => {
      if (!threadSelectList) return;
      threadSelectList.innerHTML = "";
      const q = (threadSelectSearch?.value || "").trim().toLowerCase();
      const allThreads = listSidebarThreadsDetailed();
      const isShare = currentThreadSelectConfig?.mode === "share";

      // 过滤匹配 (支持同时搜索标题与所属项目)
      const filtered = allThreads.filter((t) => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      });

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "padding:28px 16px;text-align:center;color:var(--text-muted);font-size:12.5px;line-height:1.6;";
        empty.innerHTML = q 
          ? `未找到包含 "${escapeHtml(q)}" 的对话` 
          : `左侧栏暂无已展开的对话<br><span style="font-size:11px;opacity:0.75;margin-top:4px;display:inline-block;">请先在左侧栏展开目标项目，然后再次打开此弹窗</span>`;
        threadSelectList.appendChild(empty);
        return;
      }

      // 按项目分组组织数据
      const currentThreadObj = allThreads.find(t => t.selected);
      const currentProject = currentThreadObj?.project || "Media";

      const grouped = new Map();
      filtered.forEach(item => {
        const pName = item.project || "最近";
        if (!grouped.has(pName)) grouped.set(pName, []);
        grouped.get(pName).push(item);
      });

      // 排序分组：当前对话所属项目置顶，其次为其他项目，最后为“最近”
      const sortedGroupKeys = Array.from(grouped.keys()).sort((a, b) => {
        if (a === currentProject) return -1;
        if (b === currentProject) return 1;
        if (a === "最近") return 1;
        if (b === "最近") return -1;
        return a.localeCompare(b);
      });

      sortedGroupKeys.forEach(projKey => {
        const items = grouped.get(projKey) || [];
        if (!items.length) return;

        // 弱化极简分组分割头 (扁平清晰，不画树形折叠组件)
        const header = document.createElement("div");
        header.className = "thread-select-group-header";
        header.innerHTML = `
          <div class="thread-select-group-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>${escapeHtml(projKey)}</span>
            ${projKey === currentProject ? `<span style="font-size:10px;color:var(--accent-color);font-weight:500;">(当前项目)</span>` : ""}
          </div>
          <span class="thread-select-group-badge">${items.length} 个对话</span>
        `;
        threadSelectList.appendChild(header);

        items.forEach((thread) => {
          // 容器为纯 div 展示项，彻底废除整行点击与双击跳转，防止误触与数据丢失
          const item = document.createElement("div");
          item.className = `thread-select-item ${thread.selected ? "is-current" : ""}`;
          item.innerHTML = `
            <div class="thread-select-item-left">
              <span class="thread-select-item-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              <div class="thread-select-item-content">
                <div class="thread-select-item-title">${escapeHtml(thread.title)}</div>
              </div>
              <span class="thread-select-item-project">${escapeHtml(thread.project)}</span>
              ${thread.selected ? `<span class="thread-select-item-badge">当前对话</span>` : ""}
            </div>
            <button type="button" class="thread-select-item-action">${isShare ? "分享此对话" : "导入此处"}</button>
          `;

          // 事件严格且唯一绑定在右侧操作按钮上，整行文本与背景点击完全无副作用
          const actionBtn = item.querySelector(".thread-select-item-action");
          actionBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 模式 A：分享对话到 TeamCodex 团队空间（全屏页面常驻，绝不退出）
            if (isShare) {
              if (shareInFlight) return;
              actionBtn.disabled = true;
              actionBtn.textContent = "正在分享...";
              closeThreadSelectModal();
              window.__teamContextSilentSwitch = true;

              if (thread.selected) {
                shareCurrentThreadToTeam().finally(() => {
                  window.__teamContextSilentSwitch = false;
                });
              } else {
                showToast(`正在提取《${thread.title.slice(0, 12)}...》并分享至空间...`);
                triggerSidebarThreadClick(thread);
                linkedThread = thread;
                renderLink();

                const waitForThreadContentReady = async () => {
                  const getThreadSnippet = () => {
                    const nodes = Array.from(document.querySelectorAll(
                      "[data-markdown-text-tone='user-message'], [data-markdown-text-style='assistant-message'], article, [data-user-message-bubble], .bg-user-message"
                    ));
                    const firstText = (nodes[0]?.innerText || nodes[0]?.textContent || "").trim();
                    return { count: nodes.length, firstText: firstText.slice(0, 80) };
                  };

                  const before = getThreadSnippet();
                  const start = Date.now();

                  // 轮询等待新会话消息加载就绪
                  while (Date.now() - start < 3500) {
                    await new Promise((r) => setTimeout(r, 60));
                    const curSel = document.querySelector('[data-app-action-sidebar-thread-selected="true"]');
                    const curId = curSel?.getAttribute("data-app-action-sidebar-thread-id");
                    const isSidebarMatched = !thread.id || (curId && curId === thread.id);
                    const current = getThreadSnippet();

                    // 满足条件：侧栏选中已匹配且消息节点数大于0
                    if (isSidebarMatched && current.count > 0) {
                      // 确保内容不再是旧对话的残余（首句指纹变更或等待超过 800ms）
                      if (!before.count || before.firstText !== current.firstText || Date.now() - start > 800) {
                        await new Promise((r) => setTimeout(r, 150));
                        return true;
                      }
                    }
                  }
                  return false;
                };

                waitForThreadContentReady()
                  .then(() => shareCurrentThreadToTeam())
                  .catch((err) => {
                    console.warn("[TeamContext] share remote thread failed:", err);
                    showToast(`分享失败: ${err.message || "请求失败"}`);
                  })
                  .finally(() => {
                    window.__teamContextSilentSwitch = false;
                  });
              }
              return;
            }

            // 模式 B：导入团队内容到目标对话输入框并跳转原生工作区
            if (isImportingInProgress) return;
            isImportingInProgress = true;
            const contentToImport = (currentThreadSelectConfig?.content || "").trim();
            actionBtn.disabled = true;
            actionBtn.textContent = "正在导入...";
            if (threadSelectList) threadSelectList.style.pointerEvents = "none";
            closeThreadSelectModal();

            const importTask = thread.selected
              ? importIntoCurrentThread(contentToImport)
              : importIntoSpecificThread(thread, contentToImport);

            importTask.finally(() => {
              isImportingInProgress = false;
              if (threadSelectList) threadSelectList.style.pointerEvents = "auto";
            });
          });

          threadSelectList.appendChild(item);
        });
      });
    };

    threadSelectSearch?.addEventListener("input", renderThreadSelectList);

    // 导入消息主体选中的对话到当前 Codex 对话、指定对话或新对话
    const importSelectedMessagesToComposer = ({ mode = "current", newThread = false } = {}) => {
      if (!selectedMessageIds.size) {
        showToast("请先勾选需要导入的消息");
        return;
      }
      const allMsgs = lastSnapshot?.messages || [];
      const selected = allMsgs.filter((m) => selectedMessageIds.has(m.id));
      if (!selected.length) {
        showToast("未找到已选消息内容");
        return;
      }

      const count = selected.length;
      const lines = [];
      lines.push(`【导入团队空间 [${config.roomId || "Media"}] 的选定对话 (共 ${count} 条)】\n`);

      selected.forEach((msg, idx) => {
        const who = msg.actor_type === "human" ? (msg.actor_id || "用户") : (msg.actor_id || "Codex");
        const isSnapshot = msg.metadata?.kind === "codex_context_snapshot";
        const shareUrl = msg.metadata?.share_url ||
          (msg.content?.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;
        const title = msg.linked_thread?.title || "未命名对话";

        if (isSnapshot) {
          let block = `### 【导入团队对话《${title}》】(${who} 分享 · 第 ${idx + 1} 条)\n`;
          if (shareUrl) {
            block += `官方公开链接：${shareUrl}\n\n`;
          }
          const fullContent = msg.metadata?.full_markdown || msg.content || "";
          block += `#### 完整对话上下文记录：\n${fullContent}`;
          lines.push(block);
        } else {
          lines.push(`### ${who} · 第 ${idx + 1} 条\n\n${msg.content}`);
        }
      });

      lines.push("请结合以上团队分享的完整对话（可直接参考官方公开链接或上述完整记录），继续回答我的问题并推进当前工作。");
      const prompt = lines.join("\n\n").trim();

      exitMultiSelectMode();

      if (mode === "new" || newThread) {
        importIntoNewThread(prompt);
      } else if (mode === "select") {
        openThreadSelectModal({ mode: "import", content: prompt });
      } else {
        const cur = currentThread();
        importIntoCurrentThread(prompt);
        if (cur?.title) {
          showToast(`✓ 已将选中的团队内容注入到当前本地对话《${cur.title.slice(0, 10)}...》`);
        }
      }
    };

    const buildSnapshotImportBlock = (msg) => {
      if (!msg) return "";
      const rawTitle = msg.linked_thread?.title || "未命名对话";
      const title = rawTitle.replace(/\s*-\s*ChatGPT|\s*-\s*Codex/i, "").trim();
      const who = msg.actor_name || msg.actor_id || "团队成员";
      const shareUrl = msg.metadata?.share_url ||
        (msg.content?.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;
      const fullContent = msg.metadata?.full_markdown || msg.content || "";

      let block = `【导入团队分享的对话《${title}》】(来自 ${who})\n\n`;
      if (shareUrl) {
        block += `官方公开链接：${shareUrl}\n\n`;
      }
      block += `#### 完整对话上下文记录：\n${fullContent}\n\n`;
      block += `请结合以上团队分享的对话上下文，继续回答我的问题并推进当前工作。`;
      return block;
    };

    let currentViewingSnapshotMessage = null;
    let isSnapshotFullContentVisible = false;

    const openSnapshotDetailModal = (message) => {
      if (!snapshotDetailModal) return;
      currentViewingSnapshotMessage = message;
      
      const rawTitle = message.linked_thread?.title || "未命名对话";
      const title = rawTitle.replace(/\s*-\s*ChatGPT|\s*-\s*Codex/i, "").trim();
      const content = message.content || "";
      const capture = message.metadata?.capture || {};
      const count = Number(capture.message_count || 0) || 1;
      const shareUrl = message.metadata?.share_url ||
        ((content || "").match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;

      // 1. 设置主标题
      if (snapshotDetailTitle) {
        snapshotDetailTitle.textContent = `分享 ${title}`;
      }

      // 2. 提取用户首条提问内容作为高保真气泡预览 (100% 还原用户提问原文)
      let firstUserText = message.metadata?.first_user_prompt || "";
      if (!firstUserText) {
        const userMatch = content.match(/- \*\*用户\*\*[:：]\s*([\s\S]*?)(?=\n- \*\*Codex\*\*[:：]|$)/);
        if (userMatch && userMatch[1].trim()) {
          firstUserText = userMatch[1].trim();
        } else {
          const cleanLines = content.split("\n").filter(l => {
            const t = l.trim();
            return t && !t.startsWith("#") && !t.startsWith("http") && !t.startsWith("🔗") && !t.startsWith("本次分享来自") && !t.startsWith("快照编号") && !t.startsWith("团队快照") && !t.startsWith("官方公开链接") && !t.startsWith("- **Codex**");
          });
          firstUserText = cleanLines.slice(0, 4).join("\n") || "分享对话预览";
        }
      }

      if (snapshotNativeBubble) {
        snapshotNativeBubble.textContent = firstUserText;
      }

      // 3. 多模态缩略图与徽标
      const imgMatch = content.match(/!\[.*?\]\((blob:[^)]+|https?:\/\/[^)]+)\)/);
      const hasImage = Boolean(imgMatch || message.metadata?.image_url);
      if (hasImage && snapshotNativeThumb && snapshotNativeThumbWrap) {
        snapshotNativeThumb.src = imgMatch ? imgMatch[1] : message.metadata.image_url;
        snapshotNativeThumbWrap.style.display = "flex";
      } else if (snapshotNativeThumbWrap) {
        snapshotNativeThumbWrap.style.display = "none";
      }

      if (snapshotNativeBadgeRow) {
        if (hasImage) {
          snapshotNativeBadgeRow.style.display = "block";
          if (snapshotNativeBadge) snapshotNativeBadge.textContent = "已查看 1 张图像";
        } else {
          snapshotNativeBadgeRow.style.display = "none";
        }
      }

      // 4. 填充完整对话全文 (无论是否有公开外链，均可点击展开查看全部 N 条对话记录)
      const fullText = message.metadata?.full_markdown || content || "";
      if (snapshotDetailFullContent) {
        snapshotDetailFullContent.textContent = fullText;
        snapshotDetailFullContent.hidden = true;
      }
      if (snapshotDetailContextToggleText) {
        snapshotDetailContextToggleText.textContent = `展开查看完整对话记录 (${count} 条消息)`;
      }

      // 5. 根据是否有 shareUrl，自适应底部说明与按钮
      if (shareUrl) {
        if (snapshotDetailNativeOpen) snapshotDetailNativeOpen.style.display = "inline-flex";
        if (snapshotDetailFooterNote) snapshotDetailFooterNote.textContent = "任何拥有此链接的人都可以查看此聊天";
      } else {
        if (snapshotDetailNativeOpen) snapshotDetailNativeOpen.style.display = "none";
        if (snapshotDetailFooterNote) snapshotDetailFooterNote.textContent = "当前为团队本地数据快照，已完整保存至本空间";
      }

      // 6. 重置【复制链接】按钮状态
      if (snapshotDetailNativeCopyText) {
        snapshotDetailNativeCopyText.textContent = "复制链接";
      }

      snapshotDetailModal.hidden = false;
    };

    const closeSnapshotDetailModal = () => {
      if (snapshotDetailModal) snapshotDetailModal.hidden = true;
      currentViewingSnapshotMessage = null;
    };

   const closeContextSelectCard = () => {
      if (contextSelectModal) contextSelectModal.hidden = true;
      selectionMessages = [];
      selectionTitle = "当前对话";
      selectionThread = null;
      selectedContextIndexes.clear();
      selectionAnchorIndex = -1;
      selectionPointerActive = false;
      selectionDragged = false;
    };

    const updateContextSelectionUI = () => {
      const count = selectedContextIndexes.size;
      if (contextSelectCount) contextSelectCount.textContent = count ? `已选择 ${count} 条消息` : "尚未选择消息";
      if (contextMarkdownPreview) {
        const selected = selectionMessages.filter((_, index) => selectedContextIndexes.has(index));
        contextMarkdownPreview.textContent = selected.length ? formatContextMarkdown(selectionTitle, selectionThread, selected) : "请选择至少一条消息";
      }
      if (contextSelectCopy) contextSelectCopy.disabled = count === 0;
      if (contextSelectImport) contextSelectImport.disabled = count === 0;
      contextSelectList?.querySelectorAll(".context-message-option").forEach((row) => {
        const index = Number(row.dataset.index);
        row.dataset.selected = String(selectedContextIndexes.has(index));
        row.dataset.selectionActive = String(count > 0);
        const checkbox = row.querySelector(".context-select-checkbox");
        if (checkbox) checkbox.checked = selectedContextIndexes.has(index);
      });
    };

    const applyContextRange = (toIndex) => {
      if (selectionAnchorIndex < 0) return;
      const start = Math.min(selectionAnchorIndex, toIndex);
      const end = Math.max(selectionAnchorIndex, toIndex);
      for (let index = start; index <= end; index += 1) {
        if (selectionValue) selectedContextIndexes.add(index);
        else selectedContextIndexes.delete(index);
      }
      updateContextSelectionUI();
    };

    const renderContextSelectionList = () => {
      if (!contextSelectList) return;
      contextSelectList.innerHTML = "";
      if (!selectionMessages.length) {
        contextSelectList.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--text-muted);font-size:12px;">当前团队空间暂未读取到可导入的消息</div>`;
        updateContextSelectionUI();
        return;
      }
      selectionMessages.forEach((message, index) => {
        const row = document.createElement("div");
        row.className = "context-message-option";
        row.dataset.index = String(index);
        row.dataset.selected = "false";
        row.dataset.selectionActive = "false";
        row.innerHTML = `<input class="context-select-checkbox" type="checkbox" tabindex="-1" aria-hidden="true"><div><div class="context-message-meta"><span class="context-message-role">${escapeHtml(message.role)}</span><span>第 ${index + 1} 条</span></div><div class="context-message-text">${escapeHtml(message.text)}</div></div>`;
        row.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          selectionPointerActive = true;
          selectionDragged = false;
          selectionAnchorIndex = index;
          selectionValue = !selectedContextIndexes.has(index);
          applyContextRange(index);
          event.preventDefault();
        });
        row.addEventListener("pointerenter", () => {
          if (!selectionPointerActive) return;
          selectionDragged = true;
          applyContextRange(index);
        });
        contextSelectList.appendChild(row);
      });
      updateContextSelectionUI();
    };

    const extractTeamContextMessages = () => {
      const messages = (lastSnapshot.messages || [])
        .map((message, index) => ({
          index,
          role: message.metadata?.kind === "codex_context_snapshot"
            ? "Codex 上下文快照"
            : (message.actor_type === "human" ? (message.actor_id || "成员") : (message.actor_id || "Codex")),
          text: String(message.content || "").trim(),
        }))
        .filter((message) => message.text.length > 0);
      return {
        title: `团队空间 [${config.roomId || "Media"}]`,
        thread: linkedThread || currentThread(),
        messages,
      };
    };

   const openImportSelectCard = () => {
     toggleMultiSelectMode();
   };
   const _legacyOpenImportSelectCard = () => {
     const extracted = extractTeamContextMessages();
     selectionTitle = extracted.title;
      selectionThread = extracted.thread;
      selectionMessages = extracted.messages;
      selectedContextIndexes.clear();
      selectionAnchorIndex = -1;
      selectionPointerActive = false;
      selectionDragged = false;
      if (contextSelectModal) contextSelectModal.hidden = false;
      renderContextSelectionList();
    };

    // 每个会话专属的公开分享链接独立缓存，杜绝跨会话串味与污染
    const threadShareUrlCache = new Map();

    // 异步生成并获取 OpenAI / Codex 原生公开分享链接 (https://chatgpt.com/s/cx_...)
    const obtainNativeShareUrl = async (targetThread = null) => {
      const threadKey = targetThread?.id || targetThread?.title || linkedThread?.id || linkedThread?.title;
      if (threadKey && threadShareUrlCache.has(threadKey)) {
        return threadShareUrlCache.get(threadKey);
      }

      const readClipboardSafe = async () => {
        try {
          if (navigator.clipboard?.readText) {
            const clip = await navigator.clipboard.readText();
            const m = String(clip || "").match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/);
            if (m) return m[0];
          }
        } catch {}
        return null;
      };

      // 自动化触发官方原生分享与复制流程
      try {
        const shareBtn = Array.from(document.querySelectorAll("button")).find(b =>
          b.innerText?.trim() === "分享" || b.getAttribute("aria-label") === "分享"
        );
        if (!shareBtn) return null;

        let dialog = document.querySelector("div[role='dialog'].codex-dialog");
        if (!dialog) {
          shareBtn.click();
        }

        // 轮询等待后台生成完毕，最长等待 3200ms，避免全屏下卡死
        const start = Date.now();
        while (Date.now() - start < 3200) {
          await new Promise(r => setTimeout(r, 120));
          dialog = document.querySelector("div[role='dialog'].codex-dialog");
          if (!dialog) continue;

          const copyBtn = Array.from(dialog.querySelectorAll("button")).find(b => b.innerText?.trim() === "复制链接");
          if (copyBtn && !copyBtn.disabled) {
            // 调用 HTML5 标准 requestSubmit 精准触发原生生成与剪贴板写入
            const form = dialog.querySelector("form");
            if (form && typeof form.requestSubmit === "function") {
              form.requestSubmit(copyBtn);
            } else {
              copyBtn.click();
            }

            // 循环多读几次剪贴板（重试4次，每次间隔120ms），防系统异步延迟丢失
            for (let retry = 0; retry < 4; retry++) {
              await new Promise(r => setTimeout(r, 120));
              const generated = await readClipboardSafe();
              if (generated) {
                // 关闭原生弹窗
                const closeBtn = dialog.querySelector("button[aria-label='关闭对话框']") ||
                  Array.from(dialog.querySelectorAll("button")).find(b => b.innerText?.trim() === "关闭对话框");
                if (closeBtn) closeBtn.click();
                if (threadKey) threadShareUrlCache.set(threadKey, generated);
                return generated;
              }
            }
            break;
          }
        }
      } catch (e) {
        console.warn("[TeamContext] obtainNativeShareUrl error:", e);
      }
      return null;
    };

    // 默认将当前本地对话完整内容分享到公共团队空间
    let shareInFlight = false;
    const shareCurrentThreadToTeam = async () => {
      if (shareInFlight) return;
      const extracted = extractLocalThreadMessages();
      const selectedMessages = extracted.messages;
      if (!selectedMessages.length) {
        showToast("当前本地对话暂未读取到可分享的消息");
        return;
      }
      shareInFlight = true;
      const shareButtons = [root.getElementById("share-thread"), root.getElementById("btn-share-empty")].filter(Boolean);
      shareButtons.forEach((button) => { button.disabled = true; });

      const title = extracted.title;
      const thread = extracted.thread;
      const snapshotId = `snapshot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      if (thread) linkedThread = thread;
      renderLink(true);

      let shareUrl = extracted.shareUrl || null;
      if (!shareUrl) {
        showToast("⏳ 正在获取/生成官方原生公开分享链接...");
        shareUrl = await obtainNativeShareUrl(thread);
      }

      // 组装全量轮次的 Markdown 完整上下文记录
      const fullMarkdown = selectedMessages.map((m) => `- **${m.role}**:\n${m.text}`).join("\n\n");

      const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname) : { nickname: config.nickname, memberId: config.nickname };
      const myMemberId = config.memberId || devUser.memberId;
      const myMemberName = config.nickname || devUser.nickname;
      const currentActor = members.find((m) => m.id === actorId);
      const sendActorId = actorId || myMemberId;
      const sendActorName = currentActor?.name || (sendActorId === myMemberId ? myMemberName : (currentActor?.id || myMemberName));

      const payload = {
        content: formatContextMarkdown(title, null, selectedMessages, "", snapshotId, shareUrl),
        actor_type: actorType,
        actor_id: sendActorId,
        actor_name: sendActorName,
        client_message_id: `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        linked_thread: { id: snapshotId, title },
        metadata: {
          kind: "codex_context_snapshot",
          snapshot_id: snapshotId,
          share_url: shareUrl || null,
          full_markdown: fullMarkdown,
          first_user_prompt: extracted.firstUserPrompt || null,
          image_url: extracted.imageUrl || null,
          image_count: extracted.imageCount || 0,
          version: 1,
          scope: "user_visible_thread",
          capture: extracted.capture,
          context_window_included: false,
          hidden_reasoning_included: false,
          tool_io_included: false,
        },
      };

      // 1. 移除空状态卡片
      const emptyEl = messagesEl.querySelector(".room-empty-state");
      if (emptyEl) emptyEl.remove();

      try {
        // api() 已经包含原生桥接与 pendingCalls 兜底，只保留这一条发送路径。
        const message = await api("/api/messages", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        // SSE 可能先返回同一条消息，knownIds 会负责去重。
        renderMessage(message);
        const shareToast = shareUrl
          ? `✓ 已将对话《${title.slice(0, 16)}...》的原生官方分享发布到本空间！`
          : (extracted.capture.has_codex_response
            ? `✓ 已将对话《${title.slice(0, 16)}...》的内容分享到本空间！`
            : "已分享可见内容，但未检测到 Codex 回复；请等回复完成后再分享");
        showToast(shareToast);
      } catch (err) {
        console.log("[TeamContext] share message failed:", err);
        showToast(`分享失败: ${err.message || "请求失败"}`);
      } finally {
        shareInFlight = false;
        shareButtons.forEach((button) => { button.disabled = false; });
      }
    };

   // 选择团队空间消息后导入自己的当前 Codex 对话
   const importSelectedContextToMyAi = () => {
     if (selectedMessageIds.size > 0) {
       importSelectedMessagesToComposer();
       return;
     }
     const selected = selectionMessages.filter((_, index) => selectedContextIndexes.has(index));
      if (!selected.length) {
        showToast("请先选择至少一条团队消息");
        return;
      }
      const thread = selectionThread || linkedThread || currentThread();
      const markdown = formatContextMarkdown(
        selectionTitle,
        thread,
        selected,
        "以下内容来自团队协作空间的选定消息。"
      );
      const prompt = `【导入团队空间 [${config.roomId}] 的选定对话】\n\n${markdown}\n\n请结合以上选定的团队讨论继续回答我的问题，并推进当前任务。`;
      if (thread?.id) openCodexThread(thread);
      else closePage();
      closeContextSelectCard();

      window.setTimeout(() => {
        insertIntoComposer(prompt);
        showToast("✓ 已将选定团队消息导入当前对话输入框！");
      }, 500);
    };

    // 团队成员渲染：纯圆头像叠加 (Avatar Stack)，区分常驻 AI 与在线人类成员（绿色在线小圆点）
    let lastPeopleKey = "";
    const renderPeople = (force = false) => {
      const activeIdsList = Array.from(activeMemberIds).sort().join(",");
      const currentKey = JSON.stringify({
        room: config.roomId,
        actor: actorId,
        members: members.map((m) => `${m.id}:${m.name}:${m.role}:${m.title}`),
        actives: activeIdsList,
        status: connState.status,
      });
      if (!force && currentKey === lastPeopleKey && peopleEl.children.length > 0) {
        return; // 数据完全一致，绝不摧毁 DOM，消除闪烁
      }
      lastPeopleKey = currentKey;

      peopleEl.innerHTML = "";

      const stackEl = document.createElement("div");
      stackEl.className = "avatar-stack";

      // 成员排序：纯粹展示真实在线协同设备 [weijia (Mac)] [weijia (Win)]，彻底剔除虚假 AI 角色
      const realMembers = members.filter((m) => m && m.id !== "codex" && m.role !== "ai");
      const sortedMembers = [...realMembers].sort((a, b) => {
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
      });

      sortedMembers.forEach((member, index) => {
        const avatarBtn = document.createElement("button");
        avatarBtn.type = "button";
        const mySelfId = config.memberId || (typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname).memberId : config.nickname);
        const isCurrent = member.id === actorId;
        const isSelf = member.id === mySelfId;
        const isOnline = activeMemberIds.has(member.id) || (isSelf && connState.status === "connected");
        const isMac = member.id.endsWith("_mac") || (member.name && member.name.includes("(Mac)"));
        const isWin = member.id.endsWith("_win") || (member.name && member.name.includes("(Win)"));

        const deviceClass = isMac ? "is-mac" : (isWin ? "is-win" : "");
        avatarBtn.className = `stack-avatar is-human ${deviceClass} ${isCurrent ? "is-active" : ""} ${isOnline ? "is-online" : ""}`;
        avatarBtn.style.zIndex = String(sortedMembers.length - index);

        const roleDesc = isCurrent ? "你 (当前设备发言身份)" : (member.title || (isMac ? "Mac 协同节点" : (isWin ? "Windows 协同节点" : "成员")));
        const statusDesc = isOnline ? "在线" : "离线";
        const initial = (member.name || "?").slice(0, 1).toUpperCase();

        if (isMac) {
          avatarBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
        } else if (isWin) {
          avatarBtn.innerHTML = `<svg viewBox="0 0 24 24" width="10.5" height="10.5" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>`;
        } else {
          avatarBtn.textContent = initial;
        }

        // 挂载 M / W 专属设备标牌徽章（保持 DOM 节点存在以 100% 兼容既有单元测试断言）
        if (isMac || isWin) {
          const badge = document.createElement("span");
          badge.className = `stack-device-badge ${isMac ? "badge-mac" : "badge-win"}`;
          badge.textContent = isMac ? "M" : "W";
          avatarBtn.appendChild(badge);
        }

        avatarBtn.title = `${member.name} (${roleDesc} · ${statusDesc} · 点击切换)`;

        if (isOnline) {
          const dot = document.createElement("span");
          dot.className = "stack-online-dot";
          avatarBtn.appendChild(dot);
        }

        avatarBtn.addEventListener("click", () => {
          actorId = member.id;
          actorType = "human";
          renderPeople(true);
          showToast(`已切换当前协同身份为: ${member.name}`);
        });

        stackEl.appendChild(avatarBtn);
      });

      peopleEl.appendChild(stackEl);

      // 圆形邀请按钮：与头像规格统一，彻底无方形
      const inviteBtn = document.createElement("button");
      inviteBtn.className = "stack-invite-btn";
      inviteBtn.type = "button";
      const roomDisplay = config.roomId || "Media";
      inviteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      inviteBtn.title = `邀请成员加入空间 ${roomDisplay} (点击复制接入信息)`;

      inviteBtn.addEventListener("click", () => {
        const inviteText = `Hub: ${config.hubUrl} | Room: ${config.roomId}${config.roomKey ? ` | Key: ${config.roomKey}` : ""}`;
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(inviteText);
        }
        inviteBtn.classList.add("is-copied");
        inviteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`;
        showToast(`已复制空间 [${roomDisplay}] 的接入信息`);
        setTimeout(() => {
          inviteBtn.classList.remove("is-copied");
          inviteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        }, 2000);
      });

      peopleEl.appendChild(inviteBtn);
    };

    // 对话与空间上下文渲染：极简纯文本面包屑，无按钮外壳，无生硬用词
    let lastLinkKey = "";
    const renderLink = (force = false) => {
      const thread = linkedThread || currentThread();
      const currentKey = JSON.stringify({
        threadId: thread?.id,
        threadTitle: thread?.title,
        roomId: config.roomId,
      });
      if (!force && currentKey === lastLinkKey && linkRow.children.length > 0) {
        return; // 对话无变动，不重绘 DOM
      }
      lastLinkKey = currentKey;

      const roomName = escapeHtml(config.roomId || "Media");
      const titleText = thread?.title ? escapeHtml(thread.title) : "未关联本地对话";

      linkRow.innerHTML = `
        <span class="context-room-badge" title="当前空间: ${roomName}">${roomName}</span>
        <span class="context-divider">/</span>
        <span class="context-thread-meta">
          <svg class="context-thread-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="context-thread-title" title="${titleText}">${titleText}</span>
        </span>
      `;
    };

    const createNewThreadAndLink = () => {
      const roomName = config.roomId || "Media";
      const candidates = Array.from(document.querySelectorAll("button"));

      // 1. 优先找当前项目专属的“在 [roomName] 中开始新聊天”
      let targetBtn = candidates.find((b) => {
        const aria = b.getAttribute("aria-label") || "";
        return aria.includes(`在 ${roomName} 中开始新聊天`) || aria.includes(`in ${roomName}`);
      });

      // 2. 备选通用“新对话”按钮
      if (!targetBtn) {
        targetBtn = candidates.find((b) => {
          const text = (b.innerText || "").trim();
          const aria = b.getAttribute("aria-label") || "";
          return text === "新对话" || aria === "新对话" || aria === "New chat";
        });
      }

      if (targetBtn) {
        targetBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        targetBtn.click();
      }

      hidePicker();

      // 稍候捕获并关联新会话
      window.setTimeout(() => {
        const allThreads = listSidebarThreads();
        const active = allThreads.find((t) => t.selected) || allThreads[0];
        if (active) {
          linkedThread = active;
        } else {
          linkedThread = { id: `thread-${Date.now()}`, title: `新建对话 (${roomName})`, selected: true };
        }
        renderLink(true);
        window.__teamContextPendingContext = { linked_thread: linkedThread };
        showToast(`已新建对话并关联到空间 [${roomName}]`);
      }, 400);
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const rowScrollTop = (row) => {
      const messagesRect = messagesEl.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return messagesEl.scrollTop + rowRect.top - messagesRect.top;
    };

    const scrollToMessage = (row, instant = false) => {
      if (!row || !messagesEl) return;
      const target = rowScrollTop(row) - (messagesEl.clientHeight - row.offsetHeight) / 2;
      const maxScroll = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
      const top = clamp(target, 0, maxScroll);
      const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const behavior = instant || prefersReduced ? "auto" : "smooth";
      try {
        if (typeof messagesEl.scrollTo === "function") messagesEl.scrollTo({ top, behavior });
        else messagesEl.scrollTop = top;
      } catch {
        messagesEl.scrollTop = top;
      }
    };

    let minimapItems = [];
    let isScrubbing = false;

    const rebuildMinimap = () => {
      const stack = root.getElementById("minimap");
      const tip = root.getElementById("tip");
      stack.innerHTML = "";
      minimapItems = [];
      const rows = [...messagesEl.querySelectorAll(".row")];

      rows.forEach((row, index) => {
        const bubble = row.querySelector(".bubble");
        const text = (bubble?.textContent || "").replace(/\s+/g, " ").trim();
        const who = row.querySelector(".who")?.textContent || (row.classList.contains("human") ? "人工意见" : "Codex");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nav-item-btn";
        btn.dataset.id = row.dataset.id || String(index);
        btn.dataset.index = String(index);
        btn.setAttribute("aria-label", `跳转到消息 ${index + 1}：${who} - ${text.slice(0, 30)}`);

        const wrap = document.createElement("span");
        wrap.className = "nav-item-wrap";
        const marker = document.createElement("span");
        marker.className = "_Marker";
        const line = document.createElement("span");
        line.className = "_MarkerLine";

        marker.appendChild(line);
        wrap.appendChild(marker);
        btn.appendChild(wrap);

        btn.addEventListener("click", () => {
          if (isScrubbing) return;
          scrollToMessage(row, false);
        });

        stack.appendChild(btn);
        minimapItems.push({ row, btn, who, text, index });
      });

      const updatePreview = (item) => {
        if (!item || !tip) return;
        const box = item.btn.getBoundingClientRect();
        tip.innerHTML = `<div class="preview-title">${escapeHtml(item.who)}</div><div class="preview-body">${escapeHtml(item.text || "（空内容）")}</div>`;
        tip.style.left = `${box.right + 12}px`;
        const tipHeight = tip.offsetHeight || 60;
        const desiredTop = box.top + box.height / 2 - tipHeight / 2;
        tip.style.top = `${clamp(desiredTop, 16, window.innerHeight - tipHeight - 16)}px`;
        if (tip.hidden) {
          tip.hidden = false;
          tip.classList.remove("pop-in");
          void tip.offsetWidth;
          tip.classList.add("pop-in");
        }
      };

      const setScrubTargetIndex = (targetIdx) => {
        minimapItems.forEach((item, i) => {
          if (i === targetIdx) {
            item.btn.setAttribute("data-scrub-target", "true");
          } else {
            item.btn.removeAttribute("data-scrub-target");
          }
        });
      };

      const clearScrubTarget = () => {
        minimapItems.forEach((item) => {
          item.btn.removeAttribute("data-scrub-target");
        });
      };

      const findNearestIndex = (clientY) => {
        if (minimapItems.length === 0) return -1;
        let nearestIdx = 0;
        let minDist = Infinity;
        minimapItems.forEach((item, i) => {
          const rect = item.btn.getBoundingClientRect();
          const center = rect.top + rect.height / 2;
          const dist = Math.abs(center - clientY);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        });
        return nearestIdx;
      };

      // 统一绑定事件在容器上，支持按住拖拽滑动（Scrubbing）与悬停滑动波浪
      stack.onpointerdown = (e) => {
        if (e.button !== 0 || minimapItems.length === 0) return;
        isScrubbing = true;
        stack.dataset.scrubbing = "true";
        try { stack.setPointerCapture(e.pointerId); } catch {}
        const idx = findNearestIndex(e.clientY);
        if (idx >= 0) {
          setScrubTargetIndex(idx);
          updatePreview(minimapItems[idx]);
          scrollToMessage(minimapItems[idx].row, true);
        }
        e.preventDefault();
      };

      stack.onpointermove = (e) => {
        if (minimapItems.length === 0) return;
        if (isScrubbing) {
          if (e.buttons === 0) {
            finishScrubbing(e);
            return;
          }
          const idx = findNearestIndex(e.clientY);
          if (idx >= 0) {
            setScrubTargetIndex(idx);
            updatePreview(minimapItems[idx]);
            scrollToMessage(minimapItems[idx].row, true);
          }
          return;
        }
        // 纯悬停滑动
        const idx = findNearestIndex(e.clientY);
        if (idx >= 0) {
          updatePreview(minimapItems[idx]);
        }
      };

      const finishScrubbing = (e) => {
        if (!isScrubbing) return;
        isScrubbing = false;
        delete stack.dataset.scrubbing;
        try { stack.releasePointerCapture(e.pointerId); } catch {}
        clearScrubTarget();
        syncMinimap();
        const rect = stack.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          if (tip) {
            tip.hidden = true;
            tip.classList.remove("pop-in");
          }
        }
      };

      stack.onpointerup = finishScrubbing;
      stack.onpointercancel = finishScrubbing;

      stack.onpointerleave = (e) => {
        if (!isScrubbing) {
          clearScrubTarget();
          if (tip) {
            tip.hidden = true;
            tip.classList.remove("pop-in");
          }
        }
      };

      syncMinimap();
      scheduleMinimapSync();
    };

    const syncMinimap = () => {
      const stack = root.getElementById("minimap");
      const btns = [...stack.querySelectorAll(".nav-item-btn")];
      const rows = [...messagesEl.querySelectorAll(".row")];
      const maxScroll = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
      const shouldShow = rows.length >= 2 && maxScroll > 10;
      minimapPanel.hidden = !shouldShow;
      if (!shouldShow || btns.length === 0) return;

      const viewportCenter = messagesEl.scrollTop + messagesEl.clientHeight / 2;
      let activeIndex = 0;
      let minDistance = Infinity;

      rows.forEach((row, idx) => {
        const rowTop = rowScrollTop(row);
        const rowCenter = rowTop + row.offsetHeight / 2;
        const dist = Math.abs(rowCenter - viewportCenter);
        if (dist < minDistance) {
          minDistance = dist;
          activeIndex = idx;
        }
      });

      btns.forEach((btn, i) => {
        btn.setAttribute("aria-current", i === activeIndex ? "true" : "false");
      });
    };

   const renderMessage = (message) => {
     if (!message?.id || knownIds.has(message.id)) return;
     knownIds.add(message.id);

     const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname) : { nickname: config.nickname, memberId: config.nickname };
     const myMemberId = String(config.memberId || devUser.memberId || "").trim().toLowerCase();
     const myNickname = String(config.nickname || devUser.nickname || "").trim().toLowerCase();

     const senderId = String(message.actor_id || "").trim().toLowerCase();
     const senderName = String(message.actor_name || "").trim().toLowerCase();

     // 判定是否为当前本地设备发出的消息：只认精确 memberId / 昵称，禁止用裸 weijia 把对端消息画成自己
     let isMe = false;
     if (senderId && myMemberId && senderId === myMemberId) {
       isMe = true;
     } else if (senderName && myNickname && senderName === myNickname) {
       isMe = true;
     }

     const row = document.createElement("div");
     const alignClass = isMe ? "is-me outgoing" : "is-peer incoming";
     row.className = `row ${alignClass}`;
     row.dataset.id = message.id;
     row.dataset.selected = String(selectedMessageIds.has(message.id));

     const found = members.find((m) => m.id === message.actor_id);
     let who = message.actor_name || found?.name || message.actor_id || "团队成员";
     const isMacSender = senderId.endsWith("_mac") || who.includes("(Mac)");
     const isWinSender = senderId.endsWith("_win") || who.includes("(Win)");

     let contentText = (message.content || "").trim();
     if (contentText === "@" && message.linked_thread?.title) {
       contentText = "";
     }

     const stack = document.createElement("div");
     stack.className = "stack";

     const isSnapshot = message.metadata?.kind === "codex_context_snapshot";
     if (isSnapshot) {
       row.classList.add("context-snapshot-card");
       const snapTitle = message.linked_thread?.title || "未命名对话快照";
       const snapId = message.metadata?.snapshot_id || message.linked_thread?.id || "快照";
       const capture = message.metadata?.capture || {};
       const msgCount = Number(capture.message_count || 0);
       const hasCodex = Boolean(capture.has_codex_response);
       const modelLabel = capture.model_label ? ` · ${escapeHtml(capture.model_label)}` : "";
       const snapMarkdown = String(message.metadata?.full_markdown || contentText || "");

        // 提取第一条提问内容作为气泡卡片预览
        let previewText = (message.metadata?.first_user_prompt || "").trim();
        if (!previewText) {
          const userMatch = contentText.match(/- \*\*用户\*\*[:：]\s*([\s\S]*?)(?=\n- \*\*Codex\*\*[:：]|$)/);
          if (userMatch && userMatch[1].trim()) {
            previewText = userMatch[1].trim();
          } else {
            const cleanLines = snapMarkdown.split("\n").filter(l => {
              const t = l.trim();
              return t && !t.startsWith("#") && !t.startsWith("http") && !t.startsWith("🔗") && !t.startsWith("本次分享来自") && !t.startsWith("快照编号") && !t.startsWith("团队快照") && !t.startsWith("官方公开链接") && !t.startsWith("- **Codex**");
            });
            previewText = cleanLines.slice(0, 3).join("\n") || snapMarkdown.slice(0, 160);
          }
        }

        // 如果提问过短（如单个字母 "n"、单字等），结合 Codex 回复呈现完整问答语境，杜绝突兀单字
        if (previewText.length <= 3) {
          const fullText = message.metadata?.full_markdown || contentText;
          const codexMatch = fullText.match(/- \*\*Codex\*\*[:：]\s*([\s\S]*?)(?=\n- \*\*用户\*\*[:：]|$)/);
          const replySnippet = codexMatch ? codexMatch[1].trim().split("\n")[0].slice(0, 60) : "";
          if (replySnippet) {
            previewText = previewText ? `用户: ${previewText} ｜ 回复: ${replySnippet}` : replySnippet;
          }
        }

        const shareLink = message.metadata?.share_url ||
          ((contentText || "").match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;

        const copyLinkBtn = shareLink
          ? `<button class="snapshot-open-link card-copy-link" type="button" title="复制官方分享链接">
               <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.69541 6.25121C3.89761 6.04427 4.22909 6.03985 4.43662 6.24145C4.64426 6.44372 4.64953 6.77691 4.44736 6.98461L3.61338 7.84008L3.6085 7.84496C2.42952 9.02432 2.40771 10.9534 3.72666 12.2727C5.04612 13.5922 6.97593 13.5702 8.15537 12.3909L8.16025 12.386L9.01572 11.553C9.22335 11.3509 9.55562 11.3553 9.75791 11.5627C9.96017 11.7704 9.9566 12.1036 9.74912 12.3059L8.89365 13.1389C7.28179 14.7455 4.68893 14.7213 2.9835 13.0159C1.27845 11.3104 1.25498 8.71842 2.86143 7.10668L3.69541 6.25121Z"></path><path d="M9.629 5.62914C9.83403 5.42415 10.1662 5.42413 10.3712 5.62914C10.5761 5.83417 10.5761 6.16634 10.3712 6.37133L6.37119 10.3713C6.16621 10.5763 5.83404 10.5762 5.629 10.3713C5.42398 10.1663 5.42398 9.83417 5.629 9.62914L9.629 5.62914Z"></path><path d="M7.10654 2.86157C8.71829 1.25511 11.3103 1.27855 13.0157 2.98364C14.7212 4.68907 14.7453 7.28193 13.1388 8.89379L12.3058 9.74926C12.1034 9.95672 11.7702 9.96029 11.5626 9.75805C11.3552 9.55576 11.3507 9.22349 11.5528 9.01586L12.3858 8.16039L12.3907 8.15551C13.5701 6.97606 13.592 5.04626 12.2726 3.7268C10.9532 2.40781 9.02419 2.42965 7.84482 3.60864L7.83994 3.61352L6.98447 4.4475C6.77678 4.64965 6.44358 4.64438 6.24131 4.43676C6.03972 4.22923 6.04415 3.89775 6.25107 3.69555L7.10654 2.86157Z"></path></svg>
               <span>复制链接</span>
             </button>`
          : "";

        const shareLinkBtn = shareLink
          ? `<button class="snapshot-open-link web-link" type="button" data-url="${escapeHtml(shareLink)}" href="${escapeHtml(shareLink)}" title="在系统浏览器中打开此官方分享">
               <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               <span>网页打开</span>
             </button>`
          : "";

        const badgeHtml = shareLink
          ? `<span style="color:var(--accent-color);font-weight:600;">官方原生分享</span> · ${msgCount} 条对话${hasCodex ? " (含 Codex 回复)" : ""}${modelLabel}`
          : `<span>对话分享 · ${msgCount} 条${hasCodex ? " (含 Codex 回复)" : ""}${modelLabel}</span>`;

        stack.innerHTML = `
          <div class="who">${escapeHtml(who)}</div>
          <div class="snapshot-card-container">
            <div class="snapshot-card-header">
              <div class="snapshot-card-badge">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                ${badgeHtml}
              </div>
            </div>
            <div class="snapshot-card-title">${escapeHtml(snapTitle)}</div>
            <div class="snapshot-card-preview">${escapeHtml(previewText)}</div>
            <div class="snapshot-card-footer">
              ${copyLinkBtn}
              ${shareLinkBtn}
              <button class="snapshot-open-link card-detail-link" type="button" title="打开官方原生弹窗查看详情">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>查看详情</span>
              </button>
            </div>
          </div>
        `;

        const openBtn = stack.querySelector(".card-detail-link");
        openBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          openSnapshotDetailModal(message);
        });

        // 绑定【网页打开 ↗】点击事件，调用系统浏览器打开外链
        const webLinkBtn = stack.querySelector(".web-link");
        webLinkBtn?.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openExternalUrl(shareLink);
        });

        // 点击卡片主体亦可直接唤起官方原生分享详情 (多选勾选时不弹出弹层)
        const cardContainer = stack.querySelector(".snapshot-card-container");
        cardContainer?.addEventListener("click", (e) => {
          if (isMultiSelectMode) return;
          if (e.target.closest(".snapshot-open-link")) return;
          openSnapshotDetailModal(message);
        });

        const cardCopyBtn = stack.querySelector(".card-copy-link");
        cardCopyBtn?.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (shareLink && navigator.clipboard?.writeText) {
            try {
              await navigator.clipboard.writeText(shareLink);
              showToast("✓ 已复制链接");
            } catch (err) {
              showToast(`复制失败: ${err.message}`);
            }
          }
        });
     } else {
       const ref = message.linked_thread?.title ? `<div class="ref">来自对话：${escapeHtml(message.linked_thread.title)}</div>` : "";
       let imagesHtml = "";
       if (Array.isArray(message.metadata?.images) && message.metadata.images.length > 0) {
         imagesHtml = message.metadata.images.map((img) => {
           const resolvedSrc = resolveImageUrl(img);
           const imgAlt = img.name || "图片";
           return `<div class="msg-image-wrap" data-img-src="${escapeHtml(resolvedSrc)}" title="点击查看原图"><img class="msg-chat-image" src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(imgAlt)}" loading="lazy" /></div>`;
         }).join("");
       }

       let textBody = "";
       if (contentText && contentText !== "[图片]") {
         textBody = `<div class="bubble">${escapeHtml(contentText)}${ref}</div>`;
       } else if (!imagesHtml) {
         textBody = `<div class="bubble">${escapeHtml(contentText || "")}${ref}</div>`;
       } else if (ref) {
         textBody = `<div class="bubble" style="padding:4px 8px;">${ref}</div>`;
       }

       stack.innerHTML = `<div class="who">${escapeHtml(who)}</div>${textBody}${imagesHtml}`;

       stack.querySelectorAll(".msg-image-wrap").forEach((wrap) => {
         wrap.addEventListener("click", (e) => {
           if (isMultiSelectMode) return;
           e.stopPropagation();
           const src = wrap.dataset.imgSrc;
           if (src) openImageLightbox(src);
         });
       });
     }

     // 微信式复选圆圈：左侧消息（对方发来的）在左边外侧，右侧消息（我发出的）在右边外侧
     const checkEl = document.createElement("div");
     checkEl.className = "msg-select-check";
     checkEl.setAttribute("aria-hidden", "true");
     checkEl.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
     checkEl.addEventListener("click", (e) => {
       e.stopPropagation();
       toggleMessageSelection(message.id);
     });

     if (isMe) {
       row.appendChild(stack);
       row.appendChild(checkEl);
     } else {
       row.appendChild(checkEl);
       row.appendChild(stack);
     }

     // 单击消息行：在多选模式下切换勾选状态
     row.addEventListener("click", (e) => {
       if (!isMultiSelectMode) return;
       if (e.target.closest(".snapshot-open-link, .ref")) return;
       toggleMessageSelection(message.id);
     });

     // 拖拽多选范围
     row.addEventListener("pointerdown", (e) => {
       if (e.button !== 0) return;
       if (e.target.closest(".snapshot-open-link, .ref")) return;
       const rows = getMessageRows();
       const myIdx = rows.indexOf(row);
       if (myIdx === -1) return;
       pointerDragging = true;
       dragAnchorIndex = myIdx;
       dragTargetValue = !selectedMessageIds.has(message.id);
     });

     row.addEventListener("pointerenter", () => {
       if (!pointerDragging) return;
       const rows = getMessageRows();
       const myIdx = rows.indexOf(row);
       if (myIdx === -1 || dragAnchorIndex === -1) return;
       if (!isMultiSelectMode) {
         enterMultiSelectMode();
       }
       applyRowRange(dragAnchorIndex, myIdx, dragTargetValue);
     });

     messagesEl.appendChild(row);
     messagesEl.scrollTop = messagesEl.scrollHeight;
     if (Number(message.seq || 0) > Number(lastSnapshot?.seq || 0)) {
       lastSnapshot = { ...(lastSnapshot || {}), seq: Number(message.seq) };
     }
     rebuildMinimap();
     syncMinimap();
   };

    let activeRenderedRoomId = null;
    const apply = (data) => {
      if (!data) return;
      lastSnapshot = data;
      const targetRoomId = data.room?.id || config.roomId || "Media";

      // 关键：空间切换与新建空间时，必须清空上一空间的全部历史消息
      if (activeRenderedRoomId !== targetRoomId) {
        activeRenderedRoomId = targetRoomId;
        messagesEl.innerHTML = "";
        knownIds.clear();
        linkedThread = data.linked_thread || null;
        lastPeopleKey = "";
        lastLinkKey = "";
      }

      if (Array.isArray(data.active_members)) {
        activeMemberIds = new Set(data.active_members);
      }
      if (Array.isArray(data.members) && data.members.length) members = data.members;
      if (data.linked_thread) linkedThread = data.linked_thread;
      if (typeof data.online_count === "number") {
        connState.onlineCount = Math.max(data.online_count, activeMemberIds.size);
      } else if (activeMemberIds.size > 0) {
        connState.onlineCount = activeMemberIds.size;
      }
      connState.status = "connected";
      connState.errorMessage = "";
      updatePillUI();

      // 若正在连接弹窗开启，收到有效同步直接关闭弹窗并重置按钮
      if (!connectModal.hidden && btnConfirmConnect.disabled) {
        connectModal.hidden = true;
        btnConnectText.textContent = "连接并进入房间";
        btnConfirmConnect.disabled = false;
        connectErrorBanner.hidden = true;
      }

      const msgs = data.messages || [];
      if (msgs.length === 0) {
        if (!messagesEl.querySelector(".row") && !messagesEl.querySelector(".room-empty-state")) {
          messagesEl.innerHTML = `
            <div class="room-empty-state">
              <div class="empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div class="empty-title">空间【${escapeHtml(targetRoomId)}】当前为空</div>
              <div class="empty-desc">这里是团队公共对话池。点击下方按钮，即可将当前对话要点分享到空间协同。</div>
              <button type="button" class="btn-share-empty" id="btn-share-empty">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                <span>分享当前对话到本空间</span>
              </button>
            </div>
          `;
          messagesEl.querySelector("#btn-share-empty")?.addEventListener("click", () => {
            shareCurrentThreadToTeam();
          });
        }
      } else {
        const emptyEl = messagesEl.querySelector(".room-empty-state");
        if (emptyEl) emptyEl.remove();
        msgs.forEach((msg) => {
          try { renderMessage(msg); } catch (err) {
            logTrace("render_message_failed", { id: msg?.id, err: err?.message || String(err) });
          }
        });
      }

      renderPeople();
      renderLink();
    };

    const hidePicker = () => {
      picker.hidden = true;
      picker.innerHTML = "";
    };

    const showPicker = (query = "") => {
      const q = (query || "").trim().toLowerCase();
      const threads = listSidebarThreads().filter((item) => !q || item.title.toLowerCase().includes(q));
      const people = members.filter((item) => !q || item.name.toLowerCase().includes(q));
      picker.hidden = false;
      picker.innerHTML = "";

      if (!threads.length && !people.length) {
        const sec = document.createElement("div");
        sec.className = "picker-section";
        const newBtn = document.createElement("button");
        newBtn.type = "button";
        newBtn.className = "picker-item picker-item-action";
        newBtn.innerHTML = `
          <span class="picker-item-icon action-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </span>
          <div class="picker-item-content">
            <div class="picker-item-title" style="color:var(--accent-color);font-weight:600;">新建 Codex 对话并关联</div>
            <div class="picker-item-sub">以当前查询新建独立会话并接入团队空间</div>
          </div>
          <span class="picker-item-badge" style="background:rgba(58,131,247,0.15);color:var(--accent-color);">新建</span>
        `;
        newBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          createNewThreadAndLink();
        });
        sec.appendChild(newBtn);
        picker.appendChild(sec);
        return;
      }

      // 无论如何，在相关对话区域的最上方展示“新建对话并关联”
      const secThreads = document.createElement("div");
      secThreads.className = "picker-section";
      const headerThreads = document.createElement("div");
      headerThreads.className = "picker-group-title";
      headerThreads.innerHTML = `<span>相关对话</span><span class="picker-group-count">${threads.length} 个对话</span>`;
      secThreads.appendChild(headerThreads);

      const newThreadActionBtn = document.createElement("button");
      newThreadActionBtn.type = "button";
      newThreadActionBtn.className = "picker-item picker-item-action";
      newThreadActionBtn.innerHTML = `
        <span class="picker-item-icon action-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </span>
        <div class="picker-item-content">
          <div class="picker-item-title" style="color:var(--accent-color);font-weight:600;">新建 Codex 对话并关联</div>
          <div class="picker-item-sub">创建空白会话并自动绑定到当前团队空间</div>
        </div>
        <span class="picker-item-badge" style="background:rgba(58,131,247,0.15);color:var(--accent-color);">新建</span>
      `;
      newThreadActionBtn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        createNewThreadAndLink();
      });
      secThreads.appendChild(newThreadActionBtn);

      if (threads.length) {

        threads.forEach((thread) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "picker-item";
          btn.innerHTML = `
            <span class="picker-item-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </span>
            <div class="picker-item-content">
              <div class="picker-item-title">${escapeHtml(thread.title)}</div>
            </div>
            ${thread.selected ? `<span class="picker-item-badge active-thread">当前对话</span>` : ""}
          `;
          btn.addEventListener("mousedown", (event) => {
            event.preventDefault();
            linkedThread = thread;
            renderLink();
            window.__teamContextPendingContext = { linked_thread: thread };
            hidePicker();
          });
          secThreads.appendChild(btn);
        });
      }
      picker.appendChild(secThreads);

      if (people.length) {
        const sec = document.createElement("div");
        sec.className = "picker-section";
        const header = document.createElement("div");
        header.className = "picker-group-title";
        header.innerHTML = `<span>团队成员</span><span class="picker-group-count">${people.length} 位成员</span>`;
        sec.appendChild(header);

        people.forEach((person) => {
          const isAi = person.role === "ai";
          const initial = (person.name || "U").slice(0, 1).toUpperCase();
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "picker-item";
          btn.innerHTML = `
            <span class="picker-item-icon ${isAi ? "member-ai" : "member-human"}">
              ${isAi 
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>` 
                : initial}
            </span>
            <div class="picker-item-content">
              <div class="picker-item-title">${escapeHtml(person.name)}</div>
              <div class="picker-item-sub">${isAi ? "协同 AI Agent" : "团队成员"}</div>
            </div>
            <span class="picker-item-badge" style="color:var(--text-muted);font-size:11px;">@提及</span>
          `;
          btn.addEventListener("mousedown", (event) => {
            event.preventDefault();
            actorId = person.id;
            actorType = isAi ? "ai" : "human";
            input.value = `${input.value.replace(/@[^\s]*$/, "").trimEnd()} @${person.name} `;
            renderPeople();
            hidePicker();
            input.focus();
          });
          sec.appendChild(btn);
        });
        picker.appendChild(sec);
      }
    };

    const compactPrompt = () => {
      const thread = linkedThread || currentThread();
      const keyRe = /不行|不要|必须|确认|方案|冲突|未确认|先改|禁止|采用|统一/;
      const all = lastSnapshot.messages || [];
      const picked = [];
      const seen = new Set();
      [...all.filter((item) => keyRe.test(item.content || "")), ...all.slice(-4)].forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        picked.push(item);
      });
      const recent = picked.map((item) => `- ${keyRe.test(item.content || "") ? "[结论] " : ""}${item.actor_id}：${String(item.content || "").replace(/\s+/g, " ").slice(0, 120)}`);
      const omitted = Math.max(0, all.length - picked.length);
      return `请按这份压缩摘要审核。结论和否决已保留；日常闲聊已省略，不要脑补。

空间/房间：${config.roomId || "Media"}
关联对话：${thread?.title || "未选择"}
成员：${members.map((item) => item.name).join("、") || "未填写"}
关键意见：
${recent.join("\n") || "- （暂无）"}
${omitted ? `另有 ${omitted} 条日常讨论未展开。` : ""}

请回答：当前方案是什么、有没有冲突、能不能继续改代码。`;
    };

    const sendToCodex = () => {
      const thread = linkedThread || currentThread();
      const prompt = compactPrompt();
      if (thread?.id) openCodexThread(thread);
      else closePage();
      window.setTimeout(() => insertIntoComposer(prompt), 500);
    };

    page.__teamContextApply = apply;
    window.__teamContextApply = apply;
    window.__teamContextIngestMessages = (data) => {
      if (!data || typeof data !== "object") return { ok: false };
      try {
        if (Array.isArray(data.members) && data.members.length) members = data.members;
        if (Array.isArray(data.active_members)) {
          activeMemberIds = new Set(data.active_members);
        }
        if (typeof data.online_count === "number") {
          connState.onlineCount = Math.max(data.online_count, activeMemberIds.size || 0);
        }
        if (data.room?.id && connState.status !== "disconnected") {
          connState.status = "connected";
        }
        updatePillUI();
        renderPeople();
        (data.messages || []).forEach((msg) => {
          try { renderMessage(msg); } catch (err) {
            logTrace("render_message_failed", { id: msg?.id, err: err?.message || String(err) });
          }
        });
        if (Number(data.seq || 0) > Number(lastSnapshot?.seq || 0)) {
          lastSnapshot = { ...(lastSnapshot || {}), seq: Number(data.seq) };
        }
        return { ok: true, lastSeq: Number(lastSnapshot?.seq || 0) };
      } catch (err) {
        logTrace("ingest_messages_failed", { err: err?.message || String(err) });
        return { ok: false, error: err?.message || String(err) };
      }
    };
    window.__teamContextTakePending = () => {
      const message = window.__teamContextPending || null;
      const context = window.__teamContextPendingContext || null;
      window.__teamContextPending = null;
      window.__teamContextPendingContext = null;
      return message || context ? { message, context } : null;
    };
    window.__teamContextGetConfig = () => ({
      ...config,
      lastSeq: Number(lastSnapshot?.seq || 0),
      clientId: window.__teamContextClientId || "",
    });
    window.__teamContextApplyConfigResult = (res) => {
      if (res && res.ok) {
        if (window.__teamContextRetryTimer) {
          clearTimeout(window.__teamContextRetryTimer);
          window.__teamContextRetryTimer = null;
        }
        connState.status = "connected";
        connState.errorMessage = "";
        connState.onlineCount = res.data?.online_count || 1;
        updatePillUI();
        connectModal.hidden = true;
        btnConnectText.textContent = "连接并进入房间";
        btnConfirmConnect.disabled = false;
        connectErrorBanner.hidden = true;

        // 补全守护代理中继回调：清空旧消息并拉取快照，启动长连接
        messagesEl.innerHTML = "";
        knownIds.clear();
        api("/api/snapshot").then((snap) => {
          if (snap) apply(snap);
        }).catch((err) => {
          console.warn("[TeamContext] snapshot after proxy config failed:", err);
        });
        setupSSE();
        startSnapshotPoll();
      } else if (res && !res.ok) {
        connState.status = "error";
        connState.errorMessage = res.error?.includes("401") || res.error?.includes("密码") ? "密钥错误" : "连接失败";
        updatePillUI();
        connectErrorBanner.textContent = res.error || "连接验证失败";
        connectErrorBanner.hidden = false;
        btnConnectText.textContent = "连接并进入房间";
        btnConfirmConnect.disabled = false;
      }
    };

    // 默认自动启动连接与恢复
    connectHub(config);

    root.getElementById("back")?.addEventListener("click", () => returnToConversation());
    root.getElementById("btn-toggle-sidebar")?.addEventListener("click", () => {
      const btn = document.querySelector('button[data-app-shell-sidebar-trigger]') ||
                  Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute("aria-label")||"").includes("侧边栏"));
      if (btn) {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        btn.click();
      }
    });
    root.getElementById("share-thread")?.addEventListener("click", () => {
      openThreadSelectModal({ mode: "share" });
    });
    root.getElementById("review")?.addEventListener("click", () => openImportSelectCard());

    contextSelectList?.addEventListener("pointerup", () => {
      selectionPointerActive = false;
      selectionDragged = false;
    });
    document.addEventListener("pointerup", () => {
      selectionPointerActive = false;
      selectionDragged = false;
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (!contextSelectModal || contextSelectModal.hidden) return;
      const path = event.composedPath();
      if (!path.includes(contextSelectModal)) closeContextSelectCard();
    }, true);
    contextSelectClose?.addEventListener("click", () => closeContextSelectCard());
    contextSelectCancel?.addEventListener("click", () => closeContextSelectCard());
    contextSelectModal?.addEventListener("click", (event) => {
      if (event.target === contextSelectModal) closeContextSelectCard();
    });
    contextSelectClear?.addEventListener("click", () => {
      selectedContextIndexes.clear();
      selectionAnchorIndex = -1;
      selectionPointerActive = false;
      selectionDragged = false;
      updateContextSelectionUI();
    });
    contextSelectCopy?.addEventListener("click", async () => {
      if (!selectedContextIndexes.size) return;
      const selected = selectionMessages.filter((_, index) => selectedContextIndexes.has(index));
      const markdown = formatContextMarkdown(selectionTitle, selectionThread, selected, "以下内容来自团队协作空间的选定消息。");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("剪贴板不可用");
        await navigator.clipboard.writeText(markdown);
        showToast("✓ Markdown 上下文已复制");
      } catch (err) {
        showToast(`复制失败: ${err.message || "剪贴板不可用"}`);
      }
    });
   contextSelectImport?.addEventListener("click", () => importSelectedContextToMyAi());

   // 多选操作栏事件绑定 (微信式交互)
   btnSelectAll?.addEventListener("click", () => {
     const rows = getMessageRows();
     rows.forEach((r) => {
       if (r.dataset.id) selectedMessageIds.add(r.dataset.id);
     });
     updateMultiSelectUI();
   });
   btnSelectClear?.addEventListener("click", () => {
     selectedMessageIds.clear();
     updateMultiSelectUI();
   });
   btnSelectCancel?.addEventListener("click", () => {
     exitMultiSelectMode();
   });
    btnSelectImportSelect?.addEventListener("click", () => {
      importSelectedMessagesToComposer({ mode: "select" });
    });
    btnSelectImport?.addEventListener("click", () => {
      importSelectedMessagesToComposer({ mode: "current" });
    });
    btnSelectImportNew?.addEventListener("click", () => {
      importSelectedMessagesToComposer({ mode: "new" });
    });

    // 快照与原生分享详情弹层操作绑定 (对齐官方图 2 原生分享交互)
    snapshotDetailClose?.addEventListener("click", closeSnapshotDetailModal);
    snapshotDetailModal?.addEventListener("click", (event) => {
      if (event.target === snapshotDetailModal) closeSnapshotDetailModal();
    });

    // 按钮 1：【新建并导入】（自动新开独立空白会话注入上下文）
    snapshotDetailImportNew?.addEventListener("click", () => {
      if (!currentViewingSnapshotMessage || isImportingInProgress) return;
      isImportingInProgress = true;
      const block = buildSnapshotImportBlock(currentViewingSnapshotMessage);
      closeSnapshotDetailModal();
      importIntoNewThread(block).finally(() => {
        isImportingInProgress = false;
      });
    });

    // 按钮 2：【导入到当前对话】（填入当前打开的会话输入框）
    snapshotDetailNativeImport?.addEventListener("click", () => {
      if (!currentViewingSnapshotMessage || isImportingInProgress) return;
      isImportingInProgress = true;
      const block = buildSnapshotImportBlock(currentViewingSnapshotMessage);
      closeSnapshotDetailModal();
      importIntoCurrentThread(block).finally(() => {
        isImportingInProgress = false;
      });
    });

    // 按钮 3：【选对话...】（从历史会话列表中选择目标对话注入）
    snapshotDetailImportSelect?.addEventListener("click", () => {
      if (!currentViewingSnapshotMessage || isImportingInProgress) return;
      const block = buildSnapshotImportBlock(currentViewingSnapshotMessage);
      closeSnapshotDetailModal();
      openThreadSelectModal({ mode: "import", content: block });
    });

    // 辅助按钮：带 🔗 图标的【复制链接】
    snapshotDetailNativeCopy?.addEventListener("click", async () => {
      if (!currentViewingSnapshotMessage) return;
      const content = currentViewingSnapshotMessage.content || "";
      const shareUrl = currentViewingSnapshotMessage.metadata?.share_url ||
        (content.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;

      if (shareUrl) {
        try {
          if (!navigator.clipboard?.writeText) throw new Error("剪贴板不可用");
          await navigator.clipboard.writeText(shareUrl);
          if (snapshotDetailNativeCopyText) {
            snapshotDetailNativeCopyText.textContent = "已复制链接";
            setTimeout(() => {
              if (snapshotDetailNativeCopyText) snapshotDetailNativeCopyText.textContent = "复制链接";
            }, 1800);
          }
          showToast("✓ 已复制链接");
        } catch (err) {
          showToast(`复制链接失败: ${err.message || "剪贴板不可用"}`);
        }
      } else {
        // 未检测到预存官方链接时，自动尝试触发右上角原生分享
        try {
          const shareBtn = document.querySelector("button[aria-label='分享']") ||
            Array.from(document.querySelectorAll("button")).find(b => b.innerText?.trim() === "分享");
          if (shareBtn) {
            shareBtn.click();
            closeSnapshotDetailModal();
            showToast("已为你唤起官方原生分享窗口！");
          } else {
            showToast("未获取到官方分享链接");
          }
        } catch (e) {
          showToast(`唤起官方分享失败: ${e.message}`);
        }
      }
    });

    snapshotDetailNativeOpen?.addEventListener("click", () => {
      if (!currentViewingSnapshotMessage) return;
      const content = currentViewingSnapshotMessage.content || "";
      const shareUrl = currentViewingSnapshotMessage.metadata?.share_url ||
        (content.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0]) || null;
      if (shareUrl) {
        openExternalUrl(shareUrl);
      } else {
        showToast("未获取到官方分享链接");
      }
    });

    root.querySelector(".official-help-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      openExternalUrl("https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq");
    });

    snapshotDetailContextToggle?.addEventListener("click", () => {
      if (!snapshotDetailFullContent) return;
      const isHidden = snapshotDetailFullContent.hidden;
      snapshotDetailFullContent.hidden = !isHidden;
      if (snapshotDetailContextToggleText) {
        const count = Number(currentViewingSnapshotMessage?.metadata?.capture?.message_count || 0) || 1;
        snapshotDetailContextToggleText.textContent = isHidden
          ? "收起完整对话记录"
          : `展开查看完整对话记录 (${count} 条消息)`;
      }
    });

   // 点击消息区域空白或聚焦输入框时退出多选模式
   messagesEl.addEventListener("click", (event) => {
     if (!isMultiSelectMode) return;
     if (!event.target.closest(".row")) {
       exitMultiSelectMode();
     }
   });
   input.addEventListener("focus", () => {
     if (isMultiSelectMode) {
       exitMultiSelectMode();
     }
   });
   window.addEventListener("pointerup", () => {
     pointerDragging = false;
     dragAnchorIndex = -1;
   });

    let composerInFlight = false;
    let composerFlightTimer = null;
    const composerEl = root.getElementById("composer") || root.querySelector("#composer");
    const sendBtn = composerEl?.querySelector(".send") || root.querySelector(".send");

    const autoResizeInput = () => {
      if (!input) return;
      try {
        input.style.height = "auto";
        input.style.height = `${Math.min(Math.max(input.scrollHeight, 36), 160)}px`;
      } catch {}
    };

    const submitCurrentMessage = async () => {
      logTrace("submit_entered", { inFlight: composerInFlight, val: input?.value });
      if (composerInFlight) return;
      const rawContent = input ? input.value : "";
      let content = rawContent.trim();
      const currentPendingImg = pendingImage;
      if (!content && !currentPendingImg) {
        logTrace("submit_empty_content", {});
        return;
      }

      composerInFlight = true;
      if (sendBtn) sendBtn.disabled = true;

      // 看门狗超时保护：最长 8 秒自动恢复交互能力，杜绝状态死锁
      if (composerFlightTimer) clearTimeout(composerFlightTimer);
      composerFlightTimer = setTimeout(() => {
        logTrace("watchdog_timeout_reset", {});
        composerInFlight = false;
        if (sendBtn) sendBtn.disabled = false;
      }, 8000);

      try {
        // 先清空输入框并收起 picker
        if (input) input.value = "";
        autoResizeInput();
        if (typeof hidePicker === "function") hidePicker();

        // 如有待发送图片，先上传至服务器
        let uploadedImages = [];
        if (currentPendingImg) {
          try {
            const uploadRes = await api("/api/upload", {
              method: "POST",
              body: JSON.stringify({
                filename: currentPendingImg.name,
                data: currentPendingImg.base64,
              }),
            });
            if (uploadRes?.ok && uploadRes.url) {
              uploadedImages.push({
                url: uploadRes.url,
                full_url: uploadRes.full_url || uploadRes.url,
                name: uploadRes.filename || currentPendingImg.name,
                size: uploadRes.size || currentPendingImg.size,
              });
            }
          } catch (uploadErr) {
            console.error("图片上传失败:", uploadErr);
            showToast(`图片上传失败: ${uploadErr.message || "请求异常"}`);
            // 恢复输入框内容
            if (input && !input.value) {
              input.value = rawContent;
              autoResizeInput();
            }
            return;
          }
        }

        if (!content && uploadedImages.length > 0) {
          content = "[图片]";
        }

        // 智能识别用户直接粘贴发送的官方原生分享链接 (https://chatgpt.com/s/cx_...)
        const officialShareMatch = content.match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/);
        const isOfficialShare = Boolean(officialShareMatch);
        let metadata = isOfficialShare
          ? {
              kind: "codex_context_snapshot",
              share_url: officialShareMatch[0],
              version: 1,
              scope: "official_native_share",
              capture: {
                source: "user_pasted_official_share_url",
                status: "captured_official_share",
                complete: true,
                message_count: 1,
                has_codex_response: true,
              },
            }
          : undefined;

        if (uploadedImages.length > 0) {
          metadata = { ...(metadata || {}), images: uploadedImages };
        }

        let threadInfo = linkedThread;
        if (!threadInfo) {
          try {
            threadInfo = currentThread();
          } catch {}
        }
        if (!threadInfo) {
          threadInfo = { id: `thread_${Date.now()}`, title: isOfficialShare ? "官方原生对话分享" : "当前对话" };
        }

        // 关键防御：严格提纯为纯净的 JSON 可序列化对象，绝不携带任何 DOM 元素或 Fiber 内部对象，杜绝循环引用
        const safeLinkedThread = threadInfo ? {
          id: String(threadInfo.id || `thread_${Date.now()}`),
          title: String(threadInfo.title || (isOfficialShare ? "官方原生对话分享" : "当前对话")),
        } : null;

        const devUser = typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname) : { nickname: config.nickname, memberId: config.nickname };
        const myMemberId = config.memberId || devUser.memberId;
        const myMemberName = config.nickname || devUser.nickname;
        const currentActor = members.find((m) => m.id === actorId);
        const sendActorId = actorId || myMemberId;
        const sendActorName = currentActor?.name || (sendActorId === myMemberId ? myMemberName : (currentActor?.id || myMemberName));

        const payload = {
          content,
          actor_type: actorType,
          actor_id: sendActorId,
          actor_name: sendActorName,
          client_message_id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          linked_thread: safeLinkedThread,
          metadata,
          room: defaultRoomId(),
          room_key: config.roomKey || "",
        };

        logTrace("submit_calling_api", { client_id: payload.client_message_id, content: content.slice(0, 30) });
        const msg = await api("/api/messages", { method: "POST", body: JSON.stringify(payload) });
        logTrace("submit_api_success", { msgId: msg?.id, seq: msg?.seq });
        setPendingImage(null); // 发送成功后清空待发图片并收起预览条
        renderMessage(msg);
      } catch (err) {
        logTrace("submit_api_failed", { err: err.message, stack: err.stack });
        console.error("send message failed:", err);
        // 发送失败恢复输入框内容，防止用户输入内容丢失
        if (input && !input.value) {
          input.value = rawContent;
          autoResizeInput();
        }
        showToast(`发送失败: ${err.message || "请求异常"}`);
      } finally {
        if (composerFlightTimer) clearTimeout(composerFlightTimer);
        composerInFlight = false;
        if (sendBtn) sendBtn.disabled = false;
        logTrace("submit_finally_done", { inFlight: composerInFlight, disabled: sendBtn?.disabled });
      }
    };
    window.__teamContextDebugSubmit = submitCurrentMessage;

    // 表单 submit 兜底
    composerEl?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCurrentMessage();
    });

    // 发送按钮明确绑定 click 监听，杜绝 Shadow DOM 冒泡失效
    sendBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitCurrentMessage();
    });

    // 键盘回车事件监听：区分输入法上屏与实际发送，支持 Enter 与 Cmd/Ctrl+Enter
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hidePicker();
        return;
      }
      // 中文拼音输入法选词上屏阶段不发送
      if (event.isComposing || event.keyCode === 229) return;

      // 普通 Enter 发送 (非 Shift+Enter)，或 Command/Ctrl+Enter 发送
      if ((event.key === "Enter" && !event.shiftKey) || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        submitCurrentMessage();
      }
    });

    const inspectInputCollabToken = () => {
      if (!input || !collabTokenBar) return;
      const text = input.value || "";
      const token = parseCollabToken(text);
      if (token) {
        currentPendingCollabToken = token;
        if (collabTokenText) {
          collabTokenText.innerHTML = `检测到空间邀请口令：<strong>${escapeHtml(token.roomId)}</strong> (${escapeHtml(token.hubUrl.replace(/^https?:\/\//, ""))}${token.roomKey ? " · 含密钥" : ""})`;
        }
        collabTokenBar.hidden = false;
        collabTokenBar.style.removeProperty("display");
      } else {
        currentPendingCollabToken = null;
        collabTokenBar.hidden = true;
        collabTokenBar.style.setProperty("display", "none", "important");
      }
    };

    input.addEventListener("input", () => {
      autoResizeInput();
      inspectInputCollabToken();
      const match = input.value.match(/(?:^|\s)@([^\s]*)$/);
      if (match) showPicker(match[1]);
      else if (!picker.hidden) hidePicker();
    });

    input.addEventListener("paste", (event) => {
      // 检查剪贴板中是否包含图片 (截图粘贴 / 复制图片)
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              event.preventDefault(); // 阻止浏览器对图片数据粘贴的默认行为
              handleImageFile(blob);
              return;
            }
          }
        }
      }
      setTimeout(() => {
        inspectInputCollabToken();
      }, 50);
    });

    // 输入框支持直接拖拽图片
    input.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    input.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith("image/")) {
            handleImageFile(files[i]);
            return;
          }
        }
      }
    });

    // 工具栏 [📷 图片] 按钮点击与原生文件选择器
    btnUploadImage?.addEventListener("click", () => {
      fileUploadImage?.click();
    });
    fileUploadImage?.addEventListener("change", () => {
      const file = fileUploadImage.files?.[0];
      if (file) {
        handleImageFile(file);
      }
    });

    // 待发图片条中 [✖️] 移除按钮
    btnComposerImageRemove?.addEventListener("click", () => {
      setPendingImage(null);
    });

    // Lightbox 大图弹层交互
    imageLightboxClose?.addEventListener("click", closeImageLightbox);
    imageLightboxModal?.addEventListener("click", (e) => {
      if (e.target === imageLightboxModal || e.target.closest(".image-lightbox-close")) {
        closeImageLightbox();
      }
    });
    imageLightboxCopyLink?.addEventListener("click", async (e) => {
      e.preventDefault();
      const href = imageLightboxOpenNew?.href || imageLightboxImg?.src || "";
      if (!href) return;
      try {
        await navigator.clipboard.writeText(href);
        showToast("✓ 图片链接已复制");
      } catch {
        showToast("复制失败");
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && imageLightboxModal && !imageLightboxModal.hidden) {
        closeImageLightbox();
      }
    });

    btnCollabTokenJoin?.addEventListener("click", async (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      let token = currentPendingCollabToken;
      if (!token && input) {
        token = parseCollabToken(input.value);
      }
      if (!token) {
        showToast("未检测到有效协同口令，请先在下方输入框粘贴口令");
        return;
      }

      // 检查当前是否已经在目标房间且已连通
      const currentHub = (config.hubUrl || "http://127.0.0.1:18765").replace(/\/+$/, "");
      const targetHub = (token.hubUrl || "").replace(/\/+$/, "");
      const normalizeHub = (u) => (u || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^localhost(?=:|$)/, "127.0.0.1");
      if (connState.status === "connected" && config.roomId === token.roomId && normalizeHub(currentHub) === normalizeHub(targetHub)) {
        showToast("当前已在该空间中");
        return;
      }

      // 保存备份以防失败时恢复
      const backupInputValue = input ? input.value : "";
      const backupPendingToken = token;

      // 仅在确认连接调用发起后处理口令栏隐藏与输入框清空
      collabTokenBar.hidden = true;
      collabTokenBar.style.setProperty("display", "none", "important");
      currentPendingCollabToken = null;
      if (input) {
        input.value = "";
        autoResizeInput();
      }
      showToast(`正在一键切换至空间 [${token.roomId}]...`);

      try {
        await connectHub({
          hubUrl: token.hubUrl,
          roomId: token.roomId,
          roomKey: token.roomKey,
          autoConnect: true,
        }, true);
        if (connState.status === "error") {
          throw new Error(connState.errorMessage || "连接未成功");
        }
      } catch (err) {
        // 若连接失败，恢复口令栏与输入框内容，防止用户输入内容丢失
        if (input && backupInputValue) {
          input.value = backupInputValue;
          autoResizeInput();
        }
        currentPendingCollabToken = backupPendingToken;
        if (collabTokenText && backupPendingToken) {
          collabTokenText.innerHTML = `检测到空间邀请口令：<strong>${escapeHtml(backupPendingToken.roomId)}</strong> (${escapeHtml(backupPendingToken.hubUrl.replace(/^https?:\/\//, ""))}${backupPendingToken.roomKey ? " · 含密钥" : ""})`;
        }
        collabTokenBar.hidden = false;
        collabTokenBar.style.removeProperty("display");
        showToast(`加入空间失败: ${err.message || err}`);
      }
    });

    btnCollabTokenDismiss?.addEventListener("click", (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      collabTokenBar.hidden = true;
      collabTokenBar.style.setProperty("display", "none", "important");
      currentPendingCollabToken = null;
      showToast("已忽略口令提示");
    });

    root.addEventListener("click", (e) => {
      if (!picker.hidden) {
        const path = e.composedPath();
        const inPicker = path.includes(picker);
        const isMention = path.some((el) => el?.id === "mention");
        const isInput = path.includes(input);
        if (!inPicker && !isMention && !isInput) {
          hidePicker();
        }
      }
    });

    // 全局捕获式事件委托：点击任何「网页打开 ↗」或官方外链，统一调用系统浏览器原生打开
    root.addEventListener("click", (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      let targetLink = null;
      for (const node of path) {
        if (node instanceof Element && (node.matches(".web-link, .official-help-link") || node.classList?.contains("web-link"))) {
          targetLink = node;
          break;
        }
      }
      if (!targetLink && e.target instanceof Element) {
        targetLink = e.target.closest(".web-link, .official-help-link");
      }
      if (targetLink) {
        e.preventDefault();
        e.stopPropagation();
        let targetUrl = targetLink.getAttribute("data-url") || targetLink.getAttribute("href");
        if (!targetUrl) {
          const row = targetLink.closest(".row");
          const msgId = row?.dataset?.messageId;
          const msg = (lastSnapshot?.messages || []).find((m) => m && m.id === msgId);
          targetUrl = msg?.metadata?.share_url || (msg?.content || "").match(/https:\/\/chatgpt\.com\/s\/cx_[a-zA-Z0-9_\-]+/)?.[0];
        }
        if (targetUrl) {
          openExternalUrl(targetUrl);
        }
      }
    }, true);

    // 主动授权共享安全管理交互
    const shareModal = root.getElementById("share-modal");
    const shareErrorBanner = root.getElementById("share-error-banner");
    const btnShareHook = root.getElementById("btn-share-hook");
    const shareClose = root.getElementById("share-close");
    const btnCreateShare = root.getElementById("btn-create-share");
    const latestShareBox = root.getElementById("latest-share-box");
    const latestShareUrl = root.getElementById("latest-share-url");
    const btnCopyShare = root.getElementById("btn-copy-share");
    const sharesList = root.getElementById("shares-list");

    const renderSharesList = (shares = []) => {
      if (!sharesList) return;
      sharesList.innerHTML = "";
      const activeShares = (shares || []).filter((s) => s.status === "active");
      if (!activeShares.length) {
        sharesList.innerHTML = `<div style="font-size:12.5px;color:var(--text-muted);text-align:center;padding:12px;">暂无主动授权中的共享凭据。点击上方按钮即可一键生成新专属 Hook。</div>`;
        return;
      }
      activeShares.forEach((s) => {
        const item = document.createElement("div");
        item.className = "share-item";
        item.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;flex:1;">
            <div style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.title || "方案上下文")}</div>
            <div style="font-size:11px;color:var(--text-secondary);font-family:monospace;">Token: ${escapeHtml(s.token)} · ${escapeHtml(s.created_at ? s.created_at.slice(11, 16) : "")}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="ghost copy-item" type="button" style="padding:4px 8px;font-size:11.5px;background:var(--bg-card);" data-url="${escapeHtml(s.hook_url)}">复制链接</button>
            <button class="share-btn-revoke" type="button" data-id="${escapeHtml(s.id)}">撤销授权</button>
          </div>
        `;

        item.querySelector(".copy-item")?.addEventListener("click", (e) => {
          const u = e.currentTarget.dataset.url;
          if (u) {
            navigator.clipboard?.writeText(u);
            e.currentTarget.textContent = "已复制!";
            setTimeout(() => { e.currentTarget.textContent = "复制链接"; }, 1500);
          }
        });

        item.querySelector(".share-btn-revoke")?.addEventListener("click", async (e) => {
          const sid = e.currentTarget.dataset.id;
          if (!sid) return;
          const btnRevoke = e.currentTarget;
          btnRevoke.disabled = true;
          btnRevoke.textContent = "撤销中...";
          if (shareErrorBanner) shareErrorBanner.hidden = true;
          try {
            await api(`/api/shares/${sid}/revoke`, { method: "POST" });
            fetchShares();
          } catch (err) {
            btnRevoke.disabled = false;
            btnRevoke.textContent = "撤销授权";
            if (shareErrorBanner) {
              shareErrorBanner.textContent = "撤销授权失败: " + (err.message || "请求失败");
              shareErrorBanner.hidden = false;
            } else {
              showToast("撤销失败: " + err.message);
            }
          }
        });

        sharesList.appendChild(item);
      });
    };

    const fetchShares = async () => {
      try {
        const list = await api("/api/shares");
        renderSharesList(list);
      } catch (err) {
        console.warn("[TeamContext] fetchShares error:", err);
      }
    };

    btnShareHook?.addEventListener("click", () => {
      if (shareModal) {
        shareModal.hidden = false;
        if (shareErrorBanner) shareErrorBanner.hidden = true;
        fetchShares();
      }
    });

    shareClose?.addEventListener("click", () => {
      if (shareModal) shareModal.hidden = true;
    });

    shareModal?.addEventListener("click", (e) => {
      if (e.target === shareModal) shareModal.hidden = true;
    });

    btnCreateShare?.addEventListener("click", async () => {
      if (btnCreateShare.disabled) return;
      const originalHtml = btnCreateShare.innerHTML;
      btnCreateShare.disabled = true;
      btnCreateShare.innerHTML = "<span>⏳ 正在生成...</span>";
      if (shareErrorBanner) {
        shareErrorBanner.hidden = true;
        shareErrorBanner.textContent = "";
      }

      try {
        const res = await api("/api/shares", {
          method: "POST",
          body: JSON.stringify({
            title: linkedThread?.title || `[${config.roomId || "1024"}] 当前方案与技术规范`,
            created_by: actorId || config.memberId || (typeof formatDeviceUser === "function" ? formatDeviceUser(config.nickname).memberId : "weijia_mac"),
          }),
        });
        if (res && res.share) {
          if (latestShareBox && latestShareUrl) {
            latestShareBox.hidden = false;
            latestShareUrl.value = res.share.hook_url;
            latestShareUrl.focus?.();
            latestShareUrl.select?.();
          }
          btnCreateShare.innerHTML = "<span>✓ 生成成功!</span>";
          setTimeout(() => {
            btnCreateShare.innerHTML = originalHtml;
            btnCreateShare.disabled = false;
          }, 1500);
          fetchShares();
        } else {
          throw new Error("服务端返回异常，未包含 share 对象");
        }
      } catch (err) {
        btnCreateShare.innerHTML = originalHtml;
        btnCreateShare.disabled = false;
        if (shareErrorBanner) {
          shareErrorBanner.textContent = "生成共享 Hook 失败: " + (err.message || "请求失败");
          shareErrorBanner.hidden = false;
        } else {
          showToast("生成失败: " + err.message);
        }
      }
    });

    btnCopyShare?.addEventListener("click", () => {
      if (latestShareUrl && latestShareUrl.value) {
        navigator.clipboard?.writeText(latestShareUrl.value);
        latestShareUrl.select?.();
        btnCopyShare.textContent = "已复制!";
        setTimeout(() => { btnCopyShare.textContent = "复制"; }, 1500);
      }
    });

    const btnSendShareToRoom = root.getElementById("btn-send-share-to-room");
    const btnPreviewShareBrowser = root.getElementById("btn-preview-share-browser");

    btnPreviewShareBrowser?.addEventListener("click", () => {
      const url = latestShareUrl?.value;
      if (url) {
        openExternalUrl(url);
      } else {
        showToast("暂无生成的分享链接");
      }
    });

    btnSendShareToRoom?.addEventListener("click", async () => {
      const url = latestShareUrl?.value;
      if (!url) {
        showToast("请先生成分享快照");
        return;
      }
      const title = linkedThread?.title || `[${config.roomId || "Media"}] 当前会话方案`;
      const shareMsg = `【对话快照】${title}\n\n当前会话方案与讨论已生成共享快照，团队成员可查阅或导入：\n${url}`;

      const origText = btnSendShareToRoom.innerHTML;
      btnSendShareToRoom.disabled = true;
      btnSendShareToRoom.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        <span>正在发送...</span>
      `;
      try {
        await sendMessage(shareMsg);
        showToast("✓ 已成功将对话快照发送到当前协作房间！");
        if (shareModal) shareModal.hidden = true;
      } catch (err) {
        showToast(`发送失败: ${err.message || "网络错误"}`);
      } finally {
        btnSendShareToRoom.disabled = false;
        btnSendShareToRoom.innerHTML = origText;
      }
    });

    // 初始化渲染顶部协同栏与对话路径
    renderPeople(true);
    renderLink(true);
  }

  function openPage() {
    hideNativeAppShellHeader();
    if (!document.getElementById(PAGE_ID)) {
      window.__teamContextReturnThread = currentThread();
    }
    let page = document.getElementById(PAGE_ID);
    if (page && page.dataset.ui !== UI_VERSION) {
      page.remove();
      page = null;
    }
    if (!page) {
      page = document.createElement("div");
      page.id = PAGE_ID;
      page.dataset.ui = UI_VERSION;

      // 关键：在插入 DOM 前先完成坐标计算与基础样式初始化，防止第一帧跳动或白屏闪烁
      positionPage(page);
      const light = isCodexLight();
      Object.assign(page.style, {
        position: "fixed",
        zIndex: "35",
        background: light ? "#ffffff" : "#181818",
        color: light ? "#1a1c1f" : "#ffffff",
        overflow: "hidden",
        pointerEvents: "auto",
        webkitAppRegion: "no-drag",
      });
      page.style.setProperty("-webkit-app-region", "no-drag", "important");
      mountCollab(page);
      applyCodexTheme(page);
      document.documentElement.appendChild(page);

      if (!window.__teamContextResizeHandler) {
        window.__teamContextResizeHandler = () => {
          const current = document.getElementById(PAGE_ID);
          if (current) positionPage(current);
        };
        window.addEventListener("resize", window.__teamContextResizeHandler, { passive: true });
      }
      const sidebar = findSidebar();
      if (sidebar && window.ResizeObserver) {
        if (window.__teamContextSidebarObserver) window.__teamContextSidebarObserver.disconnect();
        window.__teamContextSidebarObserver = new ResizeObserver(() => {
          const current = document.getElementById(PAGE_ID);
          if (current) positionPage(current);
        });
        window.__teamContextSidebarObserver.observe(sidebar);
      }
      if (sidebar && window.MutationObserver) {
        if (window.__teamContextMutationObserver) window.__teamContextMutationObserver.disconnect();
        window.__teamContextMutationObserver = new MutationObserver(() => {
          const current = document.getElementById(PAGE_ID);
          if (current) positionPage(current);
        });
        window.__teamContextMutationObserver.observe(sidebar, { attributes: true, attributeFilter: ["class", "style", "data-state", "hidden"] });
      }
    } else {
      // 常驻容器唤起：位置复位并直接显示，零重建、零重新请求、零闪烁
      positionPage(page);
      page.style.display = "block";
      page.style.visibility = "visible";
      page.style.pointerEvents = "auto";
      page.style.zIndex = "35";
      page.style.setProperty("-webkit-app-region", "no-drag", "important");
      applyCodexTheme(page);
    }
    positionPage(page);
    hideNativeAppShellHeader();
    setTabActive(true);
  }

  function installLeaveHandler() {
    if (window.__teamContextLeaveHandler) {
      document.removeEventListener("click", window.__teamContextLeaveHandler, true);
      document.removeEventListener("keydown", window.__teamContextKeyHandler, true);
    }
    window.__teamContextLeaveHandler = (event) => {
      // 内部静默抓取/分享时，严禁关闭 TeamCodex 全屏页面
      if (window.__teamContextSilentSwitch) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      if (target.closest(`#${TAB_ID}`) || target.closest(`#${PAGE_ID}`)) return;
      const sidebar = findSidebar();
      if (!sidebar || !sidebar.contains(target)) return;

      // 侧栏全局离开监听：当用户点击侧栏中的任何交互项（新对话、插件、定时任务、Pull Request、探索、对话项）时，
      // 必须立刻关闭 TeamCodex 全屏页面，让位给 Codex 原生工作区！
      // 仅当点击侧边栏纯空白背景底板或滚动条时才忽略。
      const interactiveEl = target.closest('button, a, [role="button"], [role="tab"], [data-app-action-sidebar-thread-id], nav li, nav > div');
      const isPointer = target instanceof Element && window.getComputedStyle(target).cursor === "pointer";
      if (interactiveEl || isPointer) {
        window.__teamContextClosePage?.();
      }
    };
    window.__teamContextKeyHandler = (event) => {
      if (event.key === "Escape") {
        const page = document.getElementById(PAGE_ID);
        const shadow = page?.shadowRoot;
        if (shadow) {
          const picker = shadow.getElementById("picker");
          if (picker && !picker.hidden) {
            picker.hidden = true;
            picker.innerHTML = "";
            return;
          }
          const threadSelectModal = shadow.getElementById("thread-select-modal");
          if (threadSelectModal && !threadSelectModal.hidden) {
            threadSelectModal.hidden = true;
            return;
          }
         const contextSelectModal = shadow.getElementById("context-select-modal");
         if (contextSelectModal && !contextSelectModal.hidden) {
           contextSelectModal.hidden = true;
           return;
         }
         const snapshotDetailModal = shadow.getElementById("snapshot-detail-modal");
         if (snapshotDetailModal && !snapshotDetailModal.hidden) {
           snapshotDetailModal.hidden = true;
           return;
         }
         if (isMultiSelectMode) {
           exitMultiSelectMode();
           return;
         }
         const connectModal = shadow.getElementById("connect-modal");
          if (connectModal && !connectModal.hidden) {
            connectModal.hidden = true;
            return;
          }
          const shareModal = shadow.getElementById("share-modal");
          if (shareModal && !shareModal.hidden) {
            shareModal.hidden = true;
            return;
          }
          const popover = shadow.getElementById("room-popover");
          if (popover && !popover.hidden) {
            popover.hidden = true;
            shadow.getElementById("room-status-pill")?.setAttribute("aria-expanded", "false");
            return;
          }
        }
        window.__teamContextReturnToConversation?.();
      }
    };
    document.addEventListener("click", window.__teamContextLeaveHandler, true);
    document.addEventListener("keydown", window.__teamContextKeyHandler, true);
  }

  function installTab() {
    const navigation = findNav();
    if (!navigation) return { installed: false, reason: "navigation-missing" };
    ensureTabStyles();
    const insertionButton = findInsertionButton(navigation);
    const parent = insertionButton?.parentElement || navigation;
    let wrapper = document.getElementById(TAB_ID);
    if (wrapper && wrapper.dataset.ui !== UI_VERSION) {
      wrapper.remove();
      wrapper = null;
    }
    const open = (event) => {
      if (event && event.button !== undefined && event.button !== 0) return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      const existing = document.getElementById(PAGE_ID);
      if (existing) {
        // 当全屏页已挂载并在 DOM 中时，禁止调用 returnToConversation()，改为保持页面并聚焦
        positionPage(existing);
        setTabActive(true);
      }
      window.__teamContextOpenPage?.();
    };

    if (!wrapper || wrapper.parentElement !== parent) {
      wrapper?.remove();
      wrapper = document.createElement("div");
      wrapper.id = TAB_ID;
      wrapper.dataset.ui = UI_VERSION;
      const template =
        [...navigation.querySelectorAll("button")].find((item) => /^(新对话|New chat)$/i.test(textOf(item))) ||
        insertionButton;
      const button = template.cloneNode(true);
      button.type = "button";
      button.removeAttribute("disabled");
      [...button.attributes].forEach((attr) => {
        if (attr.name.startsWith("data-") || attr.name === "href") button.removeAttribute(attr.name);
      });
      button.setAttribute("aria-label", "Team");
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      texts.forEach((node) => {
        if (/新对话|New chat|Pull Request|插件|Plugins|定时任务|团队协作|TeamCodex/.test(node.textContent || "")) {
          node.textContent = "Team";
        }
      });
      const svg = button.querySelector("svg");
      if (svg) {
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.innerHTML = TEAM_ICON_PATHS;
      }
      button.onclick = open;
      button.addEventListener("click", open, true);
      wrapper.appendChild(button);
      if (insertionButton?.nextSibling) parent.insertBefore(wrapper, insertionButton.nextSibling);
      else parent.appendChild(wrapper);
    } else {
      const currentBtn = wrapper.querySelector("button");
      if (currentBtn) {
        currentBtn.onclick = open;
      }
    }
    installLeaveHandler();
    setTabActive(isPageActive());
    return { installed: true, tab: "Team", ui: UI_VERSION, threads: listSidebarThreads().length };
  }

  function ensureWatchers() {
    if (window.__teamContextObserver) {
      window.__teamContextObserver.disconnect();
    }
    window.__teamContextObserver = new MutationObserver(() => {
      if (window.__teamContextInstallTimer) return;
      window.__teamContextInstallTimer = setTimeout(() => {
        window.__teamContextInstallTimer = null;
        window.__teamContextInstall?.();
      }, 100);
    });
    window.__teamContextObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.__teamContextOpenPage = openPage;
  window.__teamContextClosePage = closePage;
  window.__teamContextReturnToConversation = returnToConversation;
  window.__teamContextInstall = installTab;
  
  function setupThemeWatcher() {
    if (window.__teamContextThemeObserver) {
      window.__teamContextThemeObserver.disconnect();
    }
    const updateThemeState = () => {
      setTabActive(isPageActive());
      const page = document.getElementById(PAGE_ID);
      if (page) applyCodexTheme(page);
    };
    window.__teamContextThemeObserver = new MutationObserver(updateThemeState);
    window.__teamContextThemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "theme", "class", "style"],
    });

    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.onchange = updateThemeState;
    }
  }

  window.__teamContextApplyTheme = applyCodexTheme;
  window.__teamContextOpenPage = openPage;
  setupThemeWatcher();

  ensureWatchers();
  const existing = document.getElementById(PAGE_ID);
  const result = installTab();
  if (existing) {
    if (existing.dataset.ui !== UI_VERSION || !existing.shadowRoot?.getElementById?.("snapshot-detail-import-new") || !existing.shadowRoot?.getElementById?.("thread-select-modal")) {
      existing.remove();
      openPage();
    } else {
      existing.style.zIndex = "35";
      existing.style.setProperty("-webkit-app-region", "no-drag", "important");
      hideNativeAppShellHeader();
      positionPage(existing);
    }
  }
  window.__teamContextTabInstalled = true;
  window.__teamContextUiVersion = UI_VERSION;
  return result;
})();

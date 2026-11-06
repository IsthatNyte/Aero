window.GoldenGateOS = (function () {
  const DESKTOP_STORAGE_KEY = 'webos_desktop_items_v5';
  const WINDOWS_STORAGE_KEY = 'webos_open_windows_v1';
  const NOTIFS_STORAGE_KEY = 'webos_notifications_v1';

  let desktopItems = [];
  let openWindows = new Map();
  let topZ = 100;
  let selectedItem = null;
  let lastCreatedGroupId = null;
  let masterVolume = 0.8;
  let notifications = [];
  let audioCtx = null;

  function playSystemSound(type = 'notif') {
    if (masterVolume <= 0.01) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      const now = audioCtx.currentTime;

      if (type === 'alarm') {
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.18 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.16);
        gain.gain.setValueAtTime(0.1 * masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {}
  }

  function buildDefaultDesktopItems() {
    // Apps do not show on desktop; they are only accessed via taskbar
    return [];
  }

  window.addEventListener('desktop:reload', () => {
    loadDesktopState();
    renderDesktopIcons();
  });

  function loadDesktopState() {
    try {
      const raw = localStorage.getItem(DESKTOP_STORAGE_KEY);
      if (raw) {
        desktopItems = JSON.parse(raw);
        // User requested: do NOT show apps on the desktop. They should only be accessed through the taskbar.
        // Also remove legacy shortcuts to wikipedia and hackernews.
        desktopItems = desktopItems.filter((it) => it.type !== 'app' && it.id !== 'sc-wiki' && it.id !== 'sc-hn');
      } else {
        desktopItems = [];
      }
    } catch (e) {
      desktopItems = [];
    }
  }

  function saveDesktopState() {
    try {
      localStorage.setItem(DESKTOP_STORAGE_KEY, JSON.stringify(desktopItems));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('desktop:changed'));
  }

  function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'os-toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ==========================================================================
  // System Notifications & Action Center
  // ==========================================================================
  function loadNotifications() {
    try {
      const raw = localStorage.getItem(NOTIFS_STORAGE_KEY);
      if (raw) notifications = JSON.parse(raw);
    } catch (e) {
      notifications = [];
    }
    if (!Array.isArray(notifications) || notifications.length === 0) {
      notifications = [
        {
          id: 'notif-welcome',
          title: 'AeroOS Ready',
          body: 'Press Alt to summon Droplet Assistant or Win+Space for Search.',
          category: 'system',
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        }
      ];
    }
    renderNotifications();
  }

  function saveNotifications() {
    try {
      localStorage.setItem(NOTIFS_STORAGE_KEY, JSON.stringify(notifications.slice(0, 30)));
    } catch (e) {}
  }

  function pushNotification({ title, body, category = 'system' }) {
    const item = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title: title || 'System Alert',
      body: body || '',
      category,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    };
    notifications.unshift(item);
    saveNotifications();
    renderNotifications();
    playSystemSound(category === 'alarm' ? 'alarm' : 'notif');
    showToast(`${item.title}: ${item.body.slice(0, 48)}`);
  }

  function renderNotifications() {
    const listEl = document.getElementById('ac-notif-list');
    const badgeEl = document.getElementById('taskbar-notif-badge');

    if (badgeEl) {
      badgeEl.textContent = String(notifications.length);
      badgeEl.classList.toggle('hidden', notifications.length === 0);
    }

    if (!listEl) return;

    if (notifications.length === 0) {
      listEl.innerHTML = `<div style="padding:18px 10px;text-align:center;font-size:12px;color:#64748b;">No new notifications</div>`;
      return;
    }

    listEl.innerHTML = notifications
      .map(
        (n) => `
        <div class="ac-notif-card" data-nid="${n.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <span class="ac-notif-title">${n.title}</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="ac-notif-time">${n.time}</span>
              <button class="ac-notif-dismiss" data-dismiss="${n.id}" title="Dismiss">${window.GoldenGateIcons.getUiIcon('close', 10)}</button>
            </div>
          </div>
          <div class="ac-notif-body">${n.body}</div>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-dismiss]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.dismiss;
        notifications = notifications.filter((n) => n.id !== id);
        saveNotifications();
        renderNotifications();
      };
    });
  }

  // ==========================================================================
  // Desktop Icons & iOS Groups
  // ==========================================================================
  function renderSingleItemVisual(item, size = 26) {
    if (item.type === 'app') {
      return window.GoldenGateIcons.getIconSVG(item.icon || item.appId, size);
    }
    if (item.type === 'shortcut') {
      if (item.logoDataUrl) {
        return `<img class="web-logo-img" src="${item.logoDataUrl}" alt="" style="width:${size}px;height:${size}px;" />`;
      }
      return window.GoldenGateIcons.getIconSVG('shortcut', size);
    }
    if (item.type === 'group') {
      const children = (item.items || []).slice(0, 4);
      return `
        <div class="group-mini-grid">
          ${[0, 1, 2, 3]
            .map((i) => {
              const child = children[i];
              if (!child) return `<div class="group-mini-cell"></div>`;
              return `<div class="group-mini-cell">${renderSingleItemVisual(child, 12)}</div>`;
            })
            .join('')}
        </div>
      `;
    }
    return '';
  }

  function resolveAllShortcutLogos() {
    function checkItem(it) {
      if (it.type === 'shortcut' && it.url && !it.logoDataUrl) {
        window.GoldenGateIcons.extractWebsiteLogo(it.url, (dataUrl) => {
          if (dataUrl) {
            it.logoDataUrl = dataUrl;
            saveDesktopState();
            renderDesktopIcons();
          }
        });
      } else if (it.type === 'group' && Array.isArray(it.items)) {
        it.items.forEach(checkItem);
      }
    }
    desktopItems.forEach(checkItem);
  }

  function renderDesktopIcons() {
    const canvas = document.getElementById('desktop-icons-grid');
    if (!canvas) return;

    canvas.innerHTML = desktopItems
      .map(
        (item) => `
        <div class="desktop-icon-box ${item.id === lastCreatedGroupId ? 'group-created-anim' : ''}" data-id="${item.id}" style="left:${item.x}px;top:${item.y}px;">
          <div class="liquidgl-icon-lens">
            ${renderSingleItemVisual(item, 28)}
          </div>
          <span class="desktop-icon-label">${item.title}</span>
        </div>
      `
      )
      .join('');
    lastCreatedGroupId = null;

    canvas.querySelectorAll('.desktop-icon-box').forEach((box) => {
      const id = box.dataset.id;
      const item = desktopItems.find((i) => i.id === id);
      if (!item) return;

      let isDragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let origX = 0;
      let origY = 0;
      let hoverTargetId = null;

      box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        canvas.querySelectorAll('.desktop-icon-box').forEach((b) => b.classList.remove('selected'));
        box.classList.add('selected');
        selectedItem = item;

        isDragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        origX = item.x;
        origY = item.y;
        box.setPointerCapture(e.pointerId);
      });

      box.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          moved = true;
          box.classList.add('dragging');
        }
        if (!moved) return;

        item.x = Math.max(8, Math.min(window.innerWidth - 90, origX + dx));
        item.y = Math.max(8, Math.min(window.innerHeight - 140, origY + dy));
        box.style.left = `${item.x}px`;
        box.style.top = `${item.y}px`;

        hoverTargetId = null;
        canvas.querySelectorAll('.desktop-icon-box').forEach((otherBox) => {
          otherBox.classList.remove('drop-target');
          const otherId = otherBox.dataset.id;
          if (otherId === item.id) return;
          const otherItem = desktopItems.find((i) => i.id === otherId);
          if (!otherItem) return;
          if (item.type === 'group' && otherItem.type === 'group') return;

          const dist = Math.hypot(item.x - otherItem.x, item.y - otherItem.y);
          if (dist < 48 && !hoverTargetId) {
            hoverTargetId = otherId;
            otherBox.classList.add('drop-target');
          }
        });
      });

      box.addEventListener('pointerup', () => {
        if (!isDragging) return;
        isDragging = false;
        box.classList.remove('dragging');
        canvas.querySelectorAll('.desktop-icon-box').forEach((b) => b.classList.remove('drop-target'));

        if (moved && hoverTargetId) {
          mergeItemsIntoGroup(item.id, hoverTargetId);
          return;
        }

        if (moved) {
          saveDesktopState();
        }
      });

      box.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        triggerDesktopItem(item);
      });

      box.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!moved && item.type === 'group') {
          openGroupPopover(item.id);
        }
      });

      box.addEventListener('contextmenu', () => {
        canvas.querySelectorAll('.desktop-icon-box').forEach((b) => b.classList.remove('selected'));
        box.classList.add('selected');
        selectedItem = item;
      });
    });

    resolveAllShortcutLogos();
    renderStartMenu();
  }

  function mergeItemsIntoGroup(draggedId, targetId) {
    const draggedIdx = desktopItems.findIndex((i) => i.id === draggedId);
    const targetIdx = desktopItems.findIndex((i) => i.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const dragged = desktopItems[draggedIdx];
    const target = desktopItems[targetIdx];

    if (target.type === 'group') {
      target.items = target.items || [];
      target.items.push(dragged);
      lastCreatedGroupId = target.id;
      desktopItems.splice(draggedIdx, 1);
    } else if (dragged.type === 'group') {
      dragged.items = dragged.items || [];
      dragged.items.push(target);
      dragged.x = target.x;
      dragged.y = target.y;
      lastCreatedGroupId = dragged.id;
      desktopItems.splice(targetIdx, 1);
    } else {
      const newGroup = {
        id: 'grp-' + Date.now(),
        type: 'group',
        title: 'group',
        x: target.x,
        y: target.y,
        items: [target, dragged]
      };
      lastCreatedGroupId = newGroup.id;
      desktopItems[targetIdx] = newGroup;
      desktopItems.splice(draggedIdx, 1);
    }

    saveDesktopState();
    renderDesktopIcons();
  }

  function openGroupPopover(groupId) {
    const grp = desktopItems.find((i) => i.id === groupId && i.type === 'group');
    if (!grp) return;

    const backdrop = document.getElementById('group-popover-backdrop');
    const titleInput = document.getElementById('group-title-input');
    const grid = document.getElementById('group-items-grid');
    if (!backdrop || !titleInput || !grid) return;

    backdrop.style.zIndex = ++topZ;

    titleInput.value = grp.title;
    titleInput.oninput = () => {
      grp.title = titleInput.value.trim() || 'group';
      saveDesktopState();
      renderDesktopIcons();
    };

    grid.innerHTML = (grp.items || [])
      .map(
        (child, idx) => `
        <div class="group-item-card" data-idx="${idx}" style="--item-idx:${idx};">
          <div class="liquidgl-icon-lens">
            ${renderSingleItemVisual(child, 26)}
          </div>
          <span class="desktop-icon-label">${child.title}</span>
          <button class="group-item-ungroup" data-ungroup="${idx}" title="Move to Desktop">${window.GoldenGateIcons.getUiIcon('close', 10)}</button>
        </div>
      `
      )
      .join('');

    grid.querySelectorAll('.group-item-card').forEach((card) => {
      const idx = Number(card.dataset.idx);
      card.onclick = (e) => {
        if (e.target.closest('.group-item-ungroup')) return;
        backdrop.classList.add('hidden');
        triggerDesktopItem(grp.items[idx]);
      };
    });

    grid.querySelectorAll('.group-item-ungroup').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.ungroup);
        const [removed] = grp.items.splice(idx, 1);
        if (removed) {
          removed.x = Math.min(window.innerWidth - 100, grp.x + 96);
          removed.y = grp.y;
          desktopItems.push(removed);
        }
        if (grp.items.length === 1) {
          const last = grp.items[0];
          last.x = grp.x;
          last.y = grp.y;
          const gIdx = desktopItems.findIndex((i) => i.id === grp.id);
          if (gIdx !== -1) desktopItems[gIdx] = last;
          backdrop.classList.add('hidden');
        } else if (grp.items.length === 0) {
          desktopItems = desktopItems.filter((i) => i.id !== grp.id);
          backdrop.classList.add('hidden');
        } else {
          openGroupPopover(grp.id);
        }
        saveDesktopState();
        renderDesktopIcons();
      };
    });

    backdrop.classList.remove('hidden');
  }

  function triggerDesktopItem(item) {
    if (!item) return;
    if (item.type === 'app') {
      launchApp(item.appId);
    } else if (item.type === 'shortcut') {
      openUrlInBrowser(item.url, item.title);
    } else if (item.type === 'group') {
      openGroupPopover(item.id);
    }
  }

  function getAllShortcuts() {
    const list = [];
    desktopItems.forEach((it) => {
      if (it.type === 'shortcut') list.push(it);
      else if (it.type === 'group' && Array.isArray(it.items)) {
        it.items.forEach((c) => {
          if (c.type === 'shortcut') list.push(c);
        });
      }
    });
    return list;
  }

  function addWebsiteShortcut({ title, url }) {
    if (!url) return;
    let u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('aero://')) {
      u = 'https://' + u;
    }
    const cleanTitle = (title || u).trim().toLowerCase().split(/\s+/)[0];
    const count = desktopItems.length;
    const col = Math.floor(count / 5);
    const row = count % 5;

    const newItem = {
      id: 'sc-' + Date.now(),
      type: 'shortcut',
      title: cleanTitle,
      url: u,
      logoDataUrl: '',
      x: 20 + col * 96,
      y: 20 + row * 104
    };

    desktopItems.push(newItem);
    saveDesktopState();
    renderDesktopIcons();
    pushNotification({
      title: 'Shortcut Saved',
      body: `${cleanTitle} pinned to desktop`,
      category: 'download'
    });
  }

  function removeShortcut(id) {
    desktopItems = desktopItems.filter((i) => i.id !== id);
    desktopItems.forEach((i) => {
      if (i.type === 'group' && Array.isArray(i.items)) {
        i.items = i.items.filter((c) => c.id !== id);
      }
    });
    saveDesktopState();
    renderDesktopIcons();
  }

  function arrangeDesktopGrid() {
    let col = 0;
    let row = 0;
    desktopItems.forEach((item) => {
      item.x = 20 + col * 96;
      item.y = 20 + row * 104;
      row++;
      if (row >= 5) {
        row = 0;
        col++;
      }
    });
    saveDesktopState();
    renderDesktopIcons();
  }

  // ==========================================================================
  // Day & 6-Hour Weather Forecast Flyout
  // ==========================================================================
  function decodeWeatherCode(code) {
    const ui = window.GoldenGateIcons.getUiIcon;
    if (code === 0) return { label: 'Clear Sky', icon: ui('sun', 14) };
    if (code <= 3) return { label: 'Partly Cloudy', icon: ui('cloud', 14) };
    if (code <= 48) return { label: 'Fog', icon: ui('cloud', 14) };
    if (code <= 67) return { label: 'Rain', icon: ui('rain', 14) };
    if (code <= 77) return { label: 'Snow', icon: ui('snow', 14) };
    return { label: 'Storm', icon: ui('storm', 14) };
  }

  async function refreshDayAndWeather() {
    const dateEl = document.getElementById('day-flyout-date');
    const locEl = document.getElementById('day-flyout-loc');
    const tempMainEl = document.getElementById('day-temp-main');
    const condTextEl = document.getElementById('day-cond-text');
    const extraEl = document.getElementById('day-extra-stats');
    const hourlyGrid = document.getElementById('day-hourly-grid');
    const miniWeather = document.getElementById('taskbar-weather-mini');

    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }

    let lat = 37.7749;
    let lon = -122.4194;
    let city = 'San Francisco, CA';

    try {
      const ipRes = await fetch('https://ipapi.co/json/');
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.latitude && ipData.longitude) {
          lat = ipData.latitude;
          lon = ipData.longitude;
          city = `${ipData.city || 'Local'}, ${ipData.region_code || ipData.country_name || ''}`;
        }
      }
    } catch (e) {}

    if (locEl) locEl.textContent = city;

    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
      const wRes = await fetch(weatherUrl);
      if (wRes.ok) {
        const wData = await wRes.json();
        const curTemp = Math.round(wData.current?.temperature_2m ?? 68);
        const curCode = wData.current?.weather_code ?? 1;
        const curHum = Math.round(wData.current?.relative_humidity_2m ?? 62);
        const curWind = Math.round(wData.current?.wind_speed_10m ?? 8);
        const cond = decodeWeatherCode(curCode);

        if (tempMainEl) tempMainEl.textContent = `${curTemp}°F`;
        if (condTextEl) condTextEl.innerHTML = `${cond.icon} <span>${cond.label}</span>`;
        if (extraEl) extraEl.textContent = `Humidity ${curHum}% / Wind ${curWind} mph`;
        if (miniWeather) {
          miniWeather.style.display = 'inline-flex';
          miniWeather.style.alignItems = 'center';
          miniWeather.style.gap = '4px';
          miniWeather.innerHTML = `${cond.icon} <span>${curTemp}°F</span>`;
        }

        const times = wData.hourly?.time || [];
        const temps = wData.hourly?.temperature_2m || [];
        const codes = wData.hourly?.weather_code || [];
        const probs = wData.hourly?.precipitation_probability || [];

        const curHourIso = now.toISOString().slice(0, 13);
        let startIdx = times.findIndex((t) => t.startsWith(curHourIso));
        if (startIdx < 0) startIdx = now.getHours();

        const next6 = [];
        for (let i = 1; i <= 6; i++) {
          const idx = (startIdx + i) % Math.max(1, times.length);
          const dt = times[idx] ? new Date(times[idx]) : new Date(now.getTime() + i * 3600000);
          const hrStr = dt.toLocaleTimeString([], { hour: 'numeric' });
          const cInfo = decodeWeatherCode(codes[idx] ?? 1);
          next6.push({
            time: hrStr,
            icon: cInfo.icon,
            temp: Math.round(temps[idx] ?? curTemp),
            rain: probs[idx] ?? 0
          });
        }

        if (hourlyGrid) {
          hourlyGrid.innerHTML = next6
            .map(
              (h) => `
              <div class="day-hour-card">
                <span class="day-hour-time">${h.time}</span>
                <span style="display:inline-flex;align-items:center;">${h.icon}</span>
                <span class="day-hour-temp">${h.temp}°</span>
                <span class="day-hour-rain">${h.rain}%</span>
              </div>
            `
            )
            .join('');
        }
      }
    } catch (e) {}
  }

  // ==========================================================================
  // Persistent Window State & Window Management (No Animation Replay on Focus)
  // ==========================================================================
  let isRestoringWindows = false;

  function saveWindowsState() {
    if (isRestoringWindows) return;
    try {
      const stateObj = {};
      openWindows.forEach((rec, appId) => {
        stateObj[appId] = {
          left: rec.el.offsetLeft,
          top: rec.el.offsetTop,
          width: rec.el.offsetWidth,
          height: rec.el.offsetHeight,
          maximized: Boolean(rec.maximized),
          minimized: Boolean(rec.minimized)
        };
      });
      localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(stateObj));
    } catch (e) {}
  }

  function restoreSavedWindows() {
    try {
      const raw = localStorage.getItem(WINDOWS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      isRestoringWindows = true;
      Object.keys(saved).forEach((appId) => {
        const geom = saved[appId];
        launchApp(appId, { restoredGeometry: geom });
      });
      isRestoringWindows = false;
      saveWindowsState();
    } catch (e) {
      isRestoringWindows = false;
    }
  }

  // Only elevate z-index without re-triggering animation classes
  function focusWindow(appId) {
    const entry = openWindows.get(appId);
    if (!entry) return;
    entry.el.style.zIndex = ++topZ;
    openWindows.forEach((v, k) => {
      v.el.classList.toggle('focused', k === appId && !v.minimized);
    });
    renderTaskbarApps();
    window.dispatchEvent(new CustomEvent('os:app-event', { detail: { type: 'app:focused', appId } }));
  }

  function getActiveScreenContext() {
    let focusedApp = null;
    const openAppIds = [];
    openWindows.forEach((v, k) => {
      if (!v.minimized) openAppIds.push(k);
      if (!v.minimized && v.el.classList.contains('focused')) {
        focusedApp = k;
      }
    });

    const activeNote = window.GoldenGateApps.notesApi?.getActiveNote() || null;
    const allNotes = window.GoldenGateApps.notesApi?.getAllNotes() || [];
    const curTrack = window.GoldenGateMusic?.getCurrentTrack() || null;
    const shortcuts = getAllShortcuts();
    const codeText = localStorage.getItem('webos_code_editor_v1') || '';

    let aeroUrl = '';
    const aeroInput = document.querySelector('#hel-url-input');
    if (aeroInput) aeroUrl = aeroInput.value;

    return {
      focusedApp,
      openApps: openAppIds,
      activeNote,
      allNotes,
      currentTrack: curTrack,
      shortcuts,
      codeSnippet: codeText.slice(0, 400),
      aeroUrl,
      externalBrowserBlocked: Boolean(
        focusedApp === 'aero' && aeroUrl && !aeroUrl.startsWith('aero://')
      )
    };
  }

  function closeApp(appId) {
    const entry = openWindows.get(appId);
    if (!entry) return false;
    entry.el.remove();
    openWindows.delete(appId);
    saveWindowsState();
    renderTaskbarApps();
    return true;
  }

  function applyWindowSpringTransition(winEl) {
    winEl.classList.add('spring-geom');
    setTimeout(() => winEl.classList.remove('spring-geom'), 420);
  }

  function launchApp(appId, options = {}) {
    const appDef = window.GoldenGateApps.getApps().find((a) => a.id === appId);
    if (!appDef) return;

    if (openWindows.has(appId)) {
      const existing = openWindows.get(appId);
      if (existing.minimized) {
        existing.minimized = false;
        existing.el.classList.remove('minimized', 'minimizing');
      }
      focusWindow(appId);
      if (appId === 'aero' && options.initialUrl && existing.controller?.navigate) {
        existing.controller.navigate(options.initialUrl, options.initialTitle);
      }
      if (appId === 'wallpaper' && options.tab) {
        const bodyEl = existing.el.querySelector('.window-body');
        window.GoldenGateApps.mountAppContent('wallpaper', bodyEl, options);
      }
      saveWindowsState();
      return;
    }

    const container = document.getElementById('windows-container');
    const winEl = document.createElement('section');
    winEl.className = 'liquidgl-card app-window focused';

    const geom = options.restoredGeometry;
    const offset = (openWindows.size % 5) * 24;
    const initW = geom?.width || appDef.width;
    const initH = geom?.height || appDef.height;
    const initL = geom?.left !== undefined ? geom.left : Math.max(110, 170 + offset);
    const initT = geom?.top !== undefined ? geom.top : Math.max(16, 26 + offset);

    winEl.style.width = `${initW}px`;
    winEl.style.height = `${initH}px`;
    winEl.style.left = `${initL}px`;
    winEl.style.top = `${initT}px`;
    winEl.style.zIndex = ++topZ;

    winEl.innerHTML = `
      <header class="window-header">
        <div class="window-traffic-lights">
          <button class="traffic-btn traffic-close" title="Close"></button>
          <button class="traffic-btn traffic-min" title="Minimize"></button>
          <button class="traffic-btn traffic-max" title="Maximize"></button>
        </div>
        <span class="window-title">${appDef.title}</span>
        <div style="width:42px;"></div>
      </header>
      <div class="window-body"></div>
      <div class="window-resize-handle"></div>
    `;

    container.appendChild(winEl);
    const bodyEl = winEl.querySelector('.window-body');
    const controller = window.GoldenGateApps.mountAppContent(appId, bodyEl, options);

    const record = {
      el: winEl,
      controller,
      minimized: Boolean(geom?.minimized),
      maximized: Boolean(geom?.maximized),
      restoreBounds: null
    };

    if (record.maximized) {
      winEl.classList.add('maximized');
    }
    if (record.minimized) {
      winEl.classList.add('minimized');
      winEl.classList.remove('focused');
    }

    openWindows.set(appId, record);

    winEl.querySelector('.traffic-close').onclick = (e) => {
      e.stopPropagation();
      closeApp(appId);
    };

    winEl.querySelector('.traffic-min').onclick = (e) => {
      e.stopPropagation();
      record.minimized = true;
      winEl.classList.remove('focused');
      winEl.classList.add('minimizing');
      setTimeout(() => {
        if (record.minimized) {
          winEl.classList.remove('minimizing');
          winEl.classList.add('minimized');
        }
      }, 280);
      saveWindowsState();
      renderTaskbarApps();
    };

    winEl.querySelector('.traffic-max').onclick = (e) => {
      e.stopPropagation();
      applyWindowSpringTransition(winEl);
      record.maximized = !record.maximized;
      winEl.classList.toggle('maximized', record.maximized);
      saveWindowsState();
    };

    winEl.addEventListener('pointerdown', () => focusWindow(appId));

    // Window Dragging + Edge Snapping with Preview Box
    const header = winEl.querySelector('.window-header');
    const snapPreview = document.getElementById('snap-preview-box');

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      focusWindow(appId);

      if (record.maximized) {
        record.maximized = false;
        winEl.classList.remove('maximized');
      }

      const sx = e.clientX;
      const sy = e.clientY;
      const ox = winEl.offsetLeft;
      const oy = winEl.offsetTop;
      let pendingSnap = null;

      function getSnapTarget(cx, cy) {
        const padBottom = 76;
        const availH = window.innerHeight - padBottom;
        const availW = window.innerWidth;
        if (cy <= 14) {
          return { mode: 'full', left: 8, top: 8, width: availW - 16, height: availH - 12 };
        }
        if (cx <= 18) {
          return { mode: 'left', left: 8, top: 8, width: Math.round(availW / 2) - 12, height: availH - 12 };
        }
        if (cx >= availW - 18) {
          return {
            mode: 'right',
            left: Math.round(availW / 2) + 4,
            top: 8,
            width: Math.round(availW / 2) - 12,
            height: availH - 12
          };
        }
        return null;
      }

      function move(ev) {
        winEl.style.left = `${ox + (ev.clientX - sx)}px`;
        winEl.style.top = `${Math.max(0, oy + (ev.clientY - sy))}px`;

        pendingSnap = getSnapTarget(ev.clientX, ev.clientY);
        if (snapPreview) {
          if (pendingSnap) {
            snapPreview.style.left = `${pendingSnap.left}px`;
            snapPreview.style.top = `${pendingSnap.top}px`;
            snapPreview.style.width = `${pendingSnap.width}px`;
            snapPreview.style.height = `${pendingSnap.height}px`;
            snapPreview.classList.remove('hidden');
          } else {
            snapPreview.classList.add('hidden');
          }
        }
      }

      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (snapPreview) snapPreview.classList.add('hidden');

        if (pendingSnap) {
          applyWindowSpringTransition(winEl);
          winEl.style.left = `${pendingSnap.left}px`;
          winEl.style.top = `${pendingSnap.top}px`;
          winEl.style.width = `${pendingSnap.width}px`;
          winEl.style.height = `${pendingSnap.height}px`;
        }
        saveWindowsState();
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    const resizer = winEl.querySelector('.window-resize-handle');
    resizer.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      focusWindow(appId);
      const sx = e.clientX;
      const sy = e.clientY;
      const ow = winEl.offsetWidth;
      const oh = winEl.offsetHeight;

      function move(ev) {
        winEl.style.width = `${Math.max(320, ow + (ev.clientX - sx))}px`;
        winEl.style.height = `${Math.max(240, oh + (ev.clientY - sy))}px`;
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        saveWindowsState();
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    focusWindow(appId);
    saveWindowsState();
  }

  function openUrlInBrowser(url, title) {
    launchApp('aero', { initialUrl: url, initialTitle: title });
  }

  // ==========================================================================
  // Taskbar Pinning & Dynamic App Dock
  // ==========================================================================
  const TASKBAR_PINNED_STORAGE_KEY = 'webos_taskbar_pinned_v3';
  const DEFAULT_PINNED_APPS = ['aero', 'music', 'games', 'code', 'files', 'wallpaper', 'terminal', 'monitor', 'account'];
  const REMOVED_APPS = new Set(['photos', 'notes', 'calc', 'glass']);
  let pinnedAppIds = [...DEFAULT_PINNED_APPS];
  try {
    const rawPinned = localStorage.getItem(TASKBAR_PINNED_STORAGE_KEY);
    if (rawPinned) {
      const parsed = JSON.parse(rawPinned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        pinnedAppIds = parsed.filter(id => !REMOVED_APPS.has(id));
        DEFAULT_PINNED_APPS.forEach(id => {
          if (!pinnedAppIds.includes(id)) pinnedAppIds.push(id);
        });
      }
    }
  } catch (e) {}

  function savePinnedApps() {
    try {
      localStorage.setItem(TASKBAR_PINNED_STORAGE_KEY, JSON.stringify(pinnedAppIds));
    } catch (e) {}
  }

  function isAppPinned(appId) {
    return pinnedAppIds.includes(appId);
  }

  function pinApp(appId) {
    if (!pinnedAppIds.includes(appId)) {
      pinnedAppIds.push(appId);
      savePinnedApps();
      renderTaskbarApps();
      showToast('Pinned to taskbar');
    }
  }

  function unpinApp(appId) {
    pinnedAppIds = pinnedAppIds.filter((id) => id !== appId);
    savePinnedApps();
    renderTaskbarApps();
    showToast('Unpinned from taskbar');
  }

  function togglePinApp(appId) {
    if (isAppPinned(appId)) {
      unpinApp(appId);
    } else {
      pinApp(appId);
    }
  }

  let taskbarContextAppId = null;

  function openTaskbarContextMenu(appId, clientX, clientY) {
    closeOverlays();
    const menu = document.getElementById('taskbar-context-menu');
    if (!menu) return;

    taskbarContextAppId = appId;
    const appDef = window.GoldenGateApps.getApps().find((a) => a.id === appId);
    const titleEl = document.getElementById('taskbar-ctx-title');
    const pinLabel = document.getElementById('taskbar-ctx-pin-label');
    const closeBtn = document.getElementById('taskbar-ctx-close');

    if (titleEl) titleEl.textContent = appDef ? appDef.title : appId;
    const isPinned = isAppPinned(appId);
    if (pinLabel) pinLabel.textContent = isPinned ? 'Unpin from Taskbar' : 'Pin to Taskbar';

    const isRunning = openWindows.has(appId);
    if (closeBtn) closeBtn.classList.toggle('hidden', !isRunning);

    menu.classList.remove('hidden');
    menu.style.zIndex = ++topZ;

    const menuWidth = 200;
    const menuHeight = 110;
    const x = Math.min(window.innerWidth - menuWidth - 10, Math.max(10, clientX - menuWidth / 2));
    const y = Math.max(10, clientY - menuHeight - 10);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function renderTaskbarApps() {
    const bar = document.getElementById('taskbar-apps');
    if (!bar) return;

    const allApps = window.GoldenGateApps.getApps();
    const allAppsMap = new Map(allApps.map((a) => [a.id, a]));

    const appIdsToRender = [];
    pinnedAppIds.forEach((id) => {
      if (allAppsMap.has(id) && !appIdsToRender.includes(id)) {
        appIdsToRender.push(id);
      }
    });
    openWindows.forEach((_, id) => {
      if (allAppsMap.has(id) && !appIdsToRender.includes(id)) {
        appIdsToRender.push(id);
      }
    });

    bar.innerHTML = appIdsToRender
      .map((id) => {
        const app = allAppsMap.get(id);
        const w = openWindows.get(id);
        const running = Boolean(w);
        const focused = Boolean(w && !w.minimized && w.el.classList.contains('focused'));
        return `
          <button class="taskbar-app-btn ${running ? 'running' : ''} ${focused ? 'focused' : ''}" data-id="${app.id}" title="${app.title}">
            ${window.GoldenGateIcons.getIconSVG(app.icon, 20)}
          </button>
        `;
      })
      .join('');

    bar.querySelectorAll('.taskbar-app-btn').forEach((btn) => {
      const id = btn.dataset.id;
      btn.onclick = () => {
        const w = openWindows.get(id);
        if (!w) {
          launchApp(id);
        } else if (w.minimized) {
          w.minimized = false;
          w.el.classList.remove('minimized', 'minimizing');
          focusWindow(id);
          saveWindowsState();
        } else {
          focusWindow(id);
        }
      };

      btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTaskbarContextMenu(id, e.clientX, e.clientY);
      };
    });
  }

  function initDockMagnification() {
    const bar = document.getElementById('taskbar-apps');
    if (!bar) return;

    bar.addEventListener('pointermove', (e) => {
      const buttons = bar.querySelectorAll('.taskbar-app-btn');
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const dist = Math.abs(e.clientX - centerX);
        const maxDist = 68;
        if (dist < maxDist) {
          const factor = Math.cos((dist / maxDist) * (Math.PI / 2));
          const scale = 1 + factor * 0.12;
          const lift = factor * 2.5;
          btn.style.transform = `translateY(-${lift.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        } else {
          btn.style.transform = '';
        }
      });
    });

    bar.addEventListener('pointerleave', () => {
      bar.querySelectorAll('.taskbar-app-btn').forEach((btn) => {
        btn.style.transform = '';
      });
    });
  }

  function renderStartMenu() {
    const grid = document.getElementById('start-apps-grid');
    if (!grid) return;
    grid.innerHTML = window.GoldenGateApps.getApps()
      .map(
        (a) => `
        <div class="start-app-card" data-id="${a.id}">
          <div class="liquidgl-icon-lens" style="width:42px;height:42px;">
            ${window.GoldenGateIcons.getIconSVG(a.icon, 22)}
          </div>
          <span>${a.title}</span>
        </div>
      `
      )
      .join('');

    grid.querySelectorAll('.start-app-card').forEach((c) => {
      c.onclick = () => {
        closeOverlays();
        launchApp(c.dataset.id);
      };
      c.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openTaskbarContextMenu(c.dataset.id, e.clientX, e.clientY);
      };
    });
  }

  // ==========================================================================
  // Search Flyout
  // ==========================================================================
  function renderSearch(q = '') {
    const list = document.getElementById('search-results-list');
    if (!list) return;
    const query = q.trim().toLowerCase();
    const rows = [];

    window.GoldenGateApps.getApps().forEach((a) => {
      if (!query || a.title.includes(query)) {
        rows.push({
          title: a.title,
          icon: window.GoldenGateIcons.getIconSVG(a.icon, 18),
          run: () => launchApp(a.id)
        });
      }
    });

    getAllShortcuts().forEach((s) => {
      if (!query || s.title.toLowerCase().includes(query) || s.url.toLowerCase().includes(query)) {
        rows.push({
          title: s.title,
          icon: renderSingleItemVisual(s, 18),
          run: () => openUrlInBrowser(s.url, s.title)
        });
      }
    });

    if (query.length > 0) {
      const isDomain = query.includes('.') && !query.includes(' ');
      const directWebUrl = isDomain
        ? 'https://' + query.replace(/^https?:\/\//, '')
        : 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q.trim());

      rows.push({
        title: `Web Search: ${q.trim()}`,
        icon: window.GoldenGateIcons.getIconSVG('aero', 18),
        run: () => openUrlInBrowser(directWebUrl, q.trim()),
        pin: { title: q.trim(), url: directWebUrl }
      });
    }

    list.innerHTML = rows
      .map(
        (r, i) => `
        <div class="search-row" data-idx="${i}">
          <div class="search-row-left">
            ${r.icon}
            <span>${r.title}</span>
          </div>
          ${r.pin ? `<button class="btn-flat s-pin" data-idx="${i}">Pin</button>` : ''}
        </div>
      `
      )
      .join('');

    list.querySelectorAll('.search-row').forEach((el) => {
      const i = Number(el.dataset.idx);
      el.onclick = (e) => {
        if (e.target.closest('.s-pin')) return;
        closeOverlays();
        rows[i].run();
      };
    });

    list.querySelectorAll('.s-pin').forEach((b) => {
      const i = Number(b.dataset.idx);
      b.onclick = (e) => {
        e.stopPropagation();
        addWebsiteShortcut(rows[i].pin);
      };
    });
  }

  // ==========================================================================
  // Terminal & Droplet Command Runner
  // ==========================================================================
  function runTerminalCommand(rawCmd) {
    const clean = (rawCmd || '').trim();
    if (!clean) return 'No command entered.';
    const parts = clean.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg1 = parts[1] ? parts[1].toLowerCase() : '';
    const rest = parts.slice(1).join(' ');

    if (cmd === 'help') {
      return 'Commands: app-open <app>, app-close <app>, music-play [query], music-pause, set-volume <0-100>, set-tint <hex|bw>, weather-fetch, shortcut <name> <url>, clear';
    }

    if (cmd === 'app-open' && arg1) {
      launchApp(arg1);
      return `Opened ${arg1}`;
    }

    if (cmd === 'app-close' && arg1) {
      const ok = closeApp(arg1);
      return ok ? `Closed ${arg1}` : `${arg1} is not open`;
    }

    if (cmd === 'music-playlist' && rest) {
      const res = window.GoldenGateMusic.playPlaylist(rest);
      if (res && res.success) {
        return `Playing playlist "${res.name}" (${res.count} tracks)`;
      }
      return `Playlist "${rest}" not found or empty`;
    }

    if (cmd === 'music-play') {
      if (rest) {
        const matchedPl = window.GoldenGateMusic.findPlaylist(rest);
        if (matchedPl && matchedPl.tracks && matchedPl.tracks.length > 0) {
          const res = window.GoldenGateMusic.playPlaylist(rest);
          return `Playing playlist "${res.name}" (${res.count} tracks)`;
        }
        window.GoldenGateMusic.searchYouTubeMusic(rest).then((tracks) => {
          if (tracks && tracks.length > 0) {
            window.GoldenGateMusic.playTrack(tracks[0], tracks);
          }
        });
        return `Playing ${rest}`;
      }
      const cur = window.GoldenGateMusic.getCurrentTrack();
      if (cur) {
        if (!window.GoldenGateMusic.isPlaying()) window.GoldenGateMusic.togglePlay();
        return `Resumed ${cur.title}`;
      }
      const recs = window.GoldenGateMusic.getHomeRecommendations();
      if (recs.length > 0) {
        window.GoldenGateMusic.playTrack(recs[0], recs);
        return `Playing ${recs[0].title}`;
      }
      return 'No tracks queued';
    }

    if (cmd === 'music-pause') {
      if (window.GoldenGateMusic.isPlaying()) {
        window.GoldenGateMusic.togglePlay();
      }
      return 'Music paused';
    }

    if (cmd === 'set-volume' && parts[1] !== undefined) {
      const pct = Math.max(0, Math.min(100, Number(parts[1]) || 0));
      setMasterVolume(pct / 100);
      return `Master volume set to ${pct}%`;
    }

    if ((cmd === 'set-tint' || cmd === 'tint') && parts[1]) {
      if (arg1 === 'bw') {
        window.LiquidGLEngine.setState({ tintMode: 'bw', tintColor: '#ffffff', tintName: 'B&W' });
        return 'Tint set to B&W';
      }
      window.LiquidGLEngine.setState({ tintMode: 'tinted', tintColor: parts[1], tintName: parts[1] });
      return `Tint set to ${parts[1]}`;
    }

    if (cmd === 'bw') {
      window.LiquidGLEngine.setState({ tintMode: 'bw', tintColor: '#ffffff', tintName: 'B&W' });
      return 'Tint set to B&W';
    }

    if (cmd === 'weather-fetch') {
      const dayFlyout = document.getElementById('day-flyout');
      if (dayFlyout) {
        dayFlyout.style.zIndex = ++topZ;
        dayFlyout.classList.remove('hidden');
      }
      refreshDayAndWeather();
      return 'Fetching live weather forecast';
    }

    if (cmd === 'shortcut' && parts[1] && parts[2]) {
      addWebsiteShortcut({ title: parts[1], url: parts[2] });
      return `Shortcut created: ${parts[1]}`;
    }

    return `Unknown command: ${cmd}. Type help for available commands.`;
  }

  function setMasterVolume(fraction) {
    masterVolume = Math.max(0, Math.min(1, Number(fraction)));
    const slider = document.getElementById('taskbar-master-volume');
    if (slider) slider.value = String(Math.round(masterVolume * 100));
    window.GoldenGateMusic.setVolume(masterVolume);
  }

  // ==========================================================================
  // macOS Context Menu
  // ==========================================================================
  function initContextMenu() {
    const menu = document.getElementById('custom-context-menu');
    if (!menu) return;

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!e.target.closest('.desktop-icon-box')) {
        selectedItem = null;
        document.querySelectorAll('.desktop-icon-box').forEach((b) => b.classList.remove('selected'));
      }

      document.getElementById('ctx-open-target')?.classList.toggle('hidden', !selectedItem);
      document.getElementById('ctx-delete-shortcut')?.classList.toggle(
        'hidden',
        !selectedItem || selectedItem.type !== 'shortcut'
      );
      const isApp = selectedItem && selectedItem.type === 'app';
      const pinTaskbarItem = document.getElementById('ctx-pin-taskbar');
      const pinTaskbarLabel = document.getElementById('ctx-pin-taskbar-label');
      if (pinTaskbarItem) {
        pinTaskbarItem.classList.toggle('hidden', !isApp);
        if (isApp) {
          const appId = selectedItem.appId || selectedItem.id;
          if (pinTaskbarLabel) {
            pinTaskbarLabel.textContent = isAppPinned(appId) ? 'Unpin from Taskbar' : 'Pin to Taskbar';
          }
        }
      }

      menu.classList.remove('hidden');
      const x = Math.min(window.innerWidth - 230, Math.max(8, e.clientX));
      const y = Math.min(window.innerHeight - 350, Math.max(8, e.clientY));
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    menu.querySelectorAll('[data-ctx]').forEach((btn) => {
      btn.onclick = () => {
        const act = btn.dataset.ctx;
        closeOverlays();
        if (act === 'open-aero') launchApp('aero');
        else if (act === 'open-music') launchApp('music');
        else if (act === 'open-games') launchApp('games');
        else if (act === 'new-website-shortcut') openShortcutModal();
        else if (act === 'open-target' && selectedItem) {
          triggerDesktopItem(selectedItem);
        } else if (act === 'pin-taskbar' && selectedItem && selectedItem.type === 'app') {
          const appId = selectedItem.appId || selectedItem.id;
          togglePinApp(appId);
        } else if (act === 'delete-shortcut' && selectedItem?.type === 'shortcut') {
          removeShortcut(selectedItem.id);
        } else if (act === 'open-wallpaper-local') {
          document.getElementById('local-wallpaper-input')?.click();
        } else if (act === 'open-wallpaper-repo') {
          launchApp('wallpaper', { tab: 'repo' });
        } else if (act === 'arrange-icons') {
          arrangeDesktopGrid();
        }
      };
    });

    menu.querySelectorAll('.mac-swatch').forEach((sw) => {
      sw.onclick = () => {
        menu.querySelectorAll('.mac-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        window.LiquidGLEngine.setState({
          tintMode: sw.dataset.mode,
          tintColor: sw.dataset.color,
          tintName: sw.dataset.name
        });
      };
    });

    document.getElementById('ctx-custom-color')?.addEventListener('input', (e) => {
      window.LiquidGLEngine.setState({
        tintMode: 'tinted',
        tintColor: e.target.value,
        tintName: 'Custom'
      });
    });

    document.getElementById('ctx-liquidgl-toggle')?.addEventListener('change', (e) => {
      window.LiquidGLEngine.setState({ enabled: e.target.checked });
    });

    document.getElementById('ctx-lgl-refraction')?.addEventListener('input', (e) => {
      window.LiquidGLEngine.setState({ refraction: Number(e.target.value) });
    });

    document.getElementById('ctx-lgl-frost')?.addEventListener('input', (e) => {
      window.LiquidGLEngine.setState({ frost: Number(e.target.value) });
    });

    const taskbarMenu = document.getElementById('taskbar-context-menu');
    if (taskbarMenu) {
      taskbarMenu.addEventListener('click', (e) => e.stopPropagation());
      document.getElementById('taskbar-ctx-open')?.addEventListener('click', () => {
        if (taskbarContextAppId) {
          launchApp(taskbarContextAppId);
        }
        closeOverlays();
      });
      document.getElementById('taskbar-ctx-pin')?.addEventListener('click', () => {
        if (taskbarContextAppId) {
          togglePinApp(taskbarContextAppId);
        }
        closeOverlays();
      });
      document.getElementById('taskbar-ctx-close')?.addEventListener('click', () => {
        if (taskbarContextAppId) {
          closeApp(taskbarContextAppId);
        }
        closeOverlays();
      });
    }
  }

  function openShortcutModal() {
    document.getElementById('shortcut-modal-backdrop')?.classList.remove('hidden');
    document.getElementById('shortcut-title-input')?.focus();
  }

  function closeOverlays() {
    document.getElementById('custom-context-menu')?.classList.add('hidden');
    document.getElementById('taskbar-context-menu')?.classList.add('hidden');
    document.getElementById('search-flyout')?.classList.add('hidden');
    document.getElementById('start-menu')?.classList.add('hidden');
    document.getElementById('day-flyout')?.classList.add('hidden');
    document.getElementById('lyrics-flyout')?.classList.add('hidden');
    document.getElementById('action-center-flyout')?.classList.add('hidden');
  }

  // ==========================================================================
  // Global Keyboard Shortcuts (Alt+Tab, Win/Cmd+Space, Escape)
  // ==========================================================================
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Escape: dismiss active popovers, modals, and menus
      if (e.key === 'Escape') {
        closeOverlays();
        document.getElementById('group-popover-backdrop')?.classList.add('hidden');
        document.getElementById('shortcut-modal-backdrop')?.classList.add('hidden');
        document.getElementById('droplet-orb-window')?.classList.add('hidden');
        return;
      }

      // Alt + Tab: cycle between active open windows
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        const ids = Array.from(openWindows.keys());
        if (ids.length === 0) return;
        let focusedIdx = ids.findIndex((id) => {
          const w = openWindows.get(id);
          return w && !w.minimized && w.el.classList.contains('focused');
        });
        const nextId = ids[(focusedIdx + 1) % ids.length];
        const nextWin = openWindows.get(nextId);
        if (nextWin) {
          nextWin.minimized = false;
          nextWin.el.classList.remove('minimized', 'minimizing');
          focusWindow(nextId);
          showToast(`Switched to ${nextId}`);
        }
        return;
      }

      // Command / Windows / Ctrl + Space: toggle global search
      if ((e.metaKey || e.ctrlKey) && e.code === 'Space') {
        e.preventDefault();
        const searchFlyout = document.getElementById('search-flyout');
        const searchInput = document.getElementById('taskbar-search-input');
        if (!searchFlyout) return;
        const isHidden = searchFlyout.classList.contains('hidden');
        closeOverlays();
        if (isHidden) {
          searchFlyout.style.zIndex = ++topZ;
          searchFlyout.classList.remove('hidden');
          renderSearch(searchInput?.value || '');
          searchInput?.focus();
        }
      }
    });
  }

  function initGlobalEvents() {
    const startSvg = document.getElementById('start-button-svg');
    if (startSvg) startSvg.innerHTML = window.GoldenGateIcons.getStartIcon();

    const volIconEl = document.getElementById('taskbar-vol-icon');
    if (volIconEl) volIconEl.innerHTML = window.GoldenGateIcons.getUiIcon('volume', 13);

    const notifSvgEl = document.getElementById('taskbar-notif-svg');
    if (notifSvgEl) notifSvgEl.innerHTML = window.GoldenGateIcons.getUiIcon('bell', 14);

    // Master Volume Slider
    const masterVolSlider = document.getElementById('taskbar-master-volume');
    masterVolSlider?.addEventListener('input', (e) => {
      setMasterVolume(Number(e.target.value) / 100);
    });
    window.addEventListener('music:updated', () => {
      const mVol = window.GoldenGateMusic.getVolume();
      masterVolume = mVol;
      if (masterVolSlider && document.activeElement !== masterVolSlider) {
        masterVolSlider.value = String(Math.round(mVol * 100));
      }
    });

    // Action Center / Notifications Flyout
    const notifBtn = document.getElementById('taskbar-notif-btn');
    const acFlyout = document.getElementById('action-center-flyout');
    notifBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = acFlyout.classList.contains('hidden');
      closeOverlays();
      if (hidden) {
        acFlyout.style.zIndex = ++topZ;
        acFlyout.classList.remove('hidden');
        renderNotifications();
      }
    });
    acFlyout?.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('ac-clear-all-btn')?.addEventListener('click', () => {
      notifications = [];
      saveNotifications();
      renderNotifications();
    });

    document.getElementById('ac-alarm-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const secIn = document.getElementById('ac-alarm-seconds');
      const lblIn = document.getElementById('ac-alarm-label');
      const secs = Math.max(1, Number(secIn?.value) || 10);
      const label = (lblIn?.value || '').trim() || 'Timer Complete';
      if (lblIn) lblIn.value = '';
      showToast(`Alarm set for ${secs}s`);
      setTimeout(() => {
        pushNotification({
          title: 'Alarm Triggered',
          body: label,
          category: 'alarm'
        });
      }, secs * 1000);
    });

    // Lyrics Flyout stop propagation so clicking inside lyrics doesn't close it
    document.getElementById('lyrics-flyout')?.addEventListener('click', (e) => e.stopPropagation());

    const grpBackdrop = document.getElementById('group-popover-backdrop');
    grpBackdrop?.addEventListener('click', (e) => {
      if (e.target === grpBackdrop) grpBackdrop.classList.add('hidden');
    });

    const localInput = document.getElementById('local-wallpaper-input');
    localInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        window.LiquidGLEngine.setCustomWallpaper(reader.result);
        showToast('Local wallpaper applied');
      };
      reader.readAsDataURL(file);
    });

    // Start Button
    const startBtn = document.getElementById('start-btn');
    const startMenu = document.getElementById('start-menu');
    startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = startMenu.classList.contains('hidden');
      closeOverlays();
      if (hidden) {
        renderStartMenu();
        startMenu.style.zIndex = ++topZ;
        startMenu.classList.remove('hidden');
      }
    });
    startMenu?.addEventListener('click', (e) => e.stopPropagation());

    // Clock / Day & 6-Hour Weather Flyout Button
    const clockBtn = document.getElementById('taskbar-clock-btn');
    const dayFlyout = document.getElementById('day-flyout');
    clockBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = dayFlyout.classList.contains('hidden');
      closeOverlays();
      if (hidden) {
        dayFlyout.style.zIndex = ++topZ;
        dayFlyout.classList.remove('hidden');
        refreshDayAndWeather();
      }
    });
    dayFlyout?.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('day-refresh-btn')?.addEventListener('click', () => refreshDayAndWeather());

    // Search Pill
    const searchInput = document.getElementById('taskbar-search-input');
    const searchFlyout = document.getElementById('search-flyout');
    const searchBox = document.getElementById('taskbar-search-box');
    searchBox?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = searchFlyout.classList.contains('hidden');
      closeOverlays();
      if (hidden) {
        searchFlyout.style.zIndex = ++topZ;
        searchFlyout.classList.remove('hidden');
        renderSearch(searchInput.value);
      }
      searchInput?.focus();
    });
    searchInput?.addEventListener('input', (e) => {
      searchFlyout.style.zIndex = ++topZ;
      searchFlyout.classList.remove('hidden');
      renderSearch(e.target.value);
    });
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        const q = searchInput.value.trim();
        const isDomain = q.includes('.') && !q.includes(' ');
        const url = isDomain
          ? 'https://' + q.replace(/^https?:\/\//, '')
          : 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
        closeOverlays();
        openUrlInBrowser(url, q);
      }
    });
    searchFlyout?.addEventListener('click', (e) => e.stopPropagation());

    // Shortcut Modal
    document.getElementById('shortcut-modal-close')?.addEventListener('click', () => {
      document.getElementById('shortcut-modal-backdrop')?.classList.add('hidden');
    });
    document.getElementById('shortcut-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('shortcut-modal-backdrop')?.classList.add('hidden');
    });
    document.getElementById('shortcut-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      addWebsiteShortcut({
        title: document.getElementById('shortcut-title-input').value,
        url: document.getElementById('shortcut-url-input').value
      });
      e.target.reset();
      document.getElementById('shortcut-modal-backdrop')?.classList.add('hidden');
    });

    window.addEventListener('click', () => {
      closeOverlays();
      document.querySelectorAll('.desktop-icon-box').forEach((b) => b.classList.remove('selected'));
    });

    // Clock
    function tick() {
      const el = document.getElementById('taskbar-time');
      if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    tick();
    setInterval(tick, 15000);
    refreshDayAndWeather();
  }

  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (event) => {
        const d = event.data || {};
        if (d.type === 'DIGEST_DELIVERED') {
          pushNotification({
            title: d.title || 'Daily Digest',
            body: d.body || 'Your summary is ready.',
            category: 'digest'
          });
        }
      });
    }
  }

  function init() {
    window.LiquidGLEngine.init();
    window.GoldenGateMusic.init();
    loadDesktopState();
    loadNotifications();
    renderDesktopIcons();
    renderTaskbarApps();
    initDockMagnification();
    initContextMenu();
    initKeyboardShortcuts();
    initGlobalEvents();
    restoreSavedWindows();
    initServiceWorker();
    if (window.GoldenGateDroplet?.init) {
      window.GoldenGateDroplet.init();
    }

    // First-visit Account popup
    setTimeout(() => {
      const prompted = localStorage.getItem('webos_account_prompted_v2');
      const user = window.AeroAuth ? window.AeroAuth.getUser() : null;
      if (!prompted && !user) {
        localStorage.setItem('webos_account_prompted_v2', 'true');
        launchApp('account');
      }
    }, 800);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    launchApp,
    closeApp,
    focusWindow,
    openUrlInBrowser,
    addWebsiteShortcut,
    removeShortcut,
    getShortcuts: getAllShortcuts,
    getNotifications: () => notifications,
    getActiveScreenContext,
    openShortcutModal,
    pushNotification,
    runTerminalCommand,
    refreshDayAndWeather,
    showToast,
    pinApp,
    unpinApp,
    togglePinApp,
    isAppPinned,
    getPinnedApps: () => [...pinnedAppIds]
  };
})();

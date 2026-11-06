window.GoldenGateApps = (function () {
  const QUICK_SITES = [
    { title: 'DuckDuckGo', url: 'https://duckduckgo.com', color: '#de5833' },
    { title: 'Google', url: 'https://www.google.com', color: '#4285f4' },
    { title: 'YouTube', url: 'https://youtube.com', color: '#ff0000' },
    { title: 'Reddit', url: 'https://reddit.com', color: '#ff4500' },
    { title: 'GitHub', url: 'https://github.com', color: '#24292e' },
    { title: 'Discord', url: 'https://discord.com', color: '#5865f2' },
    { title: 'Games', url: 'aero://games', color: '#10b981' }
  ];

  const APP_DEFINITIONS = [
    { id: 'aero', title: 'aero', icon: 'aero', width: 960, height: 600, pinned: true },
    { id: 'music', title: 'music', icon: 'music', width: 940, height: 580, pinned: true },
    { id: 'games', title: 'games', icon: 'games', width: 880, height: 540, pinned: true },
    { id: 'code', title: 'code', icon: 'code', width: 820, height: 520, pinned: true },
    { id: 'files', title: 'files', icon: 'files', width: 580, height: 400, pinned: true },
    { id: 'wallpaper', title: 'wallpaper', icon: 'wallpaper', width: 640, height: 460, pinned: true },
    { id: 'terminal', title: 'terminal', icon: 'terminal', width: 560, height: 380, pinned: true },
    { id: 'monitor', title: 'monitor', icon: 'monitor', width: 620, height: 440, pinned: true },
    { id: 'account', title: 'account', icon: 'account', width: 440, height: 520, pinned: true }
  ];

  // Shared Games Catalog Cache (Fetched from gn-math/assets zones.json using raw.githubusercontent.com)
  let cachedGamesCatalog = null;
  const COVER_BASE = 'https://raw.githubusercontent.com/gn-math/covers/master';
  const HTML_BASE = 'https://raw.githubusercontent.com/gn-math/html/master';

  async function fetchGamesCatalog() {
    if (cachedGamesCatalog) return cachedGamesCatalog;
    try {
      const res = await fetch('https://raw.githubusercontent.com/gn-math/assets/main/zones.json');
      if (res.ok) {
        const raw = await res.json();
        cachedGamesCatalog = raw
          .filter((g) => g.id >= 0 && g.name && g.url)
          .map((g) => ({
            id: g.id,
            name: g.name,
            author: g.author || 'Web Port',
            cover: (g.cover || '')
              .replace('{COVER_URL}', COVER_BASE)
              .replace('https://cdn.jsdelivr.net/gh/gn-math/covers@main', COVER_BASE),
            htmlUrl: (g.url || '')
              .replace('{HTML_URL}', HTML_BASE)
              .replace('https://cdn.jsdelivr.net/gh/gn-math/html@main', HTML_BASE)
          }));
        return cachedGamesCatalog;
      }
    } catch (e) {}
    return [];
  }

  const DEFAULT_INVISIPROXY_URL = 'https://glowing-fishstick-r79x5gwxqgqc5rvw-8080.app.github.dev';

  function toProxyUrl(targetUrl) {
    if (!targetUrl) return '';
    if (targetUrl.startsWith('aero://') || targetUrl.startsWith('/proxy?url=')) return targetUrl;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      return `/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    const backend = (localStorage.getItem('aero_invisiproxy_url') || DEFAULT_INVISIPROXY_URL).trim().replace(/\/+$/, '');
    if (backend) {
      const fullUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') ? targetUrl : `https://${targetUrl}`;
      return `${backend}/scramjet/${fullUrl}`;
    }
    return '';
  }

  // ==========================================================================
  // 1. music (Limusic with Direct DOM Updates on Settings Change, No Re-render Wipe)
  // ==========================================================================
  function renderMusic(bodyEl) {
    let viewMode = 'home'; // 'home' | 'search' | 'playlist' | 'import' | 'new-playlist' | 'settings'
    let searchResults = [];
    let searchQuery = '';
    let renderedMood = window.GoldenGateMusic.getActiveMood();
    let activeListForClicks = [];

    const MOODS = ['All', 'Focus', 'Chill', 'Energize', 'Gaming', 'Lofi', 'Synthwave', 'Soundtracks'];
    const THEMES = [
      { id: 'obsidian', name: 'Obsidian' },
      { id: 'oled', name: 'OLED Black' },
      { id: 'catppuccin', name: 'Catppuccin' },
      { id: 'tokyonight', name: 'Tokyo Night' },
      { id: 'rosepine', name: 'Rose Pine' }
    ];
    const ACCENTS = ['#8b80f9', '#38bdf8', '#10b981', '#f59e0b', '#ec4899'];
    const SPEEDS = [0.75, 1, 1.25, 1.5];

    function uiIcon(name, size = 14) {
      return window.GoldenGateIcons.getUiIcon(name, size);
    }

    function renderTrackRow(t, idx, curTrack) {
      const isCur = curTrack && curTrack.id === t.id;
      const liked = window.GoldenGateMusic.isTrackLiked(t.id);
      const settings = window.GoldenGateMusic.getSettings();
      return `
        <div class="limusic-track-row ${isCur ? 'playing' : ''}" data-track-idx="${idx}" data-track-id="${t.id}">
          <span class="limusic-track-num">${idx + 1}</span>
          <img class="limusic-track-cover" src="${t.cover || ''}" loading="lazy" decoding="async" alt="" />
          <div style="overflow:hidden;">
            <div class="limusic-track-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title}</div>
            <div class="limusic-track-artist" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.artist}</div>
          </div>
          <div class="limusic-track-actions">
            <button class="limusic-mini-btn track-like-btn" data-like-idx="${idx}" data-like-id="${t.id}" title="Like Track" style="${liked ? `color:${settings.accent};` : ''}">${liked ? uiIcon('heartFilled', 13) : uiIcon('heart', 13)}</button>
            <button class="limusic-mini-btn track-add-pl-btn" data-add-idx="${idx}" title="Add to Playlist">${uiIcon('plus', 11)} Playlist</button>
          </div>
          <span class="limusic-track-dur">${window.GoldenGateMusic.formatTime(t.duration)}</span>
        </div>
      `;
    }

    function render() {
      const playlists = window.GoldenGateMusic.getPlaylists();
      const likedTracks = window.GoldenGateMusic.getLikedTracks();
      const recentTracks = window.GoldenGateMusic.getRecentTracks();
      const homeTracks = window.GoldenGateMusic.getHomeRecommendations();
      const activeMood = window.GoldenGateMusic.getActiveMood();
      renderedMood = activeMood;
      const activeId = window.GoldenGateMusic.getActivePlaylistId();
      const settings = window.GoldenGateMusic.getSettings();
      const activePl =
        activeId === 'liked'
          ? { id: 'liked', name: 'Liked Music', tracks: likedTracks }
          : playlists.find((p) => p.id === activeId);

      const curTrack = window.GoldenGateMusic.getCurrentTrack();
      const playing = window.GoldenGateMusic.isPlaying();
      const looping = window.GoldenGateMusic.isLooping();
      const curSec = window.GoldenGateMusic.getEffectiveCurrentTime();
      const durSec = window.GoldenGateMusic.getEffectiveDuration();
      const progPct = durSec > 0 ? Math.min(100, (curSec / durSec) * 100) : 0;

      activeListForClicks = homeTracks;
      let mainContentHtml = '';

      if (viewMode === 'home') {
        activeListForClicks = homeTracks;
        mainContentHtml = `
          <div class="limusic-chips-row">
            ${MOODS.map(
              (m) => `
              <button class="limusic-chip ${m === activeMood ? 'active' : ''}" data-mood="${m}">${m}</button>
            `
            ).join('')}
          </div>

          ${
            recentTracks.length > 0
              ? `
            <div class="limusic-shelf">
              <div class="limusic-shelf-header">
                <span class="limusic-shelf-title">Recently Played</span>
              </div>
              <div class="limusic-cards-grid">
                ${recentTracks
                  .slice(0, 4)
                  .map(
                    (t, idx) => `
                  <div class="limusic-media-card recent-card" data-recent-idx="${idx}">
                    <div class="limusic-card-art-wrap">
                      <img src="${t.cover || ''}" loading="lazy" decoding="async" alt="" />
                    </div>
                    <div class="limusic-card-title">${t.title}</div>
                    <div class="limusic-card-sub">
                      <span>${t.artist}</span>
                      <span>${window.GoldenGateMusic.formatTime(t.duration)}</span>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }

          <div class="limusic-shelf">
            <div class="limusic-shelf-header">
              <span class="limusic-shelf-title">Recommended (${activeMood})</span>
              <button class="limusic-play-pill" id="home-play-all">${uiIcon('play', 12)} Play All</button>
            </div>
            <div class="limusic-cards-grid">
              ${homeTracks
                .slice(0, 6)
                .map(
                  (t, idx) => `
                <div class="limusic-media-card home-rec-card" data-rec-idx="${idx}">
                  <div class="limusic-card-art-wrap">
                    <img src="${t.cover || ''}" loading="lazy" decoding="async" alt="" />
                  </div>
                  <div class="limusic-card-title">${t.title}</div>
                  <div class="limusic-card-sub">
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.artist}</span>
                    <span>${window.GoldenGateMusic.formatTime(t.duration)}</span>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="limusic-shelf">
            <div class="limusic-shelf-header">
              <span class="limusic-shelf-title">Tracks</span>
            </div>
            <div class="limusic-tracks" style="padding:0;">
              ${homeTracks.map((t, i) => renderTrackRow(t, i, curTrack)).join('')}
            </div>
          </div>
        `;
      } else if (viewMode === 'search') {
        activeListForClicks = searchResults;
        mainContentHtml = `
          <div style="padding:20px 22px 10px;">
            <form id="limusic-search-form" style="display:flex;gap:8px;">
              <input type="text" class="clean-input" id="limusic-search-input" value="${searchQuery}" placeholder="Search songs, artists, soundtracks..." />
              <button type="submit" class="limusic-play-pill">${uiIcon('search', 12)} Search</button>
            </form>
          </div>
          <div class="limusic-tracks">
            ${
              searchResults.length > 0
                ? searchResults.map((t, i) => renderTrackRow(t, i, curTrack)).join('')
                : `<div style="padding:16px;font-size:12px;color:#64748b;">Search for any artist, song, or soundtrack.</div>`
            }
          </div>
        `;
      } else if (viewMode === 'new-playlist') {
        mainContentHtml = `
          <div style="padding:28px;max-width:460px;display:flex;flex-direction:column;gap:14px;">
            <h2 class="kinetic-title" style="font-size:18px;color:#fff;">New Playlist</h2>
            <form id="limusic-newpl-form" style="display:flex;gap:8px;">
              <input type="text" class="clean-input" id="limusic-newpl-input" placeholder="Playlist name..." required />
              <button type="submit" class="limusic-play-pill">Create</button>
            </form>
          </div>
        `;
      } else if (viewMode === 'import') {
        mainContentHtml = `
          <div style="padding:28px;max-width:540px;display:flex;flex-direction:column;gap:14px;">
            <h2 class="kinetic-title" style="font-size:18px;color:#fff;">Import Playlist</h2>
            <p style="font-size:12px;color:#94a3b8;line-height:1.5;">
              Paste a YouTube Music playlist URL, Spotify URL, SoundCloud URL, or search query.
            </p>
            <form id="limusic-import-form" style="display:flex;gap:8px;">
              <input type="text" class="clean-input" id="limusic-import-input" placeholder="https://www.youtube.com/playlist?list=... or Spotify URL" required />
              <button type="submit" class="limusic-play-pill">Import</button>
            </form>
            <div id="limusic-import-status" style="font-size:12px;color:var(--lim-accent);"></div>
          </div>
        `;
      } else if (viewMode === 'settings') {
        mainContentHtml = `
          <div style="padding:24px 28px;max-width:580px;display:flex;flex-direction:column;gap:18px;">
            <h2 class="kinetic-title" style="font-size:19px;color:#fff;">Settings</h2>

            <!-- Theme Selector -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;gap:10px;">
              <div style="font-size:12.5px;font-weight:600;color:#fff;">Theme</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${THEMES.map(
                  (th) => `
                  <button class="limusic-chip lim-theme-btn ${settings.theme === th.id ? 'active' : ''}" data-theme="${th.id}">${th.name}</button>
                `
                ).join('')}
              </div>
            </div>

            <!-- Accent Color -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12.5px;font-weight:600;color:#fff;">Accent Color</span>
              <div style="display:flex;align-items:center;gap:8px;">
                ${ACCENTS.map(
                  (hex) => `
                  <button class="lim-accent-swatch" data-accent="${hex}" style="width:20px;height:20px;border-radius:50%;background:${hex};border:${settings.accent === hex ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)'};cursor:pointer;"></button>
                `
                ).join('')}
                <input type="color" id="lim-custom-accent" value="${settings.accent}" style="width:24px;height:22px;background:transparent;border:none;cursor:pointer;" />
              </div>
            </div>

            <!-- Music Fade-In / Crossfade Duration -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12.5px;font-weight:600;color:#fff;">Music Fade-In</span>
                <span id="lim-fade-label" style="font-size:11.5px;color:var(--lim-accent);">${settings.fadeInSeconds}s</span>
              </div>
              <input type="range" id="lim-fade-slider" min="0" max="5" step="0.5" value="${settings.fadeInSeconds}" style="width:100%;accent-color:var(--lim-accent);cursor:pointer;" />
            </div>

            <!-- Playback Speed -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12.5px;font-weight:600;color:#fff;">Playback Speed</span>
              <div style="display:flex;gap:6px;">
                ${SPEEDS.map(
                  (sp) => `
                  <button class="limusic-chip lim-speed-btn ${Number(settings.playbackSpeed) === sp ? 'active' : ''}" data-speed="${sp}">${sp}x</button>
                `
                ).join('')}
              </div>
            </div>

            <!-- Toggles -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;gap:12px;">
              <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                <span style="font-size:12.5px;color:#e2e8f0;">Auto-Play Next Track</span>
                <input type="checkbox" id="lim-autoplay-chk" ${settings.autoPlay ? 'checked' : ''} style="accent-color:var(--lim-accent);width:16px;height:16px;" />
              </label>
              <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                <span style="font-size:12.5px;color:#e2e8f0;">Compact Track Rows</span>
                <input type="checkbox" id="lim-compact-chk" ${settings.compactRows ? 'checked' : ''} style="accent-color:var(--lim-accent);width:16px;height:16px;" />
              </label>
              <label style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">
                <span style="font-size:12.5px;color:#e2e8f0;">Taskbar Visualizer Glow</span>
                <input type="checkbox" id="lim-glow-chk" ${settings.visualizerGlow ? 'checked' : ''} style="accent-color:var(--lim-accent);width:16px;height:16px;" />
              </label>
            </div>

            <!-- Library Backup & Restore Card -->
            <div style="padding:14px;border-radius:12px;background:var(--lim-card);border:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;gap:10px;">
              <div style="font-size:12.5px;font-weight:600;color:#fff;">Library Backup & Restore</div>
              <div style="font-size:11.5px;color:#94a3b8;">Export your playlists, liked tracks, and listening history to a file, or restore them.</div>
              <div style="display:flex;gap:8px;">
                <button id="lim-export-lib-btn" class="limusic-mini-btn" style="flex:1;padding:8px 12px;font-size:11.5px;">Export Playlists (.json)</button>
                <button id="lim-import-lib-btn" class="limusic-mini-btn" style="flex:1;padding:8px 12px;font-size:11.5px;">Import Playlists (.json)</button>
                <input type="file" id="lim-import-lib-file" accept=".json" style="display:none;" />
              </div>
            </div>
          </div>
        `;
      } else if (viewMode === 'playlist' && activePl) {
        activeListForClicks = activePl.tracks || [];
        const collageImgs = activeListForClicks
          .slice(0, 4)
          .map((t) => `<img src="${t.cover || ''}" loading="lazy" decoding="async" alt="" />`)
          .join('');
        mainContentHtml = `
          <div class="limusic-hero">
            <div class="limusic-hero-left">
              <div class="limusic-hero-collage">${collageImgs}</div>
              <div>
                <div class="limusic-hero-tag">PLAYLIST</div>
                <div class="limusic-hero-title">${activePl.name}</div>
                <div class="limusic-hero-sub">${activeListForClicks.length} tracks</div>
                <div style="display:flex;gap:8px;">
                  <button class="limusic-play-pill" id="pl-play-all">${uiIcon('play', 12)} Play</button>
                  ${
                    activePl.id !== 'liked'
                      ? `<button class="limusic-mini-btn" id="pl-delete-btn" style="padding:6px 12px;">Delete</button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="limusic-tracks">
            ${
              activeListForClicks.length > 0
                ? activeListForClicks.map((t, i) => renderTrackRow(t, i, curTrack)).join('')
                : `<div style="padding:20px;font-size:12px;color:#64748b;">No tracks yet. Add songs from Home or Search.</div>`
            }
          </div>
        `;
      }

      bodyEl.innerHTML = `
        <div class="limusic-shell limusic-theme-${settings.theme} ${settings.compactRows ? 'compact-rows' : ''}" id="limusic-shell-root" style="--lim-accent:${settings.accent};">
          <div class="limusic-main-row">
            <aside class="limusic-sidebar">
              <div class="limusic-brand">
                <span>Limusic</span>
              </div>
              <nav class="limusic-nav">
                <button class="limusic-nav-btn ${viewMode === 'home' ? 'active' : ''}" data-nav="home">${uiIcon('home', 14)} <span>Home</span></button>
                <button class="limusic-nav-btn ${viewMode === 'search' ? 'active' : ''}" data-nav="search">${uiIcon('search', 14)} <span>Search</span></button>
                <button class="limusic-nav-btn ${viewMode === 'import' ? 'active' : ''}" data-nav="import">${uiIcon('import', 14)} <span>Import</span></button>
                <button class="limusic-nav-btn ${viewMode === 'settings' ? 'active' : ''}" data-nav="settings">${uiIcon('settings', 14)} <span>Settings</span></button>
              </nav>

              <button class="limusic-new-pl-btn" id="limusic-create-pl-btn" style="display:flex;align-items:center;justify-content:center;gap:6px;">${uiIcon('plus', 12)} <span>New Playlist</span></button>

              <div class="limusic-pl-list">
                <!-- Liked Music Auto Playlist -->
                <div class="limusic-pl-item ${viewMode === 'playlist' && activeId === 'liked' ? 'active' : ''}" data-pl-id="liked">
                  <div class="limusic-pl-thumb" id="lim-liked-thumb" style="background:linear-gradient(135deg,${settings.accent},#ec4899);color:#fff;">${uiIcon('heartFilled', 14)}</div>
                  <div style="overflow:hidden;">
                    <div class="limusic-pl-name">Liked Music</div>
                    <div class="limusic-pl-count" id="lim-liked-count">${likedTracks.length} tracks</div>
                  </div>
                </div>

                ${playlists
                  .map(
                    (pl) => `
                  <div class="limusic-pl-item ${viewMode === 'playlist' && pl.id === activeId ? 'active' : ''}" data-pl-id="${pl.id}">
                    ${
                      pl.tracks[0]?.cover
                        ? `<img class="limusic-pl-thumb" src="${pl.tracks[0].cover}" loading="lazy" alt="" />`
                        : `<div class="limusic-pl-thumb" style="color:#cbd5e1;">${uiIcon('note', 14)}</div>`
                    }
                    <div style="overflow:hidden;">
                      <div class="limusic-pl-name">${pl.name}</div>
                      <div class="limusic-pl-count">${pl.tracks.length} tracks</div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </aside>

            <div class="limusic-content">
              ${mainContentHtml}
            </div>
          </div>

          <div class="limusic-footer">
            <div class="limusic-footer-left">
              <img class="limusic-track-cover" id="lim-footer-cover" src="${curTrack?.cover || ''}" style="${curTrack?.cover ? '' : 'opacity:0;'}" alt="" />
              <div style="overflow:hidden;">
                <div class="limusic-track-name" id="lim-footer-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${curTrack ? curTrack.title : 'Not Playing'}</div>
                <div class="limusic-track-artist" id="lim-footer-artist" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${curTrack ? curTrack.artist : 'Select a track'}</div>
              </div>
            </div>

            <div class="limusic-footer-center">
              <div class="limusic-transport-row">
                <button class="tb-ctrl-btn" id="lim-prev">${uiIcon('prev', 14)}</button>
                <button class="limusic-circle-play" id="lim-play">${playing ? uiIcon('pause', 14) : uiIcon('play', 14)}</button>
                <button class="tb-ctrl-btn" id="lim-next">${uiIcon('next', 14)}</button>
                <button class="tb-ctrl-btn ${looping ? 'active' : ''}" id="lim-loop">${uiIcon('loop', 13)}</button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;width:100%;">
                <span id="limusic-cur-time" style="font-size:10px;color:#64748b;">${window.GoldenGateMusic.formatTime(curSec)}</span>
                <div class="tb-progress-track" id="lim-prog-bar" style="flex:1;height:4px;">
                  <div class="tb-progress-fill" id="limusic-prog-fill" style="width:${progPct.toFixed(2)}%;background:var(--lim-accent);"></div>
                </div>
                <span id="limusic-dur-time" style="font-size:10px;color:#64748b;">${window.GoldenGateMusic.formatTime(durSec)}</span>
              </div>
            </div>

            <div class="limusic-footer-right">
              <span style="font-size:11px;color:#94a3b8;">Vol</span>
              <input type="range" id="lim-vol" min="0" max="100" value="${Math.round(window.GoldenGateMusic.getVolume() * 100)}" style="width:80px;accent-color:var(--lim-accent);cursor:pointer;" />
            </div>
          </div>
        </div>
      `;

      // Wire navigation
      bodyEl.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.onclick = () => {
          viewMode = btn.dataset.nav;
          render();
        };
      });

      bodyEl.querySelector('#limusic-create-pl-btn')?.addEventListener('click', () => {
        viewMode = 'new-playlist';
        render();
        bodyEl.querySelector('#limusic-newpl-input')?.focus();
      });

      bodyEl.querySelectorAll('.limusic-pl-item').forEach((item) => {
        item.onclick = () => {
          viewMode = 'playlist';
          window.GoldenGateMusic.setActivePlaylistId(item.dataset.plId);
          render();
        };
      });

      // Settings Wiring (Direct DOM updates via music:settings-updated, no DOM wipe!)
      bodyEl.querySelectorAll('.lim-theme-btn').forEach((b) => {
        b.onclick = () => window.GoldenGateMusic.updateSettings({ theme: b.dataset.theme });
      });
      bodyEl.querySelectorAll('.lim-accent-swatch').forEach((b) => {
        b.onclick = () => window.GoldenGateMusic.updateSettings({ accent: b.dataset.accent });
      });
      bodyEl.querySelector('#lim-custom-accent')?.addEventListener('input', (e) => {
        window.GoldenGateMusic.updateSettings({ accent: e.target.value });
      });
      bodyEl.querySelector('#lim-export-lib-btn')?.addEventListener('click', () => {
        if (!window.GoldenGateMusic?.exportLibraryJson) return;
        const json = window.GoldenGateMusic.exportLibraryJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `limusic-library-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Playlists exported');
      });

      const limFileInp = bodyEl.querySelector('#lim-import-lib-file');
      bodyEl.querySelector('#lim-import-lib-btn')?.addEventListener('click', () => {
        limFileInp?.click();
      });
      limFileInp?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (!window.GoldenGateMusic?.importLibraryJson) return;
          const res = window.GoldenGateMusic.importLibraryJson(evt.target.result);
          if (res && res.error) {
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Import failed: ' + res.error);
          } else {
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Playlists restored successfully');
            render();
          }
        };
        reader.readAsText(file);
      });

      bodyEl.querySelector('#lim-fade-slider')?.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        const lbl = bodyEl.querySelector('#lim-fade-label');
        if (lbl) lbl.textContent = `${val}s`;
        window.GoldenGateMusic.updateSettings({ fadeInSeconds: val });
      });
      bodyEl.querySelectorAll('.lim-speed-btn').forEach((b) => {
        b.onclick = () => window.GoldenGateMusic.updateSettings({ playbackSpeed: Number(b.dataset.speed) });
      });
      bodyEl.querySelector('#lim-autoplay-chk')?.addEventListener('change', (e) => {
        window.GoldenGateMusic.updateSettings({ autoPlay: e.target.checked });
      });
      bodyEl.querySelector('#lim-compact-chk')?.addEventListener('change', (e) => {
        window.GoldenGateMusic.updateSettings({ compactRows: e.target.checked });
      });
      bodyEl.querySelector('#lim-glow-chk')?.addEventListener('change', (e) => {
        window.GoldenGateMusic.updateSettings({ visualizerGlow: e.target.checked });
      });

      // Mood Chips on Home
      bodyEl.querySelectorAll('[data-mood]').forEach((chip) => {
        chip.onclick = () => {
          window.GoldenGateMusic.loadHomeMood(chip.dataset.mood);
        };
      });

      // Home Cards
      bodyEl.querySelectorAll('.home-rec-card').forEach((card) => {
        card.onclick = () => {
          const t = homeTracks[Number(card.dataset.recIdx)];
          if (t) window.GoldenGateMusic.playTrack(t, homeTracks);
        };
      });

      bodyEl.querySelectorAll('.recent-card').forEach((card) => {
        card.onclick = () => {
          const t = recentTracks[Number(card.dataset.recentIdx)];
          if (t) window.GoldenGateMusic.playTrack(t, recentTracks);
        };
      });

      bodyEl.querySelector('#home-play-all')?.addEventListener('click', () => {
        if (homeTracks.length > 0) window.GoldenGateMusic.playTrack(homeTracks[0], homeTracks);
      });

      bodyEl.querySelector('#pl-play-all')?.addEventListener('click', () => {
        if (activeListForClicks.length > 0) {
          window.GoldenGateMusic.playTrack(activeListForClicks[0], activeListForClicks);
        }
      });

      bodyEl.querySelector('#pl-delete-btn')?.addEventListener('click', () => {
        if (activePl && activePl.id !== 'liked') {
          window.GoldenGateMusic.deletePlaylist(activePl.id);
          viewMode = 'home';
          render();
        }
      });

      // Track Row Clicks, Like & Add to Playlist
      bodyEl.querySelectorAll('.limusic-track-row').forEach((row) => {
        const idx = Number(row.dataset.trackIdx);
        row.onclick = (e) => {
          if (e.target.closest('.limusic-mini-btn')) return;
          const t = activeListForClicks[idx];
          if (t) window.GoldenGateMusic.playTrack(t, activeListForClicks);
        };
      });

      bodyEl.querySelectorAll('.track-like-btn').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const t = activeListForClicks[Number(btn.dataset.likeIdx)];
          if (t) window.GoldenGateMusic.toggleLikeTrack(t);
        };
      });

      bodyEl.querySelectorAll('.track-add-pl-btn').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const t = activeListForClicks[Number(btn.dataset.addIdx)];
          if (!t) return;
          const pls = window.GoldenGateMusic.getPlaylists();
          if (pls.length === 0) {
            const created = window.GoldenGateMusic.createPlaylist('My Playlist');
            window.GoldenGateMusic.addTrackToPlaylist(t, created.id);
            window.GoldenGateOS.showToast(`Added to ${created.name}`);
            render();
          } else {
            window.GoldenGateMusic.addTrackToPlaylist(t, pls[0].id);
            window.GoldenGateOS.showToast(`Added to ${pls[0].name}`);
            render();
          }
        };
      });

      // Forms
      const newPlForm = bodyEl.querySelector('#limusic-newpl-form');
      if (newPlForm) {
        newPlForm.onsubmit = (e) => {
          e.preventDefault();
          const name = bodyEl.querySelector('#limusic-newpl-input').value;
          const pl = window.GoldenGateMusic.createPlaylist(name);
          if (pl) {
            viewMode = 'playlist';
            render();
          }
        };
      }

      const searchForm = bodyEl.querySelector('#limusic-search-form');
      if (searchForm) {
        searchForm.onsubmit = async (e) => {
          e.preventDefault();
          searchQuery = bodyEl.querySelector('#limusic-search-input').value.trim();
          if (!searchQuery) return;
          searchResults = await window.GoldenGateMusic.searchYouTubeMusic(searchQuery);
          render();
        };
      }

      const importForm = bodyEl.querySelector('#limusic-import-form');
      if (importForm) {
        importForm.onsubmit = async (e) => {
          e.preventDefault();
          const inEl = bodyEl.querySelector('#limusic-import-input');
          const val = inEl ? inEl.value.trim() : '';
          if (!val) return;
          const st = bodyEl.querySelector('#limusic-import-status');
          if (st) st.textContent = 'Importing playlist tracks...';
          const pl = await window.GoldenGateMusic.importPlaylistFromUrl(val);
          if (pl && pl.tracks && pl.tracks.length > 0) {
            viewMode = 'playlist';
            render();
            window.GoldenGateOS.showToast(`Imported ${pl.name} (${pl.tracks.length} tracks)`);
          } else {
            if (st) st.textContent = 'Could not load playlist. Check link or try another.';
          }
        };
      }

      // Transport Footer
      bodyEl.querySelector('#lim-play')?.addEventListener('click', () => window.GoldenGateMusic.togglePlay());
      bodyEl.querySelector('#lim-prev')?.addEventListener('click', () => window.GoldenGateMusic.prevTrack());
      bodyEl.querySelector('#lim-next')?.addEventListener('click', () => window.GoldenGateMusic.nextTrack());
      bodyEl.querySelector('#lim-loop')?.addEventListener('click', () => window.GoldenGateMusic.toggleLoop());
      bodyEl.querySelector('#lim-vol')?.addEventListener('input', (e) => {
        window.GoldenGateMusic.setVolume(Number(e.target.value) / 100);
      });
      bodyEl.querySelector('#lim-prog-bar')?.addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        window.GoldenGateMusic.seekFraction((e.clientX - rect.left) / Math.max(1, rect.width));
      });
    }

    // Target specific DOM elements directly when settings change without wiping innerHTML
    function handleSettingsUpdated(e) {
      const s = e.detail || window.GoldenGateMusic.getSettings();
      const shell = bodyEl.querySelector('#limusic-shell-root');
      if (!shell) return;

      shell.className = `limusic-shell limusic-theme-${s.theme} ${s.compactRows ? 'compact-rows' : ''}`;
      shell.style.setProperty('--lim-accent', s.accent);

      const likedThumb = bodyEl.querySelector('#lim-liked-thumb');
      if (likedThumb) {
        likedThumb.style.background = `linear-gradient(135deg,${s.accent},#ec4899)`;
      }

      const fadeLbl = bodyEl.querySelector('#lim-fade-label');
      if (fadeLbl) fadeLbl.textContent = `${s.fadeInSeconds}s`;

      const customColor = bodyEl.querySelector('#lim-custom-accent');
      if (customColor && customColor.value !== s.accent) customColor.value = s.accent;

      bodyEl.querySelectorAll('.lim-theme-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.theme === s.theme);
      });

      bodyEl.querySelectorAll('.lim-accent-swatch').forEach((b) => {
        b.style.border = b.dataset.accent === s.accent ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)';
      });

      bodyEl.querySelectorAll('.lim-speed-btn').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.speed) === Number(s.playbackSpeed));
      });
    }

    // Target specific DOM elements directly on playback/like updates unless mood changed
    function handleMusicUpdated() {
      const activeMood = window.GoldenGateMusic.getActiveMood();
      if (viewMode === 'home' && activeMood !== renderedMood) {
        render();
        return;
      }

      const curTrack = window.GoldenGateMusic.getCurrentTrack();
      const playing = window.GoldenGateMusic.isPlaying();
      const looping = window.GoldenGateMusic.isLooping();
      const likedTracks = window.GoldenGateMusic.getLikedTracks();
      const settings = window.GoldenGateMusic.getSettings();

      const fCover = bodyEl.querySelector('#lim-footer-cover');
      const fTitle = bodyEl.querySelector('#lim-footer-title');
      const fArtist = bodyEl.querySelector('#lim-footer-artist');
      const fPlay = bodyEl.querySelector('#lim-play');
      const fLoop = bodyEl.querySelector('#lim-loop');
      const fVol = bodyEl.querySelector('#lim-vol');
      const likedCount = bodyEl.querySelector('#lim-liked-count');

      if (fCover) {
        if (curTrack?.cover) {
          fCover.src = curTrack.cover;
          fCover.style.opacity = '1';
        } else {
          fCover.style.opacity = '0';
        }
      }
      if (fTitle) fTitle.textContent = curTrack ? curTrack.title : 'Not Playing';
      if (fArtist) fArtist.textContent = curTrack ? curTrack.artist : 'Select a track';
      if (fPlay) fPlay.innerHTML = playing ? uiIcon('pause', 14) : uiIcon('play', 14);
      if (fLoop) fLoop.classList.toggle('active', looping);
      if (fVol) fVol.value = String(Math.round(window.GoldenGateMusic.getVolume() * 100));
      if (likedCount) likedCount.textContent = `${likedTracks.length} tracks`;

      bodyEl.querySelectorAll('.limusic-track-row').forEach((row) => {
        const tid = row.dataset.trackId;
        row.classList.toggle('playing', Boolean(curTrack && curTrack.id === tid));
      });

      bodyEl.querySelectorAll('.track-like-btn').forEach((btn) => {
        const tid = btn.dataset.likeId;
        const isLiked = window.GoldenGateMusic.isTrackLiked(tid);
        btn.style.color = isLiked ? settings.accent : '';
        btn.innerHTML = isLiked ? uiIcon('heartFilled', 13) : uiIcon('heart', 13);
      });
    }

    render();
    window.addEventListener('music:settings-updated', handleSettingsUpdated);
    window.addEventListener('music:updated', handleMusicUpdated);
    window.addEventListener('music:library-changed', () => render());
  }

  // ==========================================================================
  // 2. Shared Games Hub Renderer (Uses raw.githubusercontent.com + fetch -> srcdoc)
  // ==========================================================================
  function renderGamesSection(containerEl) {
    let sourceMode = 'gn-catalog'; // 'gn-catalog' | 'truffled' | 'gn-portal'
    let searchFilter = '';
    let allGames = [];
    let activeGame = null;

    async function draw() {
      if (activeGame) {
        containerEl.innerHTML = `
          <div style="display:flex;flex-direction:column;height:100%;">
            <div style="padding:8px 14px;background:#07090e;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:center;gap:10px;">
                <button class="btn-flat" id="game-back-btn" style="display:inline-flex;align-items:center;gap:6px;">${window.GoldenGateIcons.getUiIcon('back', 12)} <span>Back</span></button>
                <span class="kinetic-title" style="font-size:13px;font-weight:600;">${activeGame.name}</span>
              </div>
              <button class="btn-solid" id="game-pin-desktop">Pin</button>
            </div>
            <iframe id="game-play-iframe" style="flex:1;width:100%;border:none;background:#000;" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"></iframe>
          </div>
        `;
        containerEl.querySelector('#game-back-btn').onclick = () => {
          activeGame = null;
          draw();
        };
        containerEl.querySelector('#game-pin-desktop').onclick = () => {
          window.GoldenGateOS.addWebsiteShortcut({ title: activeGame.name, url: activeGame.htmlUrl });
        };

        const iframe = containerEl.querySelector('#game-play-iframe');
        try {
          const res = await fetch(activeGame.htmlUrl);
          if (res.ok) {
            const htmlText = await res.text();
            iframe.srcdoc = htmlText;
          } else {
            iframe.src = toProxyUrl(activeGame.htmlUrl);
          }
        } catch (e) {
          iframe.src = toProxyUrl(activeGame.htmlUrl);
        }
        return;
      }

      containerEl.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
          <div style="padding:12px 16px;background:#080b11;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;gap:6px;">
              <button class="${sourceMode === 'gn-catalog' ? 'btn-solid' : 'btn-flat'} gm-src" data-src="gn-catalog">Catalog</button>
              <button class="${sourceMode === 'truffled' ? 'btn-solid' : 'btn-flat'} gm-src" data-src="truffled">truffled.lol/g</button>
              <button class="${sourceMode === 'gn-portal' ? 'btn-solid' : 'btn-flat'} gm-src" data-src="gn-portal">gn-math.dev</button>
            </div>
            ${
              sourceMode === 'gn-catalog'
                ? `<input type="text" class="clean-input" id="gm-search" value="${searchFilter}" placeholder="Search games..." style="width:200px;" />`
                : ''
            }
          </div>
          <div id="gm-body" style="flex:1;overflow-y:auto;"></div>
        </div>
      `;

      containerEl.querySelectorAll('.gm-src').forEach((b) => {
        b.onclick = () => {
          sourceMode = b.dataset.src;
          draw();
        };
      });

      const body = containerEl.querySelector('#gm-body');

      if (sourceMode === 'truffled') {
        const truffledSrc = 'https://truffled.lol/g';
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;width:100%;height:100%;background:#121e1e;">
            <div style="padding:6px 14px;background:#0c1515;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.06);">
              <span>Source: truffled.lol/g</span>
              <a href="https://truffled.lol/g" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;font-weight:600;">Open tab ↗</a>
            </div>
            <iframe src="${truffledSrc}" style="flex:1;width:100%;border:none;background:#121e1e;" allow="fullscreen; autoplay; gamepad"></iframe>
          </div>
        `;
        return;
      }

      if (sourceMode === 'gn-portal') {
        const gnSrc = 'https://gn-math.dev/';
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;width:100%;height:100%;background:#0d111a;">
            <div style="padding:6px 14px;background:#080b11;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.06);">
              <span>Source: gn-math.dev</span>
              <a href="https://gn-math.dev/" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;font-weight:600;">Open tab ↗</a>
            </div>
            <iframe src="${gnSrc}" style="flex:1;width:100%;border:none;background:#0d111a;" allow="fullscreen; autoplay; gamepad"></iframe>
          </div>
        `;
        return;
      }

      if (allGames.length === 0) {
        body.innerHTML = `<div style="padding:20px;font-size:12.5px;">Loading games...</div>`;
        allGames = await fetchGamesCatalog();
      }

      const filtered = allGames
        .filter((g) => !searchFilter || g.name.toLowerCase().includes(searchFilter.toLowerCase()))
        .slice(0, 60);

      body.innerHTML = `
        <div class="games-grid">
          ${filtered
            .map(
              (g, idx) => `
            <div class="game-card" data-gidx="${idx}">
              <img class="game-card-img" src="${g.cover}" loading="lazy" decoding="async" alt="" />
              <div class="game-card-body">
                <span class="game-card-title">${g.name}</span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;

      body.querySelectorAll('.game-card').forEach((card) => {
        card.onclick = () => {
          activeGame = filtered[Number(card.dataset.gidx)];
          draw();
        };
      });

      const sInput = containerEl.querySelector('#gm-search');
      if (sInput) {
        sInput.oninput = (e) => {
          searchFilter = e.target.value;
          draw();
          const ni = containerEl.querySelector('#gm-search');
          if (ni) {
            ni.focus();
            ni.setSelectionRange(ni.value.length, ni.value.length);
          }
        };
      }
    }

    draw();
  }

  // ==========================================================================
  // 3. aero (Modern Premium Web Browser with Horizontal Tabs & InvisiProxy)
  // ==========================================================================
  function renderAero(bodyEl, options = {}) {
    let tabs = [
      {
        id: 'vt-1',
        title: 'Home',
        url: 'aero://home',
        history: ['aero://home'],
        historyIdx: 0
      }
    ];
    let activeTabId = 'vt-1';
    const tabPaneEls = new Map();

    function uiIcon(name, size = 14) {
      return window.GoldenGateIcons.getUiIcon(name, size);
    }

    function getActiveTab() {
      return tabs.find((t) => t.id === activeTabId) || tabs[0];
    }

    function normalizeUrl(raw) {
      const v = (raw || '').trim();
      if (!v) return 'aero://home';
      if (v === 'games') return 'aero://games';
      if (v.startsWith('aero://') || v.startsWith('http://') || v.startsWith('https://')) {
        return v;
      }
      if (v.includes('.') && !v.includes(' ')) return 'https://' + v;
      return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(v);
    }

    function getShortTitle(url) {
      if (!url || url === 'aero://home') return 'Home';
      if (url === 'aero://games') return 'Games';
      try {
        const u = new URL(url);
        if (u.searchParams.get('q')) {
          return u.searchParams.get('q').slice(0, 16);
        }
        return u.hostname.replace(/^www\./, '').split('.')[0];
      } catch (e) {
        return 'Web';
      }
    }

    function getWebsiteFavicon(url, title = '', color = '#38bdf8') {
      if (!url || url === 'aero://games') {
        return window.GoldenGateIcons.getIconSVG('games', 20);
      }
      if (url === 'aero://home') {
        return uiIcon('home', 20);
      }
      let domain = '';
      try {
        domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      } catch (e) {
        domain = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      }
      if (!domain) {
        return `<span style="font-weight:700;font-size:16px;">${(title || 'W').slice(0, 1).toUpperCase()}</span>`;
      }
      return `<img class="aero-speed-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128" onerror="this.onerror=null;this.src='https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico';" alt="${title}" loading="lazy" />`;
    }

    function getTabIcon(tab) {
      if (tab.url === 'aero://home') {
        return uiIcon('home', 12);
      }
      if (tab.url === 'aero://games') {
        return window.GoldenGateIcons.getIconSVG('games', 13);
      }
      let domain = '';
      try {
        domain = new URL(tab.url.startsWith('http') ? tab.url : `https://${tab.url}`).hostname;
      } catch (e) {}
      if (domain) {
        return `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" onerror="this.onerror=null;this.parentElement.innerHTML='${uiIcon('globe', 12)}';" style="width:12px;height:12px;object-fit:contain;vertical-align:middle;" />`;
      }
      return uiIcon('globe', 12);
    }

    function toProxyUrl(targetUrl) {
      if (!targetUrl || targetUrl.startsWith('aero://')) return null;
      const backend = (localStorage.getItem('aero_invisiproxy_url') || DEFAULT_INVISIPROXY_URL).trim().replace(/\/+$/, '');
      const fullUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') ? targetUrl : `https://${targetUrl}`;
      if (backend) {
        return `${backend}/scramjet/${fullUrl}`;
      }
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocal) {
        return `/proxy?url=${encodeURIComponent(fullUrl)}`;
      }
      return null;
    }

    function openInAboutBlank(url, title) {
      if (!url || url.startsWith('aero://')) return;
      const backend = (localStorage.getItem('aero_invisiproxy_url') || DEFAULT_INVISIPROXY_URL).trim().replace(/\/+$/, '');
      const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const finalSrc = backend ? `${backend}/scramjet/${fullUrl}` : fullUrl;

      const win = window.open('about:blank', '_blank');
      if (!win) {
        window.open(finalSrc, '_blank', 'noopener');
        return;
      }
      try {
        const doc = win.document;
        doc.title = title || 'Google';
        const link = doc.createElement('link');
        link.rel = 'icon';
        link.href = 'https://www.google.com/favicon.ico';
        doc.head.appendChild(link);

        const iframe = doc.createElement('iframe');
        iframe.src = finalSrc;
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100vw';
        iframe.style.height = '100vh';
        iframe.style.border = 'none';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.setAttribute('allow', 'fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write');

        doc.body.style.margin = '0';
        doc.body.style.padding = '0';
        doc.body.style.height = '100vh';
        doc.body.style.overflow = 'hidden';
        doc.body.appendChild(iframe);
      } catch (err) {
        win.location.href = finalSrc;
      }
    }

    bodyEl.innerHTML = `
      <div class="aero-browser">
        <!-- Top Browser Chrome Header -->
        <header class="aero-chrome-header">
          <!-- Row 1: Modern Tab Bar -->
          <div class="aero-tabs-bar">
            <div class="aero-tabs-scroller" id="aero-tabs-scroller"></div>
            <button class="aero-new-tab-btn" id="aero-new-tab-btn" title="New Tab">${uiIcon('plus', 13)}</button>

            <div class="aero-chrome-spacer"></div>

            <div class="aero-top-actions">
              <button class="aero-top-action-btn" id="aero-proxy-badge-btn" title="InvisiProxy Status">
                <span class="aero-status-dot"></span>
                <span>InvisiProxy</span>
              </button>
              <button class="aero-top-action-btn" id="aero-open-blank-btn" title="Open in about:blank (Cloaked)">
                ${uiIcon('external', 12)}
                <span>about:blank</span>
              </button>
            </div>
          </div>

          <!-- Row 2: Navigation & URL Toolbar -->
          <div class="aero-nav-bar"><div class="aero-load-bar" id="aero-load-bar"></div>
            <div class="aero-nav-btns">
              <button class="aero-nav-btn" id="aero-nav-back" title="Back">${uiIcon('back', 13)}</button>
              <button class="aero-nav-btn" id="aero-nav-forward" title="Forward">${uiIcon('forward', 13)}</button>
              <button class="aero-nav-btn" id="aero-nav-reload" title="Reload">${uiIcon('rotate', 13)}</button>
              <button class="aero-nav-btn" id="aero-nav-home" title="Home">${uiIcon('home', 14)}</button>
            </div>

            <!-- Centered Omnibox -->
            <form class="aero-omnibox-form" id="aero-url-form">
              <div class="aero-omnibox-lock" id="aero-omnibox-lock">
                ${uiIcon('lock', 12)}
              </div>
              <input type="text" class="aero-omnibox-input" id="aero-url-input" placeholder="Search Aero" autocomplete="off" spellcheck="false" />
              <button type="button" class="aero-omnibox-clear hidden" id="aero-url-clear" title="Clear">${uiIcon('close', 10)}</button>
              <button type="submit" class="aero-omnibox-go" id="aero-url-go" title="Go">${uiIcon('forward', 12)}</button>
            </form>

            <div class="aero-toolbar-right">
              <button class="aero-nav-btn" id="aero-games-btn" title="Games Hub">${window.GoldenGateIcons.getIconSVG('games', 15)}</button>
              <button class="aero-nav-btn" id="aero-pin-btn" title="Add Shortcut to Desktop">${uiIcon('pin', 13)}</button>
            </div>
          </div>
        </header>

        <!-- Main Viewport -->
        <main class="aero-viewport" id="aero-viewport"></main>
      </div>
    `;

    const viewport = bodyEl.querySelector('#aero-viewport');
    const tabsScroller = bodyEl.querySelector('#aero-tabs-scroller');
    const urlInput = bodyEl.querySelector('#aero-url-input');
    const urlClearBtn = bodyEl.querySelector('#aero-url-clear');
    const backBtn = bodyEl.querySelector('#aero-nav-back');
    const forwardBtn = bodyEl.querySelector('#aero-nav-forward');
    const reloadBtn = bodyEl.querySelector('#aero-nav-reload');
    const homeBtn = bodyEl.querySelector('#aero-nav-home');
    const blankBtn = bodyEl.querySelector('#aero-open-blank-btn');
    const proxyBadgeBtn = bodyEl.querySelector('#aero-proxy-badge-btn');
    const gamesBtn = bodyEl.querySelector('#aero-games-btn');
    const pinBtn = bodyEl.querySelector('#aero-pin-btn');

    function mountPaneContent(pane, tab) {
      pane.dataset.mountedUrl = tab.url;

      if (tab.url === 'aero://home') {
        pane.innerHTML = `
          <div style="width:100%;height:100%;overflow-y:auto;background:#090d16;">
            <div class="aero-home-container">
              <!-- Aero Hero -->
              <div class="aero-brand-hero">
                <div class="aero-hero-logo">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
                    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#ffffff" stroke-width="2" fill="rgba(255, 255, 255, 0.16)"/>
                    <path d="M9.8 8.3C9.8 7.5 10.7 7.05 11.38 7.48L16.4 10.68C17.02 11.07 17.02 11.93 16.4 12.32L11.38 15.52C10.7 15.95 9.8 15.5 9.8 14.7V8.3Z" fill="#ffffff"/>
                  </svg>
                </div>
                <h1 class="aero-hero-title">Aero</h1>
                <p class="aero-hero-sub">Fast, Private, Proxied Web Browsing</p>
              </div>

              <!-- Main Centered Search Box -->
              <form class="aero-home-search-form" style="width:100%;display:flex;justify-content:center;">
                <div class="aero-home-search-box">
                  <span style="color:#94a3b8;display:flex;align-items:center;">${uiIcon('search', 16)}</span>
                  <input type="text" class="aero-home-search-in" placeholder="Search Aero" autocomplete="off" />
                  <button type="submit" class="aero-home-search-btn">
                    <span>Search</span>
                    ${uiIcon('forward', 12)}
                  </button>
                </div>
              </form>

              <!-- Speed Dial Shortcuts with Real Website Icons -->
              <div class="aero-speed-dial">
                ${QUICK_SITES.map(
                  (s) => `
                  <a href="#" class="aero-speed-card" data-url="${s.url}" data-title="${s.title}">
                    <div class="aero-speed-icon" style="background:${s.color}15;border:1px solid ${s.color}35;">
                      ${getWebsiteFavicon(s.url, s.title, s.color)}
                    </div>
                    <span class="aero-speed-title">${s.title}</span>
                  </a>
                `
                ).join('')}
              </div>

              <!-- InvisiProxy Backend Configuration Card -->
              <div class="aero-backend-card">
                <div class="aero-backend-header">
                  <div class="aero-backend-title">
                    ${uiIcon('shield', 14)}
                    <span>InvisiProxy Backend</span>
                  </div>
                  <span class="aero-backend-status">Connected</span>
                </div>
                <div class="aero-backend-row">
                  <input type="text" class="aero-backend-in" placeholder="https://your-invisiproxy.app.github.dev" value="${localStorage.getItem('aero_invisiproxy_url') || DEFAULT_INVISIPROXY_URL}" />
                  <button type="button" class="aero-backend-save-btn">Save</button>
                </div>
              </div>
            </div>
          </div>
        `;

        function handleSearchOrUrl(raw) {
          const trimmed = (raw || '').trim();
          if (!trimmed) return;
          const nextUrl = normalizeUrl(trimmed);
          navigateTab(nextUrl, trimmed);
        }

        pane.querySelector('.aero-home-search-form')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const q = pane.querySelector('.aero-home-search-in')?.value;
          handleSearchOrUrl(q);
        });

        pane.querySelectorAll('.aero-speed-card').forEach((card) => {
          card.onclick = (e) => {
            e.preventDefault();
            handleSearchOrUrl(card.dataset.url);
          };
        });

        const backendIn = pane.querySelector('.aero-backend-in');
        pane.querySelector('.aero-backend-save-btn')?.addEventListener('click', () => {
          if (backendIn) {
            const val = backendIn.value.trim().replace(/\/+$/, '');
            localStorage.setItem('aero_invisiproxy_url', val);
            if (window.GoldenGateOS?.showToast) {
              window.GoldenGateOS.showToast('InvisiProxy Backend Saved');
            }
          }
        });
      } else if (tab.url === 'aero://games') {
        pane.innerHTML = '';
        renderGamesSection(pane);
      } else {
        const proxiedSrc = toProxyUrl(tab.url);
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (!proxiedSrc && !isLocal) {
          pane.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;background:#090d16;padding:32px;text-align:center;box-sizing:border-box;">
              <div style="max-width:500px;display:flex;flex-direction:column;align-items:center;gap:14px;background:#0d121f;border:1px solid rgba(255,255,255,0.1);padding:32px 28px;border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,0.4);">
                <div style="width:48px;height:48px;border-radius:14px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);display:flex;align-items:center;justify-content:center;color:#38bdf8;">
                  ${uiIcon('shield', 22)}
                </div>
                <div style="font-size:20px;font-weight:700;color:#f8fafc;">InvisiProxy Backend Required</div>
                <div style="font-size:13px;color:#94a3b8;line-height:1.6;">
                  GitHub Pages restricts direct external framing. Connect your InvisiProxy backend or open seamlessly in about:blank cloaked tab.
                </div>
                <div style="display:flex;gap:8px;width:100%;margin-top:4px;">
                  <input type="text" class="tab-fallback-in" placeholder="https://your-invisiproxy.app.github.dev" value="${localStorage.getItem('aero_invisiproxy_url') || DEFAULT_INVISIPROXY_URL}" style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.14);border-radius:7px;padding:0 12px;height:38px;color:#fff;font-size:12.5px;outline:none;" />
                  <button type="button" class="tab-fallback-save" style="background:#38bdf8;color:#040812;border:none;padding:0 16px;border-radius:7px;font-size:12.5px;font-weight:700;cursor:pointer;">Connect</button>
                </div>
                <button type="button" class="tab-fallback-blank" style="margin-top:6px;width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#ffffff;padding:10px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  ${uiIcon('external', 13)}
                  <span>Launch in about:blank</span>
                </button>
              </div>
            </div>
          `;

          pane.querySelector('.tab-fallback-save')?.addEventListener('click', () => {
            const val = pane.querySelector('.tab-fallback-in')?.value.trim().replace(/\/+$/, '');
            if (val) {
              localStorage.setItem('aero_invisiproxy_url', val);
              mountPaneContent(pane, tab);
            }
          });

          pane.querySelector('.tab-fallback-blank')?.addEventListener('click', () => {
            openInAboutBlank(tab.url, tab.title);
          });
        } else {
          pane.innerHTML = `
            <div style="display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#090d16;position:relative;">
              <div style="position:absolute;top:10px;right:14px;z-index:20;display:flex;gap:6px;opacity:0.75;transition:opacity 0.2s;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.75'">
                <button class="aero-tab-floating-btn" style="background:rgba(13,18,31,0.85);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.15);color:#cbd5e1;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                  ${uiIcon('external', 11)}
                  <span>Pop out</span>
                </button>
              </div>
              <iframe class="aero-iframe" src="${proxiedSrc}" style="flex:1;width:100%;border:none;background:#ffffff;" allow="fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write"></iframe>
            </div>
          `;

          pane.querySelector('.aero-tab-floating-btn')?.addEventListener('click', () => {
            openInAboutBlank(tab.url, tab.title);
          });
        }
      }
    }

    function syncSidebarAndPanes() {
      const activeTab = getActiveTab();
      if (urlInput) {
        urlInput.value = activeTab.url === 'aero://home' ? '' : activeTab.url;
        urlClearBtn?.classList.toggle('hidden', !urlInput.value);
      }

      // Update Back / Forward buttons disabled state
      if (backBtn) backBtn.disabled = (activeTab.historyIdx || 0) <= 0;
      if (forwardBtn) forwardBtn.disabled = (activeTab.historyIdx || 0) >= (activeTab.history || []).length - 1;

      // Render horizontal tab strip
      tabsScroller.innerHTML = tabs
        .map(
          (t) => `
        <div class="aero-tab ${t.id === activeTabId ? 'active' : ''}" data-tid="${t.id}" title="${t.title}">
          <span class="aero-tab-icon">${getTabIcon(t)}</span>
          <span class="aero-tab-title">${t.title}</span>
          ${
            tabs.length > 1
              ? `<span class="aero-tab-close" data-close-tid="${t.id}" title="Close tab">${uiIcon('close', 9)}</span>`
              : ''
          }
        </div>
      `
        )
        .join('');

      // Clean up removed panes
      for (const [tid, paneEl] of tabPaneEls.entries()) {
        if (!tabs.some((t) => t.id === tid)) {
          paneEl.remove();
          tabPaneEls.delete(tid);
        }
      }

      // Mount or toggle pane visibility with smooth crossfade
      tabs.forEach((t) => {
        let pane = tabPaneEls.get(t.id);
        if (!pane) {
          pane = document.createElement('div');
          pane.className = 'aero-tab-pane';
          viewport.appendChild(pane);
          tabPaneEls.set(t.id, pane);
        }
        if (pane.dataset.mountedUrl !== t.url) {
          mountPaneContent(pane, t);
        }
        pane.classList.toggle('active', t.id === activeTabId);
      });

      // Tab click & close listeners
      tabsScroller.querySelectorAll('.aero-tab').forEach((tabEl) => {
        tabEl.onclick = (e) => {
          const closeBtn = e.target.closest('[data-close-tid]');
          if (closeBtn) {
            e.stopPropagation();
            const cid = closeBtn.dataset.closeTid;
            tabs = tabs.filter((t) => t.id !== cid);
            if (activeTabId === cid) activeTabId = tabs[0].id;
            syncSidebarAndPanes();
            return;
          }
          activeTabId = tabEl.dataset.tid;
          syncSidebarAndPanes();
        };
      });
    }

    function navigateTab(rawUrl, explicitTitle, pushHistory = true) {
      const nextUrl = normalizeUrl(rawUrl);
      const nextTitle = explicitTitle || getShortTitle(nextUrl);
      const tab = getActiveTab();

      tab.url = nextUrl;
      tab.title = nextTitle;

      if (!tab.history) tab.history = [nextUrl];
      if (pushHistory) {
        if (tab.historyIdx === undefined) tab.historyIdx = 0;
        tab.history = tab.history.slice(0, tab.historyIdx + 1);
        tab.history.push(nextUrl);
        tab.historyIdx = tab.history.length - 1;
      }

      const loadBar = bodyEl.querySelector('#aero-load-bar');
      if (loadBar) {
        loadBar.className = 'aero-load-bar active';
        setTimeout(() => {
          loadBar.className = 'aero-load-bar done';
          setTimeout(() => { loadBar.className = 'aero-load-bar'; }, 350);
        }, 500);
      }

      syncSidebarAndPanes();
    }

    // Top action bar wiring
    bodyEl.querySelector('#aero-new-tab-btn')?.addEventListener('click', () => {
      const nid = 'vt-' + Date.now();
      tabs.push({ id: nid, title: 'Home', url: 'aero://home', history: ['aero://home'], historyIdx: 0 });
      activeTabId = nid;
      syncSidebarAndPanes();
    });

    backBtn?.addEventListener('click', () => {
      const tab = getActiveTab();
      if (tab.history && tab.historyIdx > 0) {
        tab.historyIdx--;
        navigateTab(tab.history[tab.historyIdx], null, false);
      }
    });

    forwardBtn?.addEventListener('click', () => {
      const tab = getActiveTab();
      if (tab.history && tab.historyIdx < tab.history.length - 1) {
        tab.historyIdx++;
        navigateTab(tab.history[tab.historyIdx], null, false);
      }
    });

    reloadBtn?.addEventListener('click', () => {
      const activeTab = getActiveTab();
      const pane = tabPaneEls.get(activeTab.id);
      if (pane) mountPaneContent(pane, activeTab);
    });

    homeBtn?.addEventListener('click', () => {
      navigateTab('aero://home', 'Home');
    });

    blankBtn?.addEventListener('click', () => {
      const activeTab = getActiveTab();
      openInAboutBlank(activeTab.url, activeTab.title);
    });

    proxyBadgeBtn?.addEventListener('click', () => {
      navigateTab('aero://home', 'Home');
      if (window.GoldenGateOS?.showToast) {
        window.GoldenGateOS.showToast('InvisiProxy Backend settings');
      }
    });

    gamesBtn?.addEventListener('click', () => {
      navigateTab('aero://games', 'Games');
    });

    pinBtn?.addEventListener('click', () => {
      const activeTab = getActiveTab();
      if (window.GoldenGateOS?.addWebsiteShortcut) {
        window.GoldenGateOS.addWebsiteShortcut({ title: activeTab.title, url: activeTab.url });
      }
    });

    // Omnibox URL Form
    bodyEl.querySelector('#aero-url-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = urlInput.value.trim();
      if (val) navigateTab(val);
    });

    urlInput?.addEventListener('input', () => {
      urlClearBtn?.classList.toggle('hidden', !urlInput.value);
    });

    urlClearBtn?.addEventListener('click', () => {
      urlInput.value = '';
      urlClearBtn.classList.add('hidden');
      urlInput.focus();
    });

    if (options.initialUrl) {
      const startUrl = normalizeUrl(options.initialUrl);
      tabs[0].url = startUrl;
      tabs[0].title = options.initialTitle || getShortTitle(startUrl);
      tabs[0].history = [startUrl];
      tabs[0].historyIdx = 0;
    }

    syncSidebarAndPanes();
    return { navigate: navigateTab };
  }

  // ==========================================================================
  // 4. code (Code Editor with Syntax Highlighting, Line Numbers & JS Runner)
  // ==========================================================================
  function renderCode(bodyEl) {
    const STORAGE_KEY = 'webos_code_editor_v1';
    const DEFAULT_CODE = `// AeroOS Code Scratchpad
function calculateFibonacci(limit) {
  const seq = [0, 1];
  for (let i = 2; i < limit; i++) {
    seq.push(seq[i - 1] + seq[i - 2]);
  }
  return seq;
}

const result = calculateFibonacci(10);
console.log("Fibonacci(10):", result.join(", "));
`;

    let currentLang = 'javascript';
    const savedCode = localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE;

    function highlightSyntax(code) {
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return escaped
        .replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="tok-comment">$1</span>')
        .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="tok-str">$1</span>')
        .replace(
          /\b(const|let|var|function|return|if|else|for|while|async|await|class|new|import|from|export|def|print|true|false|null)\b/g,
          '<span class="tok-kw">$1</span>'
        )
        .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
    }

    bodyEl.innerHTML = `
      <div class="code-editor-shell">
        <div class="code-toolbar">
          <div style="display:flex;align-items:center;gap:8px;">
            <select id="code-lang-sel" class="clean-input" style="width:120px;padding:4px 8px;font-size:11.5px;">
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="html">HTML / CSS</option>
            </select>
            <span id="code-status" style="font-size:11px;color:#94a3b8;">Saved</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-flat" id="code-clear-btn">Reset</button>
            <button class="btn-solid" id="code-run-btn">Run JS</button>
          </div>
        </div>
        <div class="code-stage">
          <div class="code-gutter" id="code-gutter">1</div>
          <div class="code-canvas-wrap">
            <pre class="code-highlight-layer" id="code-hi-layer" aria-hidden="true"></pre>
            <textarea class="code-textarea" id="code-textarea" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
          </div>
        </div>
        <div class="code-console" id="code-console">
          <div style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Console Output</div>
          <div id="code-console-out" style="font-family:var(--font-mono);font-size:12px;color:#e2e8f0;margin-top:4px;white-space:pre-wrap;">Ready. Click Run JS to execute.</div>
        </div>
      </div>
    `;

    const textarea = bodyEl.querySelector('#code-textarea');
    const hiLayer = bodyEl.querySelector('#code-hi-layer');
    const gutter = bodyEl.querySelector('#code-gutter');
    const statusEl = bodyEl.querySelector('#code-status');
    const consoleOut = bodyEl.querySelector('#code-console-out');
    const langSel = bodyEl.querySelector('#code-lang-sel');

    textarea.value = savedCode;

    function syncEditor() {
      const val = textarea.value;
      hiLayer.innerHTML = highlightSyntax(val) + '\n';
      const linesCount = val.split('\n').length;
      gutter.innerHTML = Array.from({ length: linesCount }, (_, i) => i + 1).join('<br/>');
      localStorage.setItem(STORAGE_KEY, val);
      window.dispatchEvent(new CustomEvent('code:changed'));
      statusEl.textContent = `${linesCount} lines`;
    }

    textarea.addEventListener('input', syncEditor);
    textarea.addEventListener('scroll', () => {
      hiLayer.scrollTop = textarea.scrollTop;
      hiLayer.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        syncEditor();
      }
    });

    langSel.onchange = () => {
      currentLang = langSel.value;
      syncEditor();
    };

    bodyEl.querySelector('#code-clear-btn').onclick = () => {
      textarea.value = DEFAULT_CODE;
      syncEditor();
    };

    bodyEl.querySelector('#code-run-btn').onclick = () => {
      const logs = [];
      const customConsole = {
        log: (...args) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.join(' ')),
        warn: (...args) => logs.push('WARN: ' + args.join(' '))
      };
      try {
        const fn = new Function('console', textarea.value);
        const ret = fn(customConsole);
        if (ret !== undefined) logs.push(`Return: ${JSON.stringify(ret)}`);
        consoleOut.textContent = logs.length > 0 ? logs.join('\n') : 'Executed with no output.';
      } catch (err) {
        consoleOut.textContent = `Runtime Error: ${err.message}`;
      }
    };

    syncEditor();
  }

  // ==========================================================================
  // 5. monitor (System Monitor displaying FPS, Storage Usage & Active DOM Elements)
  // ==========================================================================
  function renderMonitor(bodyEl) {
    bodyEl.innerHTML = `
      <div class="monitor-shell">
        <div class="monitor-cards-row">
          <div class="monitor-stat-card">
            <span class="monitor-stat-label">Frame Rate</span>
            <span class="monitor-stat-val" id="mon-fps-val">60 FPS</span>
          </div>
          <div class="monitor-stat-card">
            <span class="monitor-stat-label">DOM Elements</span>
            <span class="monitor-stat-val" id="mon-dom-val">0</span>
          </div>
          <div class="monitor-stat-card">
            <span class="monitor-stat-label">Storage Usage</span>
            <span class="monitor-stat-val" id="mon-storage-val">0 KB</span>
          </div>
        </div>
        <div class="monitor-chart-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:600;color:#fff;">Real-Time Frame Rate History</span>
            <span id="mon-win-count" style="font-size:11px;color:#38bdf8;">Active Windows</span>
          </div>
          <canvas id="mon-fps-canvas" width="560" height="170" style="width:100%;height:170px;display:block;"></canvas>
        </div>
      </div>
    `;

    const fpsEl = bodyEl.querySelector('#mon-fps-val');
    const domEl = bodyEl.querySelector('#mon-dom-val');
    const storageEl = bodyEl.querySelector('#mon-storage-val');
    const winCountEl = bodyEl.querySelector('#mon-win-count');
    const canvas = bodyEl.querySelector('#mon-fps-canvas');
    const ctx = canvas.getContext('2d');

    const fpsHistory = new Array(60).fill(60);
    let frames = 0;
    let lastSecond = performance.now();
    let rafId = null;

    function getStorageKB() {
      let bytes = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || '';
          bytes += (k.length + v.length) * 2;
        }
      } catch (e) {}
      return (bytes / 1024).toFixed(2);
    }

    function drawChart() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let y = 30; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.beginPath();
      const step = canvas.width / (fpsHistory.length - 1);
      fpsHistory.forEach((val, idx) => {
        const clamped = Math.min(120, Math.max(0, val));
        const y = canvas.height - (clamped / 120) * (canvas.height - 20) - 10;
        if (idx === 0) ctx.moveTo(0, y);
        else ctx.lineTo(idx * step, y);
      });
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    function tick(now) {
      if (!bodyEl.isConnected) return;
      frames++;
      if (now - lastSecond >= 500) {
        const currentFps = Math.min(120, Math.round((frames * 1000) / (now - lastSecond)));
        frames = 0;
        lastSecond = now;
        fpsHistory.push(currentFps);
        if (fpsHistory.length > 60) fpsHistory.shift();

        if (fpsEl) fpsEl.textContent = `${currentFps} FPS`;
        if (domEl) domEl.textContent = String(document.getElementsByTagName('*').length);
        if (storageEl) storageEl.textContent = `${getStorageKB()} KB`;
        const openWins = document.querySelectorAll('.app-window:not(.hidden)').length;
        if (winCountEl) winCountEl.textContent = `${openWins} open windows`;
        drawChart();
      }
      rafId = requestAnimationFrame(tick);
    }

    drawChart();
    rafId = requestAnimationFrame(tick);
  }

  // ==========================================================================
  // 6. photos (Photo Viewer with Zoom, Rotate & Interactive Crop Controls)
  // ==========================================================================
  function renderPhotos(bodyEl) {
    const SAMPLES = [
      { name: 'Aurora', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=900&q=80' },
      { name: 'Cyberpunk', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=900&q=80' },
      { name: 'Mountains', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=80' }
    ];

    let zoom = 1;
    let rotation = 0;
    let cropMode = false;
    const imgObj = new Image();
    imgObj.crossOrigin = 'anonymous';

    bodyEl.innerHTML = `
      <div class="photos-shell">
        <div class="photos-toolbar">
          <div style="display:flex;align-items:center;gap:6px;">
            ${SAMPLES.map((s, idx) => `<button class="btn-flat photo-sample-btn" data-idx="${idx}">${s.name}</button>`).join('')}
            <button class="btn-flat" id="photo-upload-btn">Local File</button>
            <input type="file" id="photo-file-in" accept="image/*" class="hidden" />
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:11px;color:#94a3b8;">Zoom</span>
            <input type="range" id="photo-zoom-slider" min="0.5" max="3" step="0.1" value="1" style="width:90px;accent-color:#0a84ff;cursor:pointer;" />
            <button class="btn-flat" id="photo-rotate-btn" title="Rotate 90 deg">${window.GoldenGateIcons.getUiIcon('rotate', 13)}</button>
            <button class="btn-flat" id="photo-crop-toggle" title="Toggle Crop Box">${window.GoldenGateIcons.getUiIcon('crop', 13)} Crop</button>
            <button class="btn-solid hidden" id="photo-crop-apply">Apply Crop</button>
          </div>
        </div>
        <div class="photos-stage" id="photos-stage">
          <canvas id="photos-canvas" width="640" height="400"></canvas>
          <div id="photos-crop-box" class="photos-crop-box hidden"></div>
        </div>
      </div>
    `;

    const canvas = bodyEl.querySelector('#photos-canvas');
    const ctx = canvas.getContext('2d');
    const cropBox = bodyEl.querySelector('#photos-crop-box');
    const cropApplyBtn = bodyEl.querySelector('#photo-crop-apply');
    const zoomSlider = bodyEl.querySelector('#photo-zoom-slider');
    const fileIn = bodyEl.querySelector('#photo-file-in');

    function drawImageToCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!imgObj.complete || !imgObj.naturalWidth) return;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const scale = Math.min(
        (canvas.width * 0.88) / imgObj.naturalWidth,
        (canvas.height * 0.88) / imgObj.naturalHeight
      );
      const drawW = imgObj.naturalWidth * scale;
      const drawH = imgObj.naturalHeight * scale;
      ctx.drawImage(imgObj, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    function loadUrl(url) {
      zoom = 1;
      rotation = 0;
      zoomSlider.value = '1';
      imgObj.onload = () => drawImageToCanvas();
      imgObj.src = toProxyUrl(url);
    }

    bodyEl.querySelectorAll('.photo-sample-btn').forEach((btn) => {
      btn.onclick = () => loadUrl(SAMPLES[Number(btn.dataset.idx)].url);
    });

    bodyEl.querySelector('#photo-upload-btn').onclick = () => fileIn.click();
    fileIn.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        imgObj.onload = () => drawImageToCanvas();
        imgObj.src = reader.result;
      };
      reader.readAsDataURL(file);
    };

    zoomSlider.oninput = (e) => {
      zoom = Number(e.target.value);
      drawImageToCanvas();
    };

    bodyEl.querySelector('#photo-rotate-btn').onclick = () => {
      rotation = (rotation + 90) % 360;
      drawImageToCanvas();
    };

    bodyEl.querySelector('#photo-crop-toggle').onclick = () => {
      cropMode = !cropMode;
      cropBox.classList.toggle('hidden', !cropMode);
      cropApplyBtn.classList.toggle('hidden', !cropMode);
    };

    cropApplyBtn.onclick = () => {
      // Crop center 60% of the canvas
      const cw = Math.round(canvas.width * 0.6);
      const ch = Math.round(canvas.height * 0.6);
      const sx = Math.round((canvas.width - cw) / 2);
      const sy = Math.round((canvas.height - ch) / 2);

      const temp = document.createElement('canvas');
      temp.width = cw;
      temp.height = ch;
      temp.getContext('2d').drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(temp, 0, 0, cw, ch, sx, sy, cw, ch);
      cropMode = false;
      cropBox.classList.add('hidden');
      cropApplyBtn.classList.add('hidden');
      window.GoldenGateOS.showToast('Image cropped');
    };

    loadUrl(SAMPLES[0].url);
  }

  // ==========================================================================
  // 7. wallpaper (Optimized with wsrv.nl WebP Thumbnails, Caching & Pagination)
  // ==========================================================================
  const repoCache = new Map();

  function renderWallpaper(bodyEl, options = {}) {
    let activeTab = options.tab || 'repo';
    let currentRepo = 'https://github.com/dharmx/walls';

    bodyEl.innerHTML = `
      <div style="padding:14px;display:flex;flex-direction:column;gap:12px;height:100%;">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-flat wp-tab" data-tab="local">local</button>
          <button class="btn-flat wp-tab" data-tab="repo">repo</button>
          <button class="btn-flat wp-tab" data-tab="fluid">fluid</button>
        </div>
        <div id="wp-panel" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;

    const panel = bodyEl.querySelector('#wp-panel');

    function parseRepoPath(inputUrl) {
      const cleaned = inputUrl
        .trim()
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\/+$/, '');
      const parts = cleaned.split('/');
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1], subpath: parts.slice(2).join('/') };
      }
      return { owner: 'dharmx', repo: 'walls', subpath: '' };
    }

    function getOptimizedThumbUrl(rawUrl) {
      return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=240&h=150&fit=cover&q=65&output=webp`;
    }

    async function loadRepoContents(repoStr, folderPath = '', pageLimit = 12) {
      const { owner, repo } = parseRepoPath(repoStr);
      const gridWrap = panel.querySelector('#repo-results');
      if (!gridWrap) return;

      const cacheKey = `${owner}/${repo}/${folderPath}`;
      let items = repoCache.get(cacheKey);

      if (!items) {
        gridWrap.innerHTML = `<div style="padding:12px;font-size:12px;opacity:0.75;">Loading ${owner}/${repo}/${folderPath}...</div>`;
        try {
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}`;
          const res = await fetch(apiUrl);
          if (!res.ok) throw new Error('Repo request failed');
          items = await res.json();
          repoCache.set(cacheKey, items);
        } catch (err) {
          gridWrap.innerHTML = `<div style="padding:12px;font-size:12px;">Unable to fetch repo contents.</div>`;
          return;
        }
      }

      const dirs = items.filter((i) => i.type === 'dir' && !i.name.startsWith('.'));
      const images = items.filter(
        (i) => i.type === 'file' && /\.(jpg|jpeg|png|webp)$/i.test(i.name)
      );

      let html = '';

      if (folderPath) {
        html += `<div style="padding:0 12px 8px;display:flex;justify-content:space-between;align-items:center;">
          <button class="btn-flat" id="repo-back-btn" style="display:inline-flex;align-items:center;gap:6px;">${window.GoldenGateIcons.getUiIcon('back', 12)} <span>Folders</span></button>
          <span style="font-size:11px;color:#94a3b8;">${images.length} wallpapers</span>
        </div>`;
      }

      if (dirs.length > 0 && images.length === 0) {
        html += `
          <div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px;">
            ${dirs
              .map(
                (d) =>
                  `<button class="btn-flat repo-dir-btn" data-path="${d.path}">${d.name}</button>`
              )
              .join('')}
          </div>
        `;
      }

      if (images.length > 0) {
        const visibleImages = images.slice(0, pageLimit);
        html += `
          <div class="wall-grid">
            ${visibleImages
              .map(
                (img) => `
              <div class="wall-thumb" data-url="${img.download_url}" title="${img.name}">
                <img src="${getOptimizedThumbUrl(img.download_url)}" loading="lazy" decoding="async" width="240" height="150" alt="${img.name}" />
              </div>
            `
              )
              .join('')}
          </div>
          ${
            images.length > pageLimit
              ? `<div style="padding:4px 12px 14px;display:flex;justify-content:center;">
                  <button class="btn-flat" id="repo-load-more-btn">Load More (${images.length - pageLimit} remaining)</button>
                </div>`
              : ''
          }
        `;
      }

      gridWrap.innerHTML = html || `<div style="padding:12px;font-size:12px;">No images found in this path.</div>`;

      const backBtn = gridWrap.querySelector('#repo-back-btn');
      if (backBtn) {
        backBtn.onclick = () => loadRepoContents(repoStr, '', 12);
      }

      const moreBtn = gridWrap.querySelector('#repo-load-more-btn');
      if (moreBtn) {
        moreBtn.onclick = () => loadRepoContents(repoStr, folderPath, pageLimit + 12);
      }

      gridWrap.querySelectorAll('.repo-dir-btn').forEach((b) => {
        b.onclick = () => loadRepoContents(repoStr, b.dataset.path, 12);
      });

      gridWrap.querySelectorAll('.wall-thumb').forEach((t) => {
        t.onclick = () => {
          window.LiquidGLEngine.setCustomWallpaper(t.dataset.url);
          window.GoldenGateOS.showToast('Wallpaper updated');
        };
      });
    }

    function renderTab() {
      bodyEl.querySelectorAll('.wp-tab').forEach((b) => {
        b.className = b.dataset.tab === activeTab ? 'btn-solid wp-tab' : 'btn-flat wp-tab';
      });

      if (activeTab === 'local') {
        panel.innerHTML = `
          <div style="padding:16px;display:flex;flex-direction:column;gap:12px;align-items:flex-start;">
            <div style="font-size:13px;">Choose an image file from your computer:</div>
            <button class="btn-solid" id="pick-local-file-btn">Choose File...</button>
          </div>
        `;
        panel.querySelector('#pick-local-file-btn').onclick = () => {
          document.getElementById('local-wallpaper-input')?.click();
        };
      } else if (activeTab === 'repo') {
        panel.innerHTML = `
          <form id="repo-form" style="display:flex;gap:8px;padding:0 12px 10px;">
            <input type="text" class="clean-input" id="repo-url-input" value="${currentRepo}" placeholder="https://github.com/dharmx/walls" />
            <button type="submit" class="btn-solid">Fetch</button>
          </form>
          <div id="repo-results"></div>
        `;
        const rf = panel.querySelector('#repo-form');
        const ri = panel.querySelector('#repo-url-input');
        rf.onsubmit = (e) => {
          e.preventDefault();
          currentRepo = ri.value.trim();
          loadRepoContents(currentRepo, '', 12);
        };
        loadRepoContents(currentRepo, 'minimal', 12);
      } else {
        panel.innerHTML = `
          <div style="padding:16px;display:flex;flex-direction:column;gap:12px;align-items:flex-start;">
            <div style="font-size:13px;">Use the procedural LiquidGL fluid shader wallpaper.</div>
            <button class="btn-solid" id="restore-fluid-btn">Activate Fluid</button>
          </div>
        `;
        panel.querySelector('#restore-fluid-btn').onclick = () => {
          window.LiquidGLEngine.setCustomWallpaper('');
          window.GoldenGateOS.showToast('Fluid wallpaper active');
        };
      }
    }

    bodyEl.querySelectorAll('.wp-tab').forEach((b) => {
      b.onclick = () => {
        activeTab = b.dataset.tab;
        renderTab();
      };
    });

    renderTab();
  }

  // 8. files
  function renderFiles(bodyEl) {
    function draw() {
      const sc = window.GoldenGateOS.getShortcuts();
      bodyEl.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;height:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="kinetic-title" style="font-size:13px;font-weight:500;">Shortcuts (${sc.length})</span>
            <button class="btn-solid" id="files-new-sc" style="display:inline-flex;align-items:center;gap:6px;">${window.GoldenGateIcons.getUiIcon('plus', 11)} <span>Shortcut</span></button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;">
            ${sc
              .map(
                (item) => `
              <div style="padding:10px;border-radius:10px;background:rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <span style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.title}</span>
                <div style="display:flex;gap:4px;">
                  <button class="btn-flat f-open" data-url="${item.url}" data-title="${item.title}">Open</button>
                  <button class="btn-flat f-del" data-id="${item.id}" style="display:inline-flex;align-items:center;justify-content:center;">${window.GoldenGateIcons.getUiIcon('close', 11)}</button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      bodyEl.querySelector('#files-new-sc').onclick = () => window.GoldenGateOS.openShortcutModal();
      bodyEl.querySelectorAll('.f-open').forEach((b) => {
        b.onclick = () => window.GoldenGateOS.openUrlInBrowser(b.dataset.url, b.dataset.title);
      });
      bodyEl.querySelectorAll('.f-del').forEach((b) => {
        b.onclick = () => {
          window.GoldenGateOS.removeShortcut(b.dataset.id);
          draw();
        };
      });
    }
    draw();
  }

  // 9. glass
  function renderGlass(bodyEl) {
    const st = window.LiquidGLEngine.getState();
    bodyEl.innerHTML = `
      <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">Default B&amp;W Tint</span>
          <button class="btn-flat" id="g-reset-bw">Reset B&amp;W</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">Custom Tint Color</span>
          <input type="color" id="g-color" value="${st.tintColor}" style="background:transparent;border:none;width:36px;height:26px;cursor:pointer;" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">LiquidGL Enabled</span>
          <input type="checkbox" id="g-lgl" ${st.enabled ? 'checked' : ''} />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">Refraction</span>
          <input type="range" id="g-ref" min="0" max="60" value="${st.refraction}" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;">Blur</span>
          <input type="range" id="g-blur" min="0" max="36" value="${st.frost}" />
        </div>
      </div>
    `;

    bodyEl.querySelector('#g-reset-bw').onclick = () => {
      window.LiquidGLEngine.setState({ tintMode: 'bw', tintColor: '#ffffff', tintName: 'B&W' });
    };
    bodyEl.querySelector('#g-color').oninput = (e) => {
      window.LiquidGLEngine.setState({ tintMode: 'tinted', tintColor: e.target.value, tintName: 'Custom' });
    };
    bodyEl.querySelector('#g-lgl').onchange = (e) => {
      window.LiquidGLEngine.setState({ enabled: e.target.checked });
    };
    bodyEl.querySelector('#g-ref').oninput = (e) => {
      window.LiquidGLEngine.setState({ refraction: Number(e.target.value) });
    };
    bodyEl.querySelector('#g-blur').oninput = (e) => {
      window.LiquidGLEngine.setState({ frost: Number(e.target.value) });
    };
  }

  // 10. notes (Multi-note & List manager with OS Event Bus & Droplet Action API)
  const NOTES_LIST_KEY = 'webos_notes_collection_v1';
  let notesCollection = [];
  let activeNoteId = null;

  function loadNotesCollection() {
    try {
      const raw = localStorage.getItem(NOTES_LIST_KEY);
      if (raw) {
        notesCollection = JSON.parse(raw);
      }
    } catch (e) {
      notesCollection = [];
    }
    if (!Array.isArray(notesCollection) || notesCollection.length === 0) {
      const legacy = localStorage.getItem('webos_notes_v2') || 'Buy groceries\nFinish project report';
      notesCollection = [
        { id: 'note-1', title: 'Quick Note', content: legacy, updatedAt: Date.now() },
        { id: 'note-todo', title: 'Todo', content: '- Review system notifications', updatedAt: Date.now() }
      ];
    }
    if (!activeNoteId || !notesCollection.some((n) => n.id === activeNoteId)) {
      activeNoteId = notesCollection[0].id;
    }
  }

  function saveNotesCollection() {
    try {
      localStorage.setItem(NOTES_LIST_KEY, JSON.stringify(notesCollection));
      const active = getActiveNoteObj();
      if (active) localStorage.setItem('webos_notes_v2', active.content);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('notes:rendered'));
  }

  function getActiveNoteObj() {
    loadNotesCollection();
    return notesCollection.find((n) => n.id === activeNoteId) || notesCollection[0];
  }

  const notesApi = {
    getAllNotes() {
      loadNotesCollection();
      return notesCollection;
    },
    getActiveNote() {
      return getActiveNoteObj();
    },
    createNote(title, initialContent = '') {
      loadNotesCollection();
      const cleanTitle = (title || 'Untitled').trim();
      let existing = notesCollection.find((n) => n.title.toLowerCase() === cleanTitle.toLowerCase());
      if (existing) {
        activeNoteId = existing.id;
        if (initialContent) {
          existing.content = existing.content
            ? `${existing.content}\n${initialContent}`
            : initialContent;
          existing.updatedAt = Date.now();
        }
        saveNotesCollection();
        window.dispatchEvent(
          new CustomEvent('os:app-event', { detail: { type: 'notes:created', note: existing } })
        );
        return existing;
      }
      const newNote = {
        id: 'note-' + Date.now(),
        title: cleanTitle,
        content: initialContent,
        updatedAt: Date.now()
      };
      notesCollection.unshift(newNote);
      activeNoteId = newNote.id;
      saveNotesCollection();
      window.dispatchEvent(
        new CustomEvent('os:app-event', { detail: { type: 'notes:created', note: newNote } })
      );
      return newNote;
    },
    appendItem(itemText, targetTitle = '') {
      loadNotesCollection();
      let target = null;
      if (targetTitle) {
        target = notesCollection.find((n) => n.title.toLowerCase() === targetTitle.trim().toLowerCase());
        if (!target) {
          target = notesApi.createNote(targetTitle, '');
        }
      } else {
        target = getActiveNoteObj();
      }
      if (!target) return null;
      const line = `- ${itemText.trim()}`;
      target.content = target.content ? `${target.content.trim()}\n${line}` : line;
      target.updatedAt = Date.now();
      activeNoteId = target.id;
      saveNotesCollection();
      window.dispatchEvent(
        new CustomEvent('os:app-event', { detail: { type: 'notes:updated', note: target } })
      );
      return target;
    },
    deleteNote(titleOrId) {
      loadNotesCollection();
      const key = (titleOrId || '').trim().toLowerCase();
      const idx = notesCollection.findIndex(
        (n) => n.id.toLowerCase() === key || n.title.toLowerCase() === key
      );
      if (idx === -1) return null;
      const [removed] = notesCollection.splice(idx, 1);
      if (notesCollection.length === 0) {
        notesCollection.push({ id: 'note-' + Date.now(), title: 'Notes', content: '', updatedAt: Date.now() });
      }
      activeNoteId = notesCollection[0].id;
      saveNotesCollection();
      return removed;
    }
  };

  function renderNotes(bodyEl) {
    loadNotesCollection();

    function draw() {
      const active = getActiveNoteObj();
      bodyEl.innerHTML = `
        <div style="display:flex;height:100%;overflow:hidden;">
          <aside style="width:155px;background:rgba(0,0,0,0.28);border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;padding:10px;gap:6px;overflow-y:auto;">
            <button class="btn-solid" id="note-new-btn" style="font-size:11.5px;padding:5px 8px;">+ New Note</button>
            <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
              ${notesCollection
                .map(
                  (n) => `
                <div class="note-side-item" data-nid="${n.id}" style="padding:7px 9px;border-radius:8px;cursor:pointer;font-size:12px;background:${n.id === active.id ? 'rgba(56,189,248,0.22)' : 'transparent'};color:${n.id === active.id ? '#fff' : '#cbd5e1'};display:flex;justify-content:space-between;align-items:center;">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.title}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </aside>
          <div style="flex:1;display:flex;flex-direction:column;height:100%;">
            <div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <input type="text" id="note-title-in" class="clean-input" value="${active.title}" style="font-weight:600;font-size:13px;background:transparent;border-color:transparent;padding:3px 6px;" />
              <button class="btn-flat" id="note-del-btn" style="padding:3px 8px;font-size:11px;">Delete</button>
            </div>
            <textarea id="notes-area" style="flex:1;width:100%;background:transparent;border:none;outline:none;color:#fff;padding:14px;font-family:var(--font-mono);font-size:13px;resize:none;"></textarea>
          </div>
        </div>
      `;

      const area = bodyEl.querySelector('#notes-area');
      const titleIn = bodyEl.querySelector('#note-title-in');
      area.value = active.content;

      area.oninput = () => {
        active.content = area.value;
        active.updatedAt = Date.now();
        localStorage.setItem(NOTES_LIST_KEY, JSON.stringify(notesCollection));
        localStorage.setItem('webos_notes_v2', active.content);
        window.dispatchEvent(
          new CustomEvent('os:app-event', { detail: { type: 'notes:updated', note: active } })
        );
      };

      titleIn.onchange = () => {
        active.title = titleIn.value.trim() || 'Untitled';
        saveNotesCollection();
        draw();
      };

      bodyEl.querySelector('#note-new-btn').onclick = () => {
        notesApi.createNote(`Note ${notesCollection.length + 1}`, '');
        draw();
      };

      bodyEl.querySelector('#note-del-btn').onclick = () => {
        notesApi.deleteNote(active.id);
        draw();
      };

      bodyEl.querySelectorAll('.note-side-item').forEach((el) => {
        el.onclick = () => {
          activeNoteId = el.dataset.nid;
          draw();
        };
      });
    }

    draw();
    window.addEventListener('notes:rendered', () => {
      if (bodyEl.isConnected && document.activeElement !== bodyEl.querySelector('#notes-area')) {
        draw();
      }
    });
  }

  // 11. terminal (Supports OS action commands used by Droplet and users)
  function renderTerminal(bodyEl) {
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;padding:12px;font-family:var(--font-mono);font-size:12px;">
        <div id="term-out" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
          <div>Type help for commands. Try: app-open, app-close, music-play, music-pause, set-volume, set-tint, weather-fetch</div>
        </div>
        <form id="term-form" style="display:flex;gap:6px;margin-top:8px;">
          <span>$</span>
          <input type="text" id="term-in" autocomplete="off" style="flex:1;background:transparent;border:none;outline:none;color:#fff;font-family:inherit;font-size:inherit;" />
        </form>
      </div>
    `;
    const out = bodyEl.querySelector('#term-out');
    const input = bodyEl.querySelector('#term-in');
    bodyEl.querySelector('#term-form').onsubmit = (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      input.value = '';
      const line = document.createElement('div');
      line.textContent = `$ ${raw}`;
      out.appendChild(line);

      if (raw.toLowerCase() === 'clear') {
        out.innerHTML = '';
        return;
      }

      const resultText = window.GoldenGateOS.runTerminalCommand
        ? window.GoldenGateOS.runTerminalCommand(raw)
        : 'Command runner unavailable';

      const resp = document.createElement('div');
      resp.style.color = '#38bdf8';
      resp.textContent = resultText;
      out.appendChild(resp);
      out.scrollTop = out.scrollHeight;
    };
  }

  // 12. calc
  function renderCalc(bodyEl) {
    let expr = '';
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;padding:14px;gap:10px;">
        <div id="calc-disp" style="padding:12px;border-radius:10px;background:rgba(0,0,0,0.35);text-align:right;font-size:22px;font-weight:600;">0</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1;">
          ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=']
            .map(
              (k) =>
                `<button class="btn-flat c-btn" data-k="${k}" style="${
                  k === '=' ? 'grid-column:span 2;background:#0a84ff;' : ''
                }">${k}</button>`
            )
            .join('')}
        </div>
      </div>
    `;
    const disp = bodyEl.querySelector('#calc-disp');
    bodyEl.querySelectorAll('.c-btn').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (k === 'C') {
          expr = '';
          disp.textContent = '0';
        } else if (k === '=') {
          try {
            function safeEval(s) {
              const toks = s.match(/\d+(\.\d+)?|[+\-*/()]/g);
              if (!toks) return 0;
              let p = 0;
              function exp() {
                let v = term();
                while (p < toks.length && (toks[p] === '+' || toks[p] === '-')) {
                  const op = toks[p++];
                  const n = term();
                  v = op === '+' ? v + n : v - n;
                }
                return v;
              }
              function term() {
                let v = fact();
                while (p < toks.length && (toks[p] === '*' || toks[p] === '/')) {
                  const op = toks[p++];
                  const n = fact();
                  v = op === '*' ? v * n : (n !== 0 ? v / n : 0);
                }
                return v;
              }
              function fact() {
                if (toks[p] === '(') { p++; const v = exp(); if (toks[p] === ')') p++; return v; }
                if (toks[p] === '-') { p++; return -fact(); }
                return parseFloat(toks[p++]) || 0;
              }
              return exp();
            }
            expr = String(Number(safeEval(expr).toFixed(6)));
            disp.textContent = expr;
          } catch (e) {
            disp.textContent = 'Error';
            expr = '';
          }
        } else {
          expr += k;
          disp.textContent = expr;
        }
      };
    });
  }

  
  // 13. account / cloud sync
  function renderAccount(bodyEl) {
    let activeMode = 'signin'; // 'signin', 'signup', 'edit'
    let usernameDebounce = null;

    function updateUI() {
      const user = window.AeroAuth ? window.AeroAuth.getUser() : null;
      const username = window.AeroAuth ? window.AeroAuth.getUsername() : '';
      const profile = window.AeroAuth ? window.AeroAuth.getProfile() : { displayName: '', bio: '', avatarUrl: '' };
      const lastSync = window.AeroAuth ? window.AeroAuth.getLastSyncTime() : null;

      let playlistsCount = 0;
      let likedCount = 0;
      try {
        playlistsCount = JSON.parse(localStorage.getItem('webos_limusic_user_playlists_v2') || '[]').length;
        likedCount = JSON.parse(localStorage.getItem('webos_limusic_liked_v2') || '[]').length;
      } catch (e) {}

      if (user) {
        if (activeMode === 'edit') {
          renderEditProfile(profile, username, user.email);
          return;
        }

        const email = user.email || 'User';
        const dispName = profile.displayName || username || email;
        const initial = dispName.charAt(0).toUpperCase();
        const syncText = lastSync
          ? ('Synced at ' + lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
          : 'Cloud connected';

        bodyEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;padding:24px 20px;height:100%;box-sizing:border-box;gap:14px;text-align:center;overflow-y:auto;background:transparent;color:#fff;">
            
            <!-- Avatar with pencil button -->
            <div style="position:relative;width:74px;height:74px;">
              ${profile.avatarUrl ? `
                <img src="${profile.avatarUrl}" alt="Avatar"
                  style="width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.2);box-shadow:0 8px 24px rgba(0,0,0,0.35);background:#222;" />
              ` : `
                <div style="width:74px;height:74px;border-radius:50%;background:linear-gradient(135deg, #0a84ff, #5e5ce6);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;box-shadow:0 8px 24px rgba(10,132,255,0.35);">
                  ${initial}
                </div>
              `}
              <button id="acc-pencil-circle" title="Edit Profile"
                style="position:absolute;bottom:-2px;right:-2px;width:26px;height:26px;border-radius:50%;background:#ffffff;border:none;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer;padding:0;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#0a84ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
            </div>

            <div>
              <div style="font-size:18px;font-weight:700;color:#fff;">${dispName}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${username ? `@${username} • ` : ''}${email}</div>
              <div style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:#30d158;background:rgba(48,209,88,0.12);padding:3px 10px;border-radius:12px;border:1px solid rgba(48,209,88,0.25);">
                <span style="width:6px;height:6px;border-radius:50%;background:#30d158;"></span>
                <span>${syncText}</span>
              </div>
            </div>

            ${profile.bio ? `
              <div style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;color:rgba(255,255,255,0.85);font-size:13px;line-height:1.4;white-space:pre-wrap;text-align:left;">
${profile.bio}
              </div>
            ` : ''}

            <div style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left;box-sizing:border-box;">
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Playlists</div>
                <div style="font-size:20px;font-weight:700;color:#fff;margin-top:2px;">${playlistsCount}</div>
              </div>
              <div>
                <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.5px;">Liked Songs</div>
                <div style="font-size:20px;font-weight:700;color:#fff;margin-top:2px;">${likedCount}</div>
              </div>
            </div>

            <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:auto;">
              <button id="acc-edit-btn" class="btn-flat" style="width:100%;padding:10px;background:#0a84ff;color:#fff;font-weight:600;border-radius:8px;">
                Edit Profile
              </button>
              <div style="display:flex;gap:8px;">
                <button id="acc-sync-btn" class="btn-flat" style="flex:1;padding:9px;background:rgba(255,255,255,0.08);color:#fff;font-size:12px;border-radius:8px;">
                  Sync Now
                </button>
                <button id="acc-signout-btn" class="btn-flat" style="padding:9px 14px;background:rgba(255,69,58,0.15);color:#ff453a;font-size:12px;border:1px solid rgba(255,69,58,0.3);border-radius:8px;">
                  Sign Out
                </button>
              </div>
              <div style="display:flex;gap:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);">
                <button id="acc-export-btn" class="btn-flat" style="flex:1;padding:7px;background:rgba(255,255,255,0.05);color:#e2e8f0;font-size:11.5px;border-radius:8px;">Export Backup</button>
                <button id="acc-import-btn" class="btn-flat" style="flex:1;padding:7px;background:rgba(255,255,255,0.05);color:#e2e8f0;font-size:11.5px;border-radius:8px;">Import Backup</button>
                <input type="file" id="acc-import-file" accept=".json" style="display:none;" />
              </div>
            </div>
            <div id="acc-msg" style="font-size:12px;min-height:16px;"></div>
          </div>
        `;

        bodyEl.querySelector('#acc-pencil-circle').onclick = () => {
          activeMode = 'edit';
          updateUI();
        };
        bodyEl.querySelector('#acc-edit-btn').onclick = () => {
          activeMode = 'edit';
          updateUI();
        };
        bodyEl.querySelector('#acc-sync-btn').onclick = async () => {
          const btn = bodyEl.querySelector('#acc-sync-btn');
          btn.textContent = 'Syncing...';
          const res = await window.AeroAuth.saveToCloud();
          if (res && res.error) {
            btn.textContent = 'Sync Failed';
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast(res.error);
          } else {
            btn.textContent = 'Synced!';
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Cloud sync complete');
          }
          setTimeout(() => updateUI(), 1200);
        };
        bodyEl.querySelector('#acc-export-btn')?.addEventListener('click', () => {
          const backup = {
            version: 'aero-backup-v1',
            date: new Date().toISOString(),
            playlists: JSON.parse(localStorage.getItem('webos_limusic_user_playlists_v2') || '[]'),
            liked_songs: JSON.parse(localStorage.getItem('webos_limusic_liked_v2') || '[]'),
            listening_history: JSON.parse(localStorage.getItem('webos_limusic_recent_v2') || '[]'),
            music_settings: JSON.parse(localStorage.getItem('webos_limusic_settings_v1') || '{}'),
            desktop: JSON.parse(localStorage.getItem('webos_desktop_items_v5') || '[]'),
            notes: JSON.parse(localStorage.getItem('webos_notes_list_v2') || '[]'),
            code: localStorage.getItem('webos_code_editor_v1') || '',
            invisiproxy_url: localStorage.getItem('aero_invisiproxy_url') || '',
            lgl: JSON.parse(localStorage.getItem('webos_lgl_state_v2') || '{}')
          };
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `aero-backup-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Backup downloaded');
        });

        const importFileInp = bodyEl.querySelector('#acc-import-file');
        bodyEl.querySelector('#acc-import-btn')?.addEventListener('click', () => {
          importFileInp?.click();
        });
        importFileInp?.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const d = JSON.parse(evt.target.result);
              if (Array.isArray(d.playlists)) localStorage.setItem('webos_limusic_user_playlists_v2', JSON.stringify(d.playlists));
              if (Array.isArray(d.liked_songs)) localStorage.setItem('webos_limusic_liked_v2', JSON.stringify(d.liked_songs));
              if (Array.isArray(d.listening_history)) localStorage.setItem('webos_limusic_recent_v2', JSON.stringify(d.listening_history));
              if (d.music_settings) localStorage.setItem('webos_limusic_settings_v1', JSON.stringify(d.music_settings));
              if (Array.isArray(d.desktop)) {
                localStorage.setItem('webos_desktop_items_v5', JSON.stringify(d.desktop));
                window.dispatchEvent(new CustomEvent('desktop:reload'));
              }
              if (Array.isArray(d.notes)) {
                localStorage.setItem('webos_notes_list_v2', JSON.stringify(d.notes));
                window.dispatchEvent(new CustomEvent('notes:updated'));
              }
              if (d.code) localStorage.setItem('webos_code_editor_v1', d.code);
              if (d.invisiproxy_url) localStorage.setItem('aero_invisiproxy_url', d.invisiproxy_url);
              if (d.lgl) localStorage.setItem('webos_lgl_state_v2', JSON.stringify(d.lgl));

              window.GoldenGateMusic?.reloadLibrary?.();
              window.dispatchEvent(new CustomEvent('music:library-changed'));
              if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Backup restored successfully');
              updateUI();
            } catch (err) {
              if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Invalid backup file');
            }
          };
          reader.readAsText(file);
        });

        bodyEl.querySelector('#acc-signout-btn').onclick = async () => {
          await window.AeroAuth.signOut();
          activeMode = 'signin';
          updateUI();
        };
      } else {
        renderAuthForm();
      }
    }

    function renderEditProfile(profile, username, email) {
      let currentPfp = profile.avatarUrl || '';

      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;padding:20px;height:100%;box-sizing:border-box;gap:12px;overflow-y:auto;background:transparent;color:#fff;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:16px;font-weight:700;color:#fff;">Edit Profile</div>
            <button id="edit-cancel-btn" class="btn-flat" style="padding:4px 10px;background:rgba(255,255,255,0.08);color:#ccc;border-radius:6px;font-size:12px;">
              Cancel
            </button>
          </div>

          <div>
            <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Avatar</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px;">
              <input type="file" id="edit-pfp-file" accept="image/*" class="hidden" />
              <button id="edit-pfp-btn" class="btn-flat" type="button" style="padding:7px 12px;background:#0a84ff;color:#fff;border-radius:6px;font-size:12px;font-weight:600;">
                Upload Image
              </button>
              <input id="edit-pfp-url" type="text" placeholder="Or paste image URL" value="${currentPfp}"
                style="flex:1;box-sizing:border-box;padding:7px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:12px;" />
            </div>
          </div>

          <div>
            <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Display Name</label>
            <input id="edit-dispname" type="text" value="${profile.displayName || ''}" placeholder="Display name"
              style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:13px;" />
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Username</label>
              <span id="edit-username-status" style="font-size:11px;"></span>
            </div>
            <input id="edit-username-input" type="text" value="${username || ''}" placeholder="username"
              style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:13px;" />
          </div>

          <div>
            <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Bio</label>
            <textarea id="edit-bio-input" rows="3" placeholder="Write something about yourself..."
              style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:13px;resize:none;">${profile.bio || ''}</textarea>
          </div>

          <div style="margin-top:auto;padding-top:10px;">
            <button id="edit-save-btn" class="btn-flat" style="width:100%;padding:10px;background:#30d158;color:#fff;font-weight:700;border-radius:8px;">
              Save Profile
            </button>
            <div id="edit-msg" style="font-size:12px;text-align:center;margin-top:6px;min-height:16px;"></div>
          </div>
        </div>
      `;

      const cancelBtn = bodyEl.querySelector('#edit-cancel-btn');
      const pfpFile = bodyEl.querySelector('#edit-pfp-file');
      const pfpBtn = bodyEl.querySelector('#edit-pfp-btn');
      const pfpUrl = bodyEl.querySelector('#edit-pfp-url');
      const dispName = bodyEl.querySelector('#edit-dispname');
      const userInp = bodyEl.querySelector('#edit-username-input');
      const userStatus = bodyEl.querySelector('#edit-username-status');
      const bioInp = bodyEl.querySelector('#edit-bio-input');
      const saveBtn = bodyEl.querySelector('#edit-save-btn');
      const msg = bodyEl.querySelector('#edit-msg');

      cancelBtn.onclick = () => {
        activeMode = 'signin';
        updateUI();
      };

      pfpBtn.onclick = () => pfpFile.click();
      pfpFile.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          currentPfp = re.target.result;
          pfpUrl.value = 'Local photo loaded';
        };
        reader.readAsDataURL(file);
      };

      userInp.oninput = () => {
        clearTimeout(usernameDebounce);
        const val = userInp.value.trim();
        if (!val || val === username) {
          userStatus.textContent = '';
          return;
        }
        if (val.length < 3) {
          userStatus.style.color = '#ff9f0a';
          userStatus.textContent = 'Min 3 chars';
          return;
        }
        userStatus.style.color = 'rgba(255,255,255,0.6)';
        userStatus.textContent = 'Checking...';
        usernameDebounce = setTimeout(async () => {
          const res = await window.AeroAuth.checkUsernameAvailable(val);
          if (res.available) {
            userStatus.style.color = '#30d158';
            userStatus.textContent = '✓ Available';
          } else {
            userStatus.style.color = '#ff453a';
            userStatus.textContent = res.error || 'Taken';
          }
        }, 300);
      };

      saveBtn.onclick = async () => {
        const newU = userInp.value.trim();
        if (newU && newU !== username) {
          const res = await window.AeroAuth.checkUsernameAvailable(newU);
          if (!res.available) {
            msg.style.color = '#ff453a';
            msg.textContent = res.error || 'Username taken';
            return;
          }
          window.AeroAuth.setUsername(newU);
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        const finalUrl = (pfpUrl.value && pfpUrl.value !== 'Local photo loaded') ? pfpUrl.value.trim() : currentPfp;
        window.AeroAuth.setProfile({
          displayName: dispName.value.trim(),
          avatarUrl: finalUrl,
          bio: bioInp.value
        });
        await window.AeroAuth.saveToCloud();
        msg.style.color = '#30d158';
        msg.textContent = 'Saved!';
        setTimeout(() => {
          activeMode = 'signin';
          updateUI();
        }, 600);
      };
    }

    function renderAuthForm() {
      const isSignUp = activeMode === 'signup';
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;padding:24px 20px;height:100%;box-sizing:border-box;gap:14px;overflow-y:auto;background:transparent;color:#fff;">
          <div style="text-align:center;">
            <div style="width:52px;height:52px;border-radius:50%;background:rgba(10,132,255,0.15);border:1px solid rgba(10,132,255,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div style="font-size:18px;font-weight:700;color:#fff;">${isSignUp ? 'Create Aero Account' : 'Welcome to Aero'}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px;">
              Sign in to save your playlists, wallpapers, themes, and music tastes.
            </div>
          </div>

          <!-- Tab Switcher -->
          <div style="display:flex;background:rgba(255,255,255,0.06);padding:3px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);">
            <button id="tab-signin-btn" class="btn-flat" style="flex:1;padding:7px;border-radius:7px;font-size:12px;font-weight:600;background:${!isSignUp ? '#0a84ff' : 'transparent'};color:#fff;">
              Sign In
            </button>
            <button id="tab-signup-btn" class="btn-flat" style="flex:1;padding:7px;border-radius:7px;font-size:12px;font-weight:600;background:${isSignUp ? '#0a84ff' : 'transparent'};color:#fff;">
              Create Account
            </button>
          </div>

          <form id="acc-auth-form" style="display:flex;flex-direction:column;gap:11px;margin-top:4px;" onsubmit="return false;">
            ${isSignUp ? `
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Username</label>
                  <span id="acc-username-badge" style="font-size:11px;font-weight:500;"></span>
                </div>
                <input id="acc-username-input" type="text" placeholder="e.g. nyte" autocomplete="off" required
                  style="width:100%;box-sizing:border-box;margin-top:4px;padding:9px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;outline:none;" />
              </div>
            ` : ''}

            <div>
              <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Email</label>
              <input id="acc-email-input" type="email" placeholder="you@example.com" required
                style="width:100%;box-sizing:border-box;margin-top:4px;padding:9px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;outline:none;" />
            </div>

            <div>
              <label style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px;">Password</label>
              <input id="acc-password-input" type="password" placeholder="Password (min 6 characters)" required
                style="width:100%;box-sizing:border-box;margin-top:4px;padding:9px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:13px;outline:none;" />
            </div>

            <div style="margin-top:6px;">
              <button id="acc-submit-btn" class="btn-flat" type="button"
                style="width:100%;padding:11px;background:#0a84ff;color:#fff;font-weight:600;border-radius:8px;">
                ${isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </form>
          <div id="acc-msg" style="font-size:12px;text-align:center;min-height:16px;"></div>
          <div style="margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:6px;">
            <div style="font-size:11px;color:rgba(255,255,255,0.5);text-align:center;">Or save and restore locally:</div>
            <div style="display:flex;gap:8px;">
              <button id="acc-guest-export-btn" class="btn-flat" style="flex:1;padding:7px;background:rgba(255,255,255,0.06);color:#e2e8f0;font-size:11px;border-radius:8px;">Export Backup</button>
              <button id="acc-guest-import-btn" class="btn-flat" style="flex:1;padding:7px;background:rgba(255,255,255,0.06);color:#e2e8f0;font-size:11px;border-radius:8px;">Import Backup</button>
              <input type="file" id="acc-guest-import-file" accept=".json" style="display:none;" />
            </div>
          </div>
        </div>
      `;

      const tabSignIn = bodyEl.querySelector('#tab-signin-btn');
      const tabSignUp = bodyEl.querySelector('#tab-signup-btn');
      const emailInp = bodyEl.querySelector('#acc-email-input');
      const passInp = bodyEl.querySelector('#acc-password-input');
      const usernameInp = bodyEl.querySelector('#acc-username-input');
      const usernameBadge = bodyEl.querySelector('#acc-username-badge');
      const submitBtn = bodyEl.querySelector('#acc-submit-btn');
      const msg = bodyEl.querySelector('#acc-msg');

      tabSignIn.onclick = () => {
        activeMode = 'signin';
        updateUI();
      };
      tabSignUp.onclick = () => {
        activeMode = 'signup';
        updateUI();
      };

      if (usernameInp && usernameBadge) {
        usernameInp.oninput = () => {
          clearTimeout(usernameDebounce);
          const val = usernameInp.value.trim();
          if (!val) {
            usernameBadge.textContent = '';
            return;
          }
          if (val.length < 3) {
            usernameBadge.style.color = '#ff9f0a';
            usernameBadge.textContent = 'Min 3 chars';
            return;
          }
          usernameBadge.style.color = 'rgba(255,255,255,0.6)';
          usernameBadge.textContent = 'Scanning...';
          usernameDebounce = setTimeout(async () => {
            const res = await window.AeroAuth.checkUsernameAvailable(val);
            if (res.available) {
              usernameBadge.style.color = '#30d158';
              usernameBadge.textContent = '✓ Available';
            } else {
              usernameBadge.style.color = '#ff453a';
              usernameBadge.textContent = res.error || 'Taken';
            }
          }, 300);
        };
      }

      const guestExportBtn = bodyEl.querySelector('#acc-guest-export-btn');
      const guestImportBtn = bodyEl.querySelector('#acc-guest-import-btn');
      const guestImportFile = bodyEl.querySelector('#acc-guest-import-file');

      guestExportBtn?.addEventListener('click', () => {
        const backup = {
          version: 'aero-backup-v1',
          date: new Date().toISOString(),
          playlists: JSON.parse(localStorage.getItem('webos_limusic_user_playlists_v2') || '[]'),
          liked_songs: JSON.parse(localStorage.getItem('webos_limusic_liked_v2') || '[]'),
          listening_history: JSON.parse(localStorage.getItem('webos_limusic_recent_v2') || '[]'),
          music_settings: JSON.parse(localStorage.getItem('webos_limusic_settings_v1') || '{}'),
          desktop: JSON.parse(localStorage.getItem('webos_desktop_items_v5') || '[]'),
          notes: JSON.parse(localStorage.getItem('webos_notes_list_v2') || '[]'),
          code: localStorage.getItem('webos_code_editor_v1') || '',
          invisiproxy_url: localStorage.getItem('aero_invisiproxy_url') || '',
          lgl: JSON.parse(localStorage.getItem('webos_lgl_state_v2') || '{}')
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aero-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Backup downloaded');
      });

      guestImportBtn?.addEventListener('click', () => guestImportFile?.click());
      guestImportFile?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const d = JSON.parse(evt.target.result);
            if (Array.isArray(d.playlists)) localStorage.setItem('webos_limusic_user_playlists_v2', JSON.stringify(d.playlists));
            if (Array.isArray(d.liked_songs)) localStorage.setItem('webos_limusic_liked_v2', JSON.stringify(d.liked_songs));
            if (Array.isArray(d.listening_history)) localStorage.setItem('webos_limusic_recent_v2', JSON.stringify(d.listening_history));
            if (d.music_settings) localStorage.setItem('webos_limusic_settings_v1', JSON.stringify(d.music_settings));
            if (Array.isArray(d.desktop)) {
              localStorage.setItem('webos_desktop_items_v5', JSON.stringify(d.desktop));
              window.dispatchEvent(new CustomEvent('desktop:reload'));
            }
            if (Array.isArray(d.notes)) {
              localStorage.setItem('webos_notes_list_v2', JSON.stringify(d.notes));
              window.dispatchEvent(new CustomEvent('notes:updated'));
            }
            if (d.code) localStorage.setItem('webos_code_editor_v1', d.code);
            if (d.invisiproxy_url) localStorage.setItem('aero_invisiproxy_url', d.invisiproxy_url);
            if (d.lgl) localStorage.setItem('webos_lgl_state_v2', JSON.stringify(d.lgl));

            window.GoldenGateMusic?.reloadLibrary?.();
            window.dispatchEvent(new CustomEvent('music:library-changed'));
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Backup restored successfully');
            updateUI();
          } catch (err) {
            if (window.GoldenGateOS?.showToast) window.GoldenGateOS.showToast('Invalid backup file');
          }
        };
        reader.readAsText(file);
      });

      submitBtn.onclick = async () => {
        const email = emailInp.value.trim();
        const pass = passInp.value;
        if (!email || !pass) {
          msg.style.color = '#ff453a';
          msg.textContent = 'Enter email and password';
          return;
        }

        if (isSignUp) {
          const u = usernameInp ? usernameInp.value.trim() : '';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating account...';
          msg.textContent = '';
          try {
            await window.AeroAuth.signUp(email, pass, u);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            activeMode = 'signin';
            updateUI();
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            msg.style.color = '#ff453a';
            msg.textContent = err.message || 'Signup failed';
          }
        } else {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';
          msg.textContent = '';
          try {
            await window.AeroAuth.signIn(email, pass);
            activeMode = 'signin';
            updateUI();
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            msg.style.color = '#ff453a';
            msg.textContent = err.message || 'Login failed';
          }
        }
      };
    }

    updateUI();
    window.addEventListener('aero:auth-change', updateUI);
    window.addEventListener('aero:sync-complete', updateUI);
    window.addEventListener('aero:profile-changed', updateUI);
  }

    function mountAppContent(appId, bodyEl, options) {
    if (appId === "account") return renderAccount(bodyEl);
    switch (appId) {
      case 'music':
        return renderMusic(bodyEl, options);
      case 'aero':
        return renderAero(bodyEl, options);
      case 'games':
        return renderGamesSection(bodyEl);
      case 'code':
        return renderCode(bodyEl);
      case 'monitor':
        return renderMonitor(bodyEl);
      case 'photos':
        return renderPhotos(bodyEl);
      case 'wallpaper':
        return renderWallpaper(bodyEl, options);
      case 'files':
        return renderFiles(bodyEl);
      case 'terminal':
        return renderTerminal(bodyEl);
      default:
        return null;
    }
  }

  return {
    getApps: () => APP_DEFINITIONS,
    getQuickSites: () => QUICK_SITES,
    mountAppContent,
    notesApi
  };
})();

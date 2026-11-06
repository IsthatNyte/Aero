window.GoldenGateMusic = (function () {
  // Curated Full-Length YouTube Music Recommended Tracks for Home (Full YouTube videoIds, not 30s previews)
  const HOME_RECOMMENDED_BY_MOOD = {
    All: [
      {
        id: 'yt-GsyhwnZ1XtI',
        videoId: 'GsyhwnZ1XtI',
        title: 'Baurs Reach',
        artist: 'Gareth Coker',
        duration: 308,
        cover: 'https://i.ytimg.com/vi/GsyhwnZ1XtI/hqdefault.jpg'
      },
      {
        id: 'yt-SwYN7mTi6HM',
        videoId: 'SwYN7mTi6HM',
        title: 'Jump',
        artist: 'Van Halen',
        duration: 241,
        cover: 'https://i.ytimg.com/vi/SwYN7mTi6HM/hqdefault.jpg'
      },
      {
        id: 'yt-U2Qd9TRY1Ro',
        videoId: 'U2Qd9TRY1Ro',
        title: 'Beneath the Mask (Rain)',
        artist: 'Lyn',
        duration: 286,
        cover: 'https://i.ytimg.com/vi/U2Qd9TRY1Ro/hqdefault.jpg'
      },
      {
        id: 'yt-1ZYbU82GVz4',
        videoId: '1ZYbU82GVz4',
        title: 'Flying Ambient Instrumental',
        artist: 'Peder B. Helland',
        duration: 360,
        cover: 'https://i.ytimg.com/vi/1ZYbU82GVz4/hqdefault.jpg'
      },
      {
        id: 'yt-DL0TWbmZCd8',
        videoId: 'DL0TWbmZCd8',
        title: "D'Evils",
        artist: 'SiR',
        duration: 172,
        cover: 'https://i.ytimg.com/vi/DL0TWbmZCd8/hqdefault.jpg'
      },
      {
        id: 'yt-u8PUFYuSS-o',
        videoId: 'u8PUFYuSS-o',
        title: 'Snowdin Town / Glacier',
        artist: 'Toby Fox',
        duration: 148,
        cover: 'https://i.ytimg.com/vi/u8PUFYuSS-o/hqdefault.jpg'
      }
    ]
  };

  const MOOD_QUERIES = {
    All: 'video game soundtrack relaxing ost',
    Focus: 'ambient focus study music instrumental',
    Chill: 'chill lofi beats instrumental',
    Energize: 'synthwave retrowave electronic',
    Gaming: 'hollow knight celeste ori soundtrack',
    Lofi: 'lofi hip hop chillhop',
    Synthwave: 'chillsynth outrun synthwave',
    Soundtracks: 'cinematic orchestral soundtrack'
  };

  // User library starts with NO pre-populated tracks; user creates & adds their own
  let playlists = [];
  let likedTracks = [];
  let recentTracks = [];
  let homeRecommendations = [...HOME_RECOMMENDED_BY_MOOD.All];
  let activeMood = 'All';

  let activePlaylistId = null;
  let currentQueue = [...homeRecommendations];
  let currentTrack = null;
  let loadedTrackId = null;

  let isPlaying = false;
  let isLooping = false;
  let volume = 0.8;
  let fadeTimer = null;
  let isFadingOutToNext = false;

  // Time-Synced Lyrics State (LRCLIB + Spicy Lyrics UI)
  let syncedLyricsLines = [];
  let activeLyricIndex = -1;
  let lyricsCache = new Map();

  const DEFAULT_SETTINGS = {
    theme: 'obsidian',
    accent: '#8b80f9',
    fadeInSeconds: 2,
    playbackSpeed: 1,
    autoPlay: true,
    compactRows: false,
    visualizerGlow: true
  };

  let settings = { ...DEFAULT_SETTINGS };

  // Cached playback time so pause/resume NEVER resets the progress bar to zero
  let cachedCurrentTime = 0;
  let cachedDuration = 0;

  // Dual-Engine Playback: Native HTML5 Audio via /audio stream (bypasses all YouTube embed blocks) + YT IFrame fallback
  let nativeAudio = null;
  let activeBackend = 'html5'; // 'html5' | 'yt'
  let ytPlayer = null;
  let ytReady = false;
  let pendingPlayVideoId = null;

  function setBackendVolumeFrac(frac) {
    const clamped = Math.max(0, Math.min(1, frac));
    if (nativeAudio) {
      nativeAudio.volume = clamped;
    }
    if (ytReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
      try {
        ytPlayer.setVolume(Math.round(clamped * 100));
      } catch (e) {}
    }
  }

  function loadLibrary() {
    try {
      const savedPl = localStorage.getItem('webos_limusic_user_playlists_v2');
      playlists = savedPl ? JSON.parse(savedPl) : [];
      const savedLiked = localStorage.getItem('webos_limusic_liked_v2');
      likedTracks = savedLiked ? JSON.parse(savedLiked) : [];
      const savedRecent = localStorage.getItem('webos_limusic_recent_v2');
      recentTracks = savedRecent ? JSON.parse(savedRecent) : [];
      const savedSettings = localStorage.getItem('webos_limusic_settings_v1');
      if (savedSettings) {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      }
    } catch (e) {
      playlists = [];
      likedTracks = [];
      recentTracks = [];
      settings = { ...DEFAULT_SETTINGS };
    }
  }
  loadLibrary();
  loadLibrary();

  function saveLibrary() {
    try {
      localStorage.setItem('webos_limusic_user_playlists_v2', JSON.stringify(playlists));
      localStorage.setItem('webos_limusic_liked_v2', JSON.stringify(likedTracks));
      localStorage.setItem('webos_limusic_recent_v2', JSON.stringify(recentTracks));
      localStorage.setItem('webos_limusic_settings_v1', JSON.stringify(settings));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('music:library-changed'));
  }

  function reloadLibrary() {
    loadLibrary();
    loadTasteModel();
    notifyListeners();
  }

  function updateSettings(partial) {
    settings = { ...settings, ...partial };
    saveLibrary();
    if (partial.playbackSpeed) {
      const spd = Number(settings.playbackSpeed) || 1;
      if (nativeAudio) {
        try {
          nativeAudio.playbackRate = spd;
        } catch (e) {}
      }
      if (ytReady && ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
        try {
          ytPlayer.setPlaybackRate(spd);
        } catch (e) {}
      }
    }
    window.dispatchEvent(new CustomEvent('music:settings-updated', { detail: settings }));
  }

  function startAudioFadeIn() {
    isFadingOutToNext = false;
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
    const fadeSec = Number(settings.fadeInSeconds) || 0;
    if (fadeSec <= 0) {
      setBackendVolumeFrac(volume);
      return;
    }
    const steps = Math.max(1, Math.floor((fadeSec * 1000) / 50));
    let currentStep = 0;
    setBackendVolumeFrac(0);
    fadeTimer = setInterval(() => {
      currentStep++;
      const frac = Math.min(1, currentStep / steps);
      setBackendVolumeFrac(volume * frac);
      if (currentStep >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
      }
    }, 50);
  }

  function startAudioFadeOutAndNext() {
    if (isFadingOutToNext) return;
    isFadingOutToNext = true;
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
    const durationMs = 2600;
    const steps = Math.max(1, Math.floor(durationMs / 50));
    let step = 0;

    fadeTimer = setInterval(() => {
      step++;
      const remainFrac = Math.max(0, 1 - step / steps);
      setBackendVolumeFrac(volume * remainFrac);
      if (step >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        isFadingOutToNext = false;
        if (isLooping) {
          cachedCurrentTime = 0;
          if (activeBackend === 'html5' && nativeAudio) {
            nativeAudio.currentTime = 0;
            nativeAudio.play().catch(() => {});
          } else if (ytReady && ytPlayer) {
            ytPlayer.seekTo(0, true);
            ytPlayer.playVideo();
          }
          startAudioFadeIn();
        } else if (settings.autoPlay) {
          nextTrack();
        }
      }
    }, 50);
  }

  // ==========================================================================
  // LRCLIB Time-Synced Lyrics Parser & Fetcher (Spikerko/spicy-lyrics style)
  // ==========================================================================
  function parseLrcString(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const rows = lrcText.split(/\r?\n/);
    const parsed = [];
    const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    for (const row of rows) {
      const text = row.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
      let match;
      timeRegex.lastIndex = 0;
      while ((match = timeRegex.exec(row)) !== null) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const msStr = match[3] || '0';
        const frac = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) / 1000;
        const totalSec = mins * 60 + secs + frac;
        if (text) {
          parsed.push({ time: totalSec, text });
        }
      }
    }
    parsed.sort((a, b) => a.time - b.time);
    return parsed;
  }

  async function fetchLyricsForTrack(track) {
    if (!track) return;
    const container = document.getElementById('lyrics-lines-container');
    const ambientBg = document.getElementById('lyrics-ambient-bg');
    if (ambientBg && track.cover) {
      ambientBg.style.backgroundImage = `url("${track.cover}")`;
    }

    if (lyricsCache.has(track.id)) {
      syncedLyricsLines = lyricsCache.get(track.id);
      activeLyricIndex = -1;
      renderLyricsDOM();
      return;
    }

    if (container) {
      container.innerHTML = `<div class="spicy-lyric-line active">Syncing lyrics...</div>`;
    }

    const cleanTitle = (track.title || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim() || track.title;
    const cleanArtist = (track.artist || '').replace(/- Topic$/i, '').trim() || track.artist;

    let lines = [];
    try {
      const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
      const res = await fetch(getUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.syncedLyrics) {
          lines = parseLrcString(data.syncedLyrics);
        } else if (data && data.plainLyrics) {
          const rawLines = data.plainLyrics.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          const step = Math.max(3, (track.duration || 180) / Math.max(1, rawLines.length));
          lines = rawLines.map((txt, i) => ({ time: i * step, text: txt }));
        }
      }

      if (lines.length === 0) {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`;
        const sRes = await fetch(searchUrl);
        if (sRes.ok) {
          const list = await sRes.json();
          if (Array.isArray(list) && list.length > 0) {
            const withSynced = list.find((item) => item.syncedLyrics) || list[0];
            if (withSynced?.syncedLyrics) {
              lines = parseLrcString(withSynced.syncedLyrics);
            } else if (withSynced?.plainLyrics) {
              const rawLines = withSynced.plainLyrics.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
              const step = Math.max(3, (track.duration || 180) / Math.max(1, rawLines.length));
              lines = rawLines.map((txt, i) => ({ time: i * step, text: txt }));
            }
          }
        }
      }
    } catch (e) {}

    if (lines.length === 0) {
      lines = [
        { time: 0, text: track.title },
        { time: 6, text: track.artist },
        { time: 14, text: 'Instrumental / Ambient Stream' },
        { time: 30, text: 'Syncing rhythm and harmonics' },
        { time: 60, text: track.title }
      ];
    }

    lyricsCache.set(track.id, lines);
    if (currentTrack && currentTrack.id === track.id) {
      syncedLyricsLines = lines;
      activeLyricIndex = -1;
      renderLyricsDOM();
    }
  }

  function renderLyricsDOM() {
    const container = document.getElementById('lyrics-lines-container');
    if (!container) return;
    if (!syncedLyricsLines || syncedLyricsLines.length === 0) {
      container.innerHTML = `<div class="spicy-lyric-line active">Play a song to view time-synced lyrics</div>`;
      return;
    }

    container.innerHTML = syncedLyricsLines
      .map(
        (line, idx) => `
        <div class="spicy-lyric-line" data-lrc-idx="${idx}" data-lrc-time="${line.time}">
          ${line.text}
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.spicy-lyric-line').forEach((el) => {
      el.onclick = () => {
        const targetTime = parseFloat(el.dataset.lrcTime || '0');
        const dur = getEffectiveDuration();
        if (dur > 0) {
          seekFraction(targetTime / dur);
        }
      };
    });

    syncLyricsScroll();
  }

  function syncLyricsScroll() {
    const container = document.getElementById('lyrics-lines-container');
    if (!container || !syncedLyricsLines || syncedLyricsLines.length === 0) return;

    const cur = getEffectiveCurrentTime();
    let idx = 0;
    for (let i = 0; i < syncedLyricsLines.length; i++) {
      if (cur >= syncedLyricsLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }

    if (idx === activeLyricIndex) return;
    activeLyricIndex = idx;

    const lineEls = container.querySelectorAll('.spicy-lyric-line');
    lineEls.forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('past', i < idx);
      const dist = Math.abs(i - idx);
      el.style.setProperty('--lrc-dist', String(Math.min(4, dist)));
    });

    const activeEl = lineEls[idx];
    if (activeEl) {
      const targetScroll = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
    }
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = String(s % 60).padStart(2, '0');
    return `${m}:${rem}`;
  }

  function initNativeAudioElement() {
    if (nativeAudio) return;
    nativeAudio = new Audio();
    nativeAudio.preload = 'auto';
    nativeAudio.volume = volume;

    nativeAudio.addEventListener('playing', () => {
      if (activeBackend !== 'html5') return;
      isPlaying = true;
      if (Number.isFinite(nativeAudio.duration) && nativeAudio.duration > 0) {
        cachedDuration = nativeAudio.duration;
      }
      try {
        nativeAudio.playbackRate = Number(settings.playbackSpeed) || 1;
      } catch (e) {}
      notifyListeners();
    });

    nativeAudio.addEventListener('pause', () => {
      if (activeBackend !== 'html5') return;
      if (!nativeAudio.ended && nativeAudio.currentTime > 0) {
        cachedCurrentTime = nativeAudio.currentTime;
      }
      if (!nativeAudio.ended) {
        isPlaying = false;
        notifyListeners();
      }
    });

    nativeAudio.addEventListener('loadedmetadata', () => {
      if (activeBackend !== 'html5') return;
      if (Number.isFinite(nativeAudio.duration) && nativeAudio.duration > 0) {
        cachedDuration = nativeAudio.duration;
        updateTimeUI();
      }
    });

    nativeAudio.addEventListener('timeupdate', () => {
      if (activeBackend !== 'html5') return;
      if (Number.isFinite(nativeAudio.currentTime) && nativeAudio.currentTime > 0) {
        cachedCurrentTime = nativeAudio.currentTime;
      }
    });

    nativeAudio.addEventListener('ended', () => {
      if (activeBackend !== 'html5') return;
      if (isLooping) {
        cachedCurrentTime = 0;
        nativeAudio.currentTime = 0;
        nativeAudio.play().catch(() => {});
        startAudioFadeIn();
      } else if (settings.autoPlay) {
        nextTrack();
      } else {
        isPlaying = false;
        notifyListeners();
      }
    });

    nativeAudio.addEventListener('error', () => {
      if (activeBackend !== 'html5' || !currentTrack) return;
      // Fallback to YouTube IFrame Player if direct stream encounters a live radio or stream error
      if (currentTrack.videoId) {
        playViaYouTubeIframe(currentTrack.videoId);
      }
    });
  }

  function playViaYouTubeIframe(videoId) {
    if (!videoId) return;
    activeBackend = 'yt';
    if (nativeAudio) {
      try {
        nativeAudio.pause();
      } catch (e) {}
    }
    if (ytReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      ytPlayer.loadVideoById(videoId);
      ytPlayer.playVideo();
      startAudioFadeIn();
      isPlaying = true;
    } else {
      pendingPlayVideoId = videoId;
      isPlaying = true;
    }
    notifyListeners();
  }

  function initYouTubePlayer() {
    initNativeAudioElement();
    function mountPlayer() {
      if (ytPlayer || !window.YT || !window.YT.Player) return;
      ytPlayer = new window.YT.Player('yt-player-mount', {
        height: '200',
        width: '200',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            ytReady = true;
            ytPlayer.setVolume(Math.round(volume * 100));
            if (typeof ytPlayer.setPlaybackRate === 'function') {
              try {
                ytPlayer.setPlaybackRate(Number(settings.playbackSpeed) || 1);
              } catch (e) {}
            }
            if (pendingPlayVideoId && activeBackend === 'yt') {
              const vid = pendingPlayVideoId;
              pendingPlayVideoId = null;
              ytPlayer.loadVideoById(vid);
              ytPlayer.playVideo();
              startAudioFadeIn();
            }
          },
          onStateChange: (ev) => {
            if (activeBackend !== 'yt') return;
            // YT.PlayerState: PLAYING = 1, PAUSED = 2, ENDED = 0
            if (ev.data === 1) {
              isPlaying = true;
              const d = ytPlayer.getDuration();
              if (d && d > 0) cachedDuration = d;
              if (typeof ytPlayer.setPlaybackRate === 'function') {
                try {
                  ytPlayer.setPlaybackRate(Number(settings.playbackSpeed) || 1);
                } catch (e) {}
              }
              notifyListeners();
            } else if (ev.data === 2) {
              const ct = ytPlayer.getCurrentTime();
              if (ct > 0) cachedCurrentTime = ct;
              isPlaying = false;
              notifyListeners();
            } else if (ev.data === 0) {
              if (isLooping) {
                cachedCurrentTime = 0;
                ytPlayer.seekTo(0, true);
                ytPlayer.playVideo();
                startAudioFadeIn();
              } else if (settings.autoPlay) {
                nextTrack();
              } else {
                isPlaying = false;
                notifyListeners();
              }
            }
          },
          onError: () => {
            if (activeBackend !== 'yt') return;
            isPlaying = false;
            notifyListeners();
          }
        }
      });
    }

    if (window.YT && window.YT.Player) {
      mountPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prevCallback === 'function') prevCallback();
        mountPlayer();
      };
      setTimeout(mountPlayer, 1500);
    }
  }

  // Search full-length YouTube Music tracks via Piped YouTube Music API
  async function searchYouTubeMusic(query) {
    const q = (query || '').trim();
    if (!q) return [];

    try {
      const apiUrl = `https://api.piped.private.coffee/search?q=${encodeURIComponent(q)}&filter=music_songs`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return data.items
            .filter((item) => item.url && item.url.includes('v='))
            .map((item) => {
              const videoId = item.url.split('v=')[1]?.split('&')[0] || '';
              return {
                id: 'yt-' + videoId,
                videoId,
                title: item.title || 'Untitled',
                artist: item.uploaderName || 'YouTube Music',
                duration: item.duration > 0 ? item.duration : 210,
                cover: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
              };
            });
        }
      }
    } catch (e) {}

    return HOME_RECOMMENDED_BY_MOOD.All;
  }

  async function loadHomeMood(mood = 'All') {
    activeMood = mood;
    if (HOME_RECOMMENDED_BY_MOOD[mood] && HOME_RECOMMENDED_BY_MOOD[mood].length > 3) {
      homeRecommendations = HOME_RECOMMENDED_BY_MOOD[mood];
      notifyListeners();
    }
    const q = MOOD_QUERIES[mood] || mood;
    const fetched = await searchYouTubeMusic(q);
    if (fetched && fetched.length > 0) {
      HOME_RECOMMENDED_BY_MOOD[mood] = fetched;
      homeRecommendations = fetched;
      if (!currentTrack) currentQueue = [...fetched];
      notifyListeners();
    }
  }

  function createPlaylist(name) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const newPl = {
      id: 'pl-' + Date.now(),
      name: clean,
      tracks: []
    };
    playlists.unshift(newPl);
    activePlaylistId = newPl.id;
    saveLibrary();
    notifyListeners();
    return newPl;
  }

  function deletePlaylist(plId) {
    playlists = playlists.filter((p) => p.id !== plId);
    if (activePlaylistId === plId) activePlaylistId = playlists[0]?.id || null;
    saveLibrary();
    notifyListeners();
  }

  function addTrackToPlaylist(track, plId) {
    if (!track) return;
    if (plId === 'liked') {
      if (!likedTracks.some((t) => t.id === track.id)) {
        likedTracks.unshift(track);
        saveLibrary();
        notifyListeners();
      }
      return;
    }
    let targetPl = playlists.find((p) => p.id === plId);
    if (!targetPl) {
      targetPl = createPlaylist('My Playlist');
    }
    if (targetPl && !targetPl.tracks.some((t) => t.id === track.id)) {
      targetPl.tracks.push(track);
      saveLibrary();
      notifyListeners();
    }
  }

  function removeTrackFromPlaylist(trackId, plId) {
    if (!trackId) return;
    if (plId === 'liked') {
      likedTracks = likedTracks.filter((t) => t.id !== trackId);
      saveLibrary();
      notifyListeners();
      return;
    }
    const targetPl = playlists.find((p) => p.id === plId);
    if (targetPl) {
      targetPl.tracks = (targetPl.tracks || []).filter((t) => t.id !== trackId);
      saveLibrary();
      notifyListeners();
    }
  }

  function exportLibraryJson() {
    return JSON.stringify({
      version: 'aero-music-v1',
      date: new Date().toISOString(),
      playlists: playlists,
      liked_songs: likedTracks,
      listening_history: recentTracks,
      settings: settings
    }, null, 2);
  }

  function importLibraryJson(jsonString) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (Array.isArray(data.playlists)) {
        const map = new Map();
        playlists.forEach((p) => { if (p && p.id) map.set(p.id, p); });
        data.playlists.forEach((p) => {
          if (p && p.id) {
            if (map.has(p.id)) {
              const existing = map.get(p.id);
              const tMap = new Map();
              (existing.tracks || []).forEach((t) => tMap.set(t.id, t));
              (p.tracks || []).forEach((t) => tMap.set(t.id, t));
              map.set(p.id, { ...existing, ...p, tracks: Array.from(tMap.values()) });
            } else {
              map.set(p.id, p);
            }
          }
        });
        playlists = Array.from(map.values());
      }
      if (Array.isArray(data.liked_songs)) {
        const lMap = new Map();
        likedTracks.forEach((t) => { if (t && t.id) lMap.set(t.id, t); });
        data.liked_songs.forEach((t) => { if (t && t.id) lMap.set(t.id, t); });
        likedTracks = Array.from(lMap.values());
      }
      if (data.settings) {
        settings = { ...settings, ...data.settings };
      }
      saveLibrary();
      notifyListeners();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  function removeTrackFromPlaylist(trackId, plId) {
    if (!trackId) return;
    if (plId === 'liked') {
      likedTracks = likedTracks.filter((t) => t.id !== trackId);
      saveLibrary();
      notifyListeners();
      return;
    }
    const targetPl = playlists.find((p) => p.id === plId);
    if (targetPl) {
      targetPl.tracks = (targetPl.tracks || []).filter((t) => t.id !== trackId);
      saveLibrary();
      notifyListeners();
    }
  }

  function exportLibraryJson() {
    return JSON.stringify({
      version: 'aero-music-v1',
      date: new Date().toISOString(),
      playlists: playlists,
      liked_songs: likedTracks,
      listening_history: recentTracks,
      settings: settings
    }, null, 2);
  }

  function importLibraryJson(jsonString) {
    try {
      const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (Array.isArray(data.playlists)) {
        const map = new Map();
        playlists.forEach((p) => { if (p && p.id) map.set(p.id, p); });
        data.playlists.forEach((p) => {
          if (p && p.id) {
            if (map.has(p.id)) {
              const existing = map.get(p.id);
              const tMap = new Map();
              (existing.tracks || []).forEach((t) => tMap.set(t.id, t));
              (p.tracks || []).forEach((t) => tMap.set(t.id, t));
              map.set(p.id, { ...existing, ...p, tracks: Array.from(tMap.values()) });
            } else {
              map.set(p.id, p);
            }
          }
        });
        playlists = Array.from(map.values());
      }
      if (Array.isArray(data.liked_songs)) {
        const lMap = new Map();
        likedTracks.forEach((t) => { if (t && t.id) lMap.set(t.id, t); });
        data.liked_songs.forEach((t) => { if (t && t.id) lMap.set(t.id, t); });
        likedTracks = Array.from(lMap.values());
      }
      if (data.settings) {
        settings = { ...settings, ...data.settings };
      }
      saveLibrary();
      notifyListeners();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  function findPlaylist(nameOrQuery) {
    const raw = (nameOrQuery || '').trim();
    if (!raw) return null;
    const clean = raw.toLowerCase()
      .replace(/^(?:the|my)\s+/i, '')
      .replace(/\s+playlist$/i, '')
      .replace(/^playlist\s+/i, '')
      .trim();

    if (!clean) return null;

    if (clean === 'liked' || clean === 'liked music' || clean === 'liked songs' || clean === 'favorites' || clean === 'favorite') {
      return {
        id: 'liked',
        name: 'Liked Music',
        tracks: likedTracks
      };
    }

    // Exact name match
    const exact = playlists.find((p) => p.name.trim().toLowerCase() === clean);
    if (exact) return exact;

    // Substring match
    const partial = playlists.find((p) => {
      const pn = p.name.trim().toLowerCase();
      return pn.includes(clean) || clean.includes(pn);
    });
    if (partial) return partial;

    return null;
  }

  function playPlaylist(nameOrQuery) {
    const pl = findPlaylist(nameOrQuery);
    if (!pl) {
      if (!nameOrQuery && playlists.length > 0) {
        const first = playlists[0];
        if (first.tracks && first.tracks.length > 0) {
          activePlaylistId = first.id;
          playTrack(first.tracks[0], first.tracks);
          return { success: true, name: first.name, count: first.tracks.length, firstTrack: first.tracks[0] };
        }
      }
      return { success: false, name: nameOrQuery };
    }

    if (!pl.tracks || pl.tracks.length === 0) {
      return { success: false, name: pl.name, empty: true };
    }

    activePlaylistId = pl.id;
    playTrack(pl.tracks[0], pl.tracks);
    return {
      success: true,
      name: pl.name,
      count: pl.tracks.length,
      firstTrack: pl.tracks[0]
    };
  }

  function toggleLikeTrack(track) {
    if (!track) return;
    const idx = likedTracks.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      likedTracks.splice(idx, 1);
      updateTasteScore(track, -2, 0, 0);
    } else {
      likedTracks.unshift(track);
      updateTasteScore(track, 3, 0, 0);
    }
    saveLibrary();
    notifyListeners();
  }

  // ==========================================================================
  // Music Taste Model (Likes, Skips, Replays, Artist/Genre Affinity & Scoring)
  // ==========================================================================
  const TASTE_KEY = 'webos_music_taste_v1';
  let tasteModel = {
    artistScores: {},
    genreScores: { Chill: 2, Lofi: 2, Synthwave: 2, Soundtracks: 2 },
    trackPlays: {},
    trackSkips: {},
    blockedArtists: []
  };

  function loadTasteModel() {
    try {
      const raw = localStorage.getItem(TASTE_KEY);
      if (raw) {
        tasteModel = { ...tasteModel, ...JSON.parse(raw) };
      }
    } catch (e) {}
  }

  function saveTasteModel() {
    try {
      localStorage.setItem(TASTE_KEY, JSON.stringify(tasteModel));
    } catch (e) {}
  }

  function updateTasteScore(track, likeDelta = 0, playDelta = 0, skipDelta = 0) {
    if (!track) return;
    const artist = (track.artist || 'Unknown').trim();
    const tid = track.id;

    if (playDelta > 0) {
      tasteModel.trackPlays[tid] = (tasteModel.trackPlays[tid] || 0) + playDelta;
      tasteModel.artistScores[artist] = (tasteModel.artistScores[artist] || 0) + 1.5;
      if (activeMood && activeMood !== 'All') {
        tasteModel.genreScores[activeMood] = (tasteModel.genreScores[activeMood] || 0) + 1;
      }
    }
    if (likeDelta !== 0) {
      tasteModel.artistScores[artist] = (tasteModel.artistScores[artist] || 0) + likeDelta * 2;
      if (activeMood && activeMood !== 'All') {
        tasteModel.genreScores[activeMood] = (tasteModel.genreScores[activeMood] || 0) + likeDelta;
      }
    }
    if (skipDelta > 0) {
      tasteModel.trackSkips[tid] = (tasteModel.trackSkips[tid] || 0) + skipDelta;
      tasteModel.artistScores[artist] = (tasteModel.artistScores[artist] || 0) - 2.5 * skipDelta;
    }
    saveTasteModel();
  }

  function scoreTrackForTaste(track, hatedTerms = []) {
    if (!track) return -999;
    const artist = (track.artist || '').trim();
    const titleLower = `${track.title} ${artist}`.toLowerCase();

    if (tasteModel.blockedArtists.includes(artist.toLowerCase())) return -500;
    for (const h of hatedTerms) {
      if (h && titleLower.includes(h.toLowerCase())) return -400;
    }

    const artistAff = tasteModel.artistScores[artist] || 0;
    const plays = tasteModel.trackPlays[track.id] || 0;
    const skips = tasteModel.trackSkips[track.id] || 0;
    const isLiked = isTrackLiked(track.id) ? 8 : 0;
    const isRecent = recentTracks.some((r) => r.id === track.id) ? 2.5 : 0;
    const replayBonus = Math.min(6, plays * 1.5);
    const skipPenalty = skips * 4.5;

    return isLiked + artistAff * 2.2 + replayBonus + isRecent - skipPenalty;
  }

  function getCandidatePool() {
    const map = new Map();
    likedTracks.forEach((t) => map.set(t.id, t));
    recentTracks.forEach((t) => map.set(t.id, t));
    playlists.forEach((pl) => (pl.tracks || []).forEach((t) => map.set(t.id, t)));
    Object.values(HOME_RECOMMENDED_BY_MOOD).forEach((arr) => {
      (arr || []).forEach((t) => map.set(t.id, t));
    });
    return Array.from(map.values());
  }

  async function playTasteRecommendations(hatedTerms = []) {
    const pool = getCandidatePool();
    const scored = pool
      .map((t) => ({ track: t, score: scoreTrackForTaste(t, hatedTerms) }))
      .filter((x) => x.score > -200)
      .sort((a, b) => b.score - a.score);

    const bestTracks = scored.map((x) => x.track);
    if (bestTracks.length > 0) {
      await playTrack(bestTracks[0], bestTracks);
      return bestTracks[0];
    }
    return null;
  }

  async function playMoreLikeCurrent() {
    const base = currentTrack || recentTracks[0] || homeRecommendations[0];
    if (!base) return null;
    const query = `${base.artist} ${base.title.split('(')[0].trim()} mix`;
    const results = await searchYouTubeMusic(query);
    const filtered = results.filter((t) => t.id !== base.id);
    const queue = filtered.length > 0 ? filtered : results;
    if (queue.length > 0) {
      await playTrack(queue[0], queue);
      return queue[0];
    }
    return null;
  }

  function skipCurrentArtist() {
    if (!currentTrack) return null;
    const artist = (currentTrack.artist || '').trim();
    if (artist && !tasteModel.blockedArtists.includes(artist.toLowerCase())) {
      tasteModel.blockedArtists.push(artist.toLowerCase());
    }
    updateTasteScore(currentTrack, 0, 0, 2);
    // Filter queue to remove this artist
    const remaining = currentQueue.filter(
      (t) => (t.artist || '').trim().toLowerCase() !== artist.toLowerCase()
    );
    if (remaining.length > 0) {
      currentQueue = remaining;
      loadedTrackId = null;
      playTrack(currentQueue[0], currentQueue);
    } else {
      nextTrack();
    }
    return artist;
  }

  function isTrackLiked(trackId) {
    return likedTracks.some((t) => t.id === trackId);
  }

  // Import Playlist from Spotify, YouTube / YouTube Music, SoundCloud, or URL
  async function importPlaylistFromUrl(rawInput) {
    const input = (rawInput || '').trim();
    if (!input) return null;

    // 1. Direct server-side extraction (Spotify, YouTube, SoundCloud via /import-playlist)
    try {
      const res = await fetch(`/import-playlist?url=${encodeURIComponent(input)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.tracks) && data.tracks.length > 0) {
          const newPl = {
            id: 'pl-' + Date.now(),
            name: (data.name || 'Imported Playlist').slice(0, 32),
            cover: data.cover || '',
            tracks: data.tracks
          };
          playlists.unshift(newPl);
          activePlaylistId = newPl.id;
          saveLibrary();
          notifyListeners();
          return newPl;
        }
      }
    } catch (e) {}

    // 2. Direct YouTube Music playlist ID fallback (`?list=...`)
    if (input.includes('list=')) {
      const listId = input.split('list=')[1]?.split('&')[0];
      if (listId) {
        try {
          const res = await fetch(`https://api.piped.private.coffee/playlists/${encodeURIComponent(listId)}`);
          if (res.ok) {
            const data = await res.json();
            const tracks = (data.relatedStreams || [])
              .filter((s) => s.url && s.url.includes('v='))
              .map((s) => {
                const vid = s.url.split('v=')[1]?.split('&')[0] || '';
                return {
                  id: 'yt-' + vid,
                  videoId: vid,
                  title: s.title || 'Track',
                  artist: s.uploaderName || 'Artist',
                  duration: s.duration > 0 ? s.duration : 210,
                  cover: s.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
                };
              });
            if (tracks.length > 0) {
              const newPl = {
                id: 'pl-' + Date.now(),
                name: (data.name || 'YouTube Import').slice(0, 28),
                tracks
              };
              playlists.unshift(newPl);
              activePlaylistId = newPl.id;
              saveLibrary();
              notifyListeners();
              return newPl;
            }
          }
        } catch (e) {}
      }
    }

    // 3. Fallback to track search
    let searchSeed = input;
    if (input.startsWith('http://') || input.startsWith('https://')) {
      searchSeed = input.split('/').pop().replace(/[-_]/g, ' ');
    }
    const tracks = await searchYouTubeMusic(searchSeed);
    if (tracks && tracks.length > 0) {
      const newPl = {
        id: 'pl-' + Date.now(),
        name: searchSeed.slice(0, 24),
        tracks: tracks.slice(0, 18)
      };
      playlists.unshift(newPl);
      activePlaylistId = newPl.id;
      saveLibrary();
      notifyListeners();
      return newPl;
    }

    return null;
  }

  async function playTrack(track, queueList) {
    if (!track) return;

    if (Array.isArray(queueList) && queueList.length > 0) {
      currentQueue = [...queueList];
    }

    // If clicking the exact same already-loaded track, just resume without resetting time!
    if (currentTrack && loadedTrackId === track.id) {
      if (!isPlaying) {
        togglePlay();
      }
      return;
    }

    currentTrack = track;
    loadedTrackId = track.id;
    cachedCurrentTime = 0;
    cachedDuration = track.duration || 210;
    isFadingOutToNext = false;

    // Fetch time-synced lyrics from LRCLIB
    fetchLyricsForTrack(track);

    // Record in recent tracks and taste model
    updateTasteScore(track, 0, 1, 0);
    recentTracks = [track, ...recentTracks.filter((t) => t.id !== track.id)].slice(0, 12);
    saveLibrary();

    // Resolve videoId if missing
    if (!track.videoId) {
      const results = await searchYouTubeMusic(`${track.title} ${track.artist}`);
      if (results.length > 0 && results[0].videoId) {
        track.videoId = results[0].videoId;
        track.duration = results[0].duration || track.duration;
        cachedDuration = track.duration;
      }
    }

    if (track.videoId || (track.title && track.artist)) {
      initNativeAudioElement();
      activeBackend = 'html5';
      if (ytReady && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        try {
          ytPlayer.stopVideo();
        } catch (e) {}
      }
      const fallbackQ = `${track.title || ''} ${track.artist || ''}`.trim();
      const vParam = track.videoId ? `v=${encodeURIComponent(track.videoId)}&` : '';
      nativeAudio.src = `/audio?${vParam}q=${encodeURIComponent(fallbackQ)}`;
      nativeAudio.currentTime = 0;
      isPlaying = true;
      startAudioFadeIn();
      nativeAudio.play().catch(() => {
        if (track.videoId) playViaYouTubeIframe(track.videoId);
      });
    }

    notifyListeners();
  }

  // Pause or resume in-place WITHOUT resetting cachedCurrentTime or reloading the track
  function togglePlay() {
    if (!currentTrack) {
      if (homeRecommendations.length > 0) {
        playTrack(homeRecommendations[0], homeRecommendations);
      }
      return;
    }

    if (isPlaying) {
      if (fadeTimer) {
        clearInterval(fadeTimer);
        fadeTimer = null;
      }
      if (activeBackend === 'html5' && nativeAudio) {
        if (nativeAudio.currentTime > 0) cachedCurrentTime = nativeAudio.currentTime;
        nativeAudio.pause();
      } else if (ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        const ct = ytPlayer.getCurrentTime();
        if (ct > 0) cachedCurrentTime = ct;
        ytPlayer.pauseVideo();
      }
      isPlaying = false;
      notifyListeners();
    } else {
      if (activeBackend === 'html5' && nativeAudio) {
        nativeAudio.play().catch(() => {
          if (currentTrack?.videoId) playViaYouTubeIframe(currentTrack.videoId);
        });
        startAudioFadeIn();
      } else if (ytReady && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
        startAudioFadeIn();
      }
      isPlaying = true;
      notifyListeners();
    }
  }

  function nextTrack() {
    if (!currentQueue || currentQueue.length === 0) return;
    if (currentTrack && getEffectiveCurrentTime() < 35 && !isFadingOutToNext) {
      updateTasteScore(currentTrack, 0, 0, 1);
    }
    const idx = currentQueue.findIndex((t) => t.id === currentTrack?.id);
    const nextIdx = (idx + 1) % currentQueue.length;
    loadedTrackId = null;
    playTrack(currentQueue[nextIdx], currentQueue);
  }

  function prevTrack() {
    if (!currentQueue || currentQueue.length === 0) return;
    const idx = currentQueue.findIndex((t) => t.id === currentTrack?.id);
    const prevIdx = (idx - 1 + currentQueue.length) % currentQueue.length;
    loadedTrackId = null;
    playTrack(currentQueue[prevIdx], currentQueue);
  }

  function toggleLoop() {
    isLooping = !isLooping;
    notifyListeners();
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    setBackendVolumeFrac(volume);
    const masterSlider = document.getElementById('taskbar-master-volume');
    if (masterSlider && Math.abs(Number(masterSlider.value) - Math.round(volume * 100)) > 1) {
      masterSlider.value = String(Math.round(volume * 100));
    }
  }

  function seekFraction(frac) {
    const dur = getEffectiveDuration();
    if (dur > 0) {
      const targetSec = Math.max(0, Math.min(dur, frac * dur));
      cachedCurrentTime = targetSec;
      if (activeBackend === 'html5' && nativeAudio) {
        try {
          nativeAudio.currentTime = targetSec;
        } catch (e) {}
      } else if (ytReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
        ytPlayer.seekTo(targetSec, true);
      }
      updateTimeUI();
    }
  }

  function getEffectiveDuration() {
    if (activeBackend === 'html5' && nativeAudio) {
      const d = nativeAudio.duration;
      if (d && Number.isFinite(d) && d > 0) {
        cachedDuration = d;
      }
    } else if (ytReady && ytPlayer && typeof ytPlayer.getDuration === 'function') {
      const d = ytPlayer.getDuration();
      if (d && Number.isFinite(d) && d > 0) {
        cachedDuration = d;
      }
    }
    return cachedDuration || currentTrack?.duration || 0;
  }

  function getEffectiveCurrentTime() {
    if (activeBackend === 'html5' && nativeAudio) {
      const ct = nativeAudio.currentTime;
      if (Number.isFinite(ct) && ct >= 0) {
        if (ct > 0 || cachedCurrentTime < 1) {
          cachedCurrentTime = ct;
        }
      }
    } else if (isPlaying && ytReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      const ct = ytPlayer.getCurrentTime();
      if (Number.isFinite(ct) && ct >= 0) {
        if (ct > 0 || cachedCurrentTime < 1) {
          cachedCurrentTime = ct;
        }
      }
    }
    return cachedCurrentTime;
  }

  function notifyListeners() {
    updateTaskbarMiniPlayer();
    window.dispatchEvent(new CustomEvent('music:updated'));
  }

  function updateTaskbarMiniPlayer() {
    const coverImg = document.getElementById('tb-cover-img');
    const titleEl = document.getElementById('tb-track-title');
    const artistEl = document.getElementById('tb-track-artist');
    const playSvg = document.getElementById('tb-play-svg');
    const loopBtn = document.getElementById('tb-loop-btn');

    if (coverImg) {
      if (currentTrack?.cover) {
        coverImg.src = currentTrack.cover;
        coverImg.classList.remove('hidden');
      } else {
        coverImg.classList.add('hidden');
      }
    }
    if (titleEl) {
      titleEl.textContent = currentTrack ? currentTrack.title : 'No track playing';
    }
    if (artistEl) {
      artistEl.textContent = currentTrack ? currentTrack.artist : 'Open music';
    }
    if (playSvg) {
      playSvg.innerHTML = isPlaying
        ? `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`
        : `<polygon points="6 4 20 12 6 20 6 4"/>`;
    }
    if (loopBtn) {
      loopBtn.classList.toggle('active', isLooping);
    }
    updateTimeUI();
  }

  function updateTimeUI() {
    const dur = getEffectiveDuration();
    const cur = getEffectiveCurrentTime();
    const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
    const left = Math.max(0, dur - cur);

    const tbFill = document.getElementById('tb-progress-fill');
    const tbLeft = document.getElementById('tb-time-left');
    if (tbFill) tbFill.style.width = `${pct.toFixed(2)}%`;
    if (tbLeft) tbLeft.textContent = `-${formatTime(left)}`;

    const appCur = document.getElementById('limusic-cur-time');
    const appDur = document.getElementById('limusic-dur-time');
    const appFill = document.getElementById('limusic-prog-fill');
    if (appCur) appCur.textContent = formatTime(cur);
    if (appDur) appDur.textContent = formatTime(dur);
    if (appFill) appFill.style.width = `${pct.toFixed(2)}%`;

    // Sync Spicy Lyrics scroll position to current time
    syncLyricsScroll();

    // Monitor remaining song duration: when 3 seconds remain, ramp volume down to 0 and transition to next song
    if (isPlaying && dur > 12 && left <= 3.0 && left > 0.25 && !isFadingOutToNext) {
      startAudioFadeOutAndNext();
    }
  }

  function startVisualizerAndProgressLoop() {
    const canvas = document.getElementById('tb-visualizer-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    setInterval(() => {
      if (isPlaying) {
        updateTimeUI();
      }
    }, 250);

    function drawFrame(now) {
      if (ctx && canvas) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barCount = 8;
        const gap = 2;
        const barW = (w - gap * (barCount - 1)) / barCount;

        for (let i = 0; i < barCount; i++) {
          let norm = 0.12;
          if (isPlaying) {
            norm =
              0.2 +
              0.45 * Math.abs(Math.sin(now * 0.007 + i * 0.85)) +
              0.3 * Math.abs(Math.cos(now * 0.013 - i * 1.2));
          }
          const bh = Math.max(3, Math.round(norm * (h - 4)));
          const x = i * (barW + gap);
          const y = h - bh;

          ctx.fillStyle = isPlaying ? (settings.accent || '#a599ff') : 'rgba(255,255,255,0.3)';
          if (isPlaying && settings.visualizerGlow) {
            ctx.shadowColor = settings.accent || '#a599ff';
            ctx.shadowBlur = 6;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.fillRect(x, y, barW, bh);
        }
      }
      requestAnimationFrame(drawFrame);
    }

    requestAnimationFrame(drawFrame);
  }

  function initTaskbarControls() {
    document.getElementById('tb-play-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });
    document.getElementById('tb-skip-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      nextTrack();
    });
    document.getElementById('tb-loop-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLoop();
    });
    document.getElementById('tb-progress-track')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
      seekFraction(frac);
    });
    function toggleLyricsFlyout(e) {
      e.stopPropagation();
      const flyout = document.getElementById('lyrics-flyout');
      if (!flyout) return;
      const isHidden = flyout.classList.contains('hidden');
      if (isHidden) {
        flyout.classList.remove('hidden');
        if (currentTrack && syncedLyricsLines.length === 0) {
          fetchLyricsForTrack(currentTrack);
        } else {
          activeLyricIndex = -1;
          syncLyricsScroll();
        }
      } else {
        flyout.classList.add('hidden');
      }
    }

    document.getElementById('tb-open-music')?.addEventListener('click', toggleLyricsFlyout);
    document.getElementById('tb-track-texts')?.addEventListener('click', toggleLyricsFlyout);
    document.getElementById('lyrics-flyout')?.addEventListener('click', (e) => e.stopPropagation());
  }

  function init() {
    loadLibrary();
    loadTasteModel();
    initYouTubePlayer();
    initTaskbarControls();
    updateTaskbarMiniPlayer();
    startVisualizerAndProgressLoop();
    loadHomeMood('All');
    window.addEventListener('aero:sync-complete', () => {
      reloadLibrary();
    });
  }

  return {
    init,
    reloadLibrary,
    getPlaylists: () => playlists,
    getLikedTracks: () => likedTracks,
    getRecentTracks: () => recentTracks,
    getHomeRecommendations: () => homeRecommendations,
    getActiveMood: () => activeMood,
    loadHomeMood,
    getActivePlaylistId: () => activePlaylistId,
    setActivePlaylistId: (id) => {
      activePlaylistId = id;
      notifyListeners();
    },
    createPlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    exportLibraryJson,
    importLibraryJson,
    removeTrackFromPlaylist,
    exportLibraryJson,
    importLibraryJson,
    toggleLikeTrack,
    isTrackLiked,
    getCurrentTrack: () => currentTrack,
    getCurrentTime: getEffectiveCurrentTime,
    getEffectiveCurrentTime,
    getEffectiveDuration,
    isPlaying: () => isPlaying,
    isLooping: () => isLooping,
    getVolume: () => volume,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleLoop,
    setVolume,
    seekFraction,
    searchYouTubeMusic,
    importPlaylistFromUrl,
    formatTime,
    getSettings: () => settings,
    updateSettings,
    findPlaylist,
    playPlaylist,
    getTasteProfile: () => tasteModel,
    playTasteRecommendations,
    playMoreLikeCurrent,
    skipCurrentArtist
  };
})();

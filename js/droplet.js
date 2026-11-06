window.GoldenGateDroplet = (function () {
  const DB_NAME = 'GoldenGateDropletDB';
  const DB_VERSION = 1;
  const TURNS_LS_KEY = 'webos_droplet_turns_v2';
  const MEMORIES_LS_KEY = 'webos_droplet_memories_v2';
  const PERMS_LS_KEY = 'webos_droplet_perms_v2';
  const AUDIT_LS_KEY = 'webos_droplet_audit_v2';
  const SKILLS_LS_KEY = 'webos_droplet_skills_v2';
  const RULES_LS_KEY = 'webos_droplet_rules_v2';
  const TTS_LS_KEY = 'webos_droplet_tts_v3';
  const API_KEY_LS = 'webos_droplet_gemini_key_v1';

  let isOpen = false;
  let isDrawerOpen = false;
  let activeDrawerTab = 'chat';
  let altPressedAlone = false;
  let gl = null;
  let shaderProgram = null;
  let startTime = performance.now();
  let typingTimer = null;
  let synthCtx = null;

  // Cross-tab BroadcastChannel sync
  const syncChannel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('goldengate_droplet_sync') : null;

  // 1. Voice & Synth Settings (TTS speech off by default, Deltarune-style synth blips on by default)
  let ttsConfig = {
    muted: false,
    synthBlip: true,
    useSpeech: false,
    rate: 1.05,
    pitch: 1.0
  };

  // 2. Conversation Context & Follow-up State
  const MAX_TURNS = 20;
  let conversationTurns = [];
  let followupState = {
    lastCommandInput: '',
    lastApp: 'notes',
    lastNoteTitle: 'Quick Note',
    lastEntity: '',
    lastUrl: '',
    lastTrack: null
  };

  // 6. Personal Memory
  let personalMemories = [
    { id: 'mem-1', text: "Alex's birthday is June 3", createdAt: Date.now() - 86400000 },
    { id: 'mem-2', text: 'I hate country music', createdAt: Date.now() - 43200000 }
  ];

  // 10. Manifest-Based Skills (4 Built-ins)
  const DEFAULT_SKILLS = [
    {
      id: 'skill-notes',
      name: 'Notes & Lists',
      description: 'Create lists, append items, and summarize onscreen notes',
      enabled: true,
      commands: ['make a list', 'add', 'summarize this note', 'delete note'],
      actions: ['notes.create', 'notes.append', 'notes.summarize', 'notes.delete']
    },
    {
      id: 'skill-music',
      name: 'Taste DJ & Media',
      description: 'Personalized music taste scoring, recommendations, playlist playback, and playback controls',
      enabled: true,
      commands: ['play playlist', 'play some songs I would like', 'more like this', 'skip this artist', 'play', 'pause'],
      actions: ['music.play', 'music.playPlaylist', 'music.pause', 'music.recommend', 'music.moreLikeThis', 'music.skipArtist']
    },
    {
      id: 'skill-web',
      name: 'Web & Shortcuts',
      description: 'Open websites in Aero, manage desktop shortcuts, and send messages',
      enabled: true,
      commands: ['open in browser', 'shortcut', 'send to'],
      actions: ['aero.openUrl', 'files.open', 'files.createShortcut', 'files.deleteShortcut', 'comm.send']
    },
    {
      id: 'skill-system',
      name: 'System & Glass Control',
      description: 'Control apps, master volume, LiquidGL tint, and live weather',
      enabled: true,
      commands: ['open', 'close', 'set volume', 'set tint', 'weather'],
      actions: ['system.openApp', 'system.closeApp', 'system.setVolume', 'system.setTint', 'system.weather']
    }
  ];
  let skills = [];

  // 11. Per-App Permissions & Audit Log
  const DEFAULT_PERMISSIONS = {
    notes: { read: true, write: true },
    files: { read: true, write: true },
    music: { read: true, write: true },
    aero: { read: true, write: true },
    system: { read: true, write: true },
    comm: { read: true, write: true }
  };
  let permissions = {};
  let auditLog = [];
  let pendingConfirmation = null;

  // 9. Simple Rules / Triggers + 8. Scheduled Digests
  const DEFAULT_RULES = [
    {
      id: 'rule-9pm',
      type: 'time',
      time: '21:00',
      conditionLabel: 'At 21:00 (9:00 PM)',
      actionLabel: 'Suggest wrapping up for the evening',
      enabled: true
    },
    {
      id: 'rule-note-task',
      type: 'event',
      event: 'notes:created',
      conditionLabel: 'When a note is created',
      actionLabel: 'Ask if it should be added as a task in Todo',
      enabled: true
    },
    {
      id: 'rule-morning-digest',
      type: 'digest',
      time: '09:00',
      conditionLabel: 'Morning Digest (09:00)',
      actionLabel: 'Deliver tasks, notes, and music picks via Service Worker',
      enabled: true
    },
    {
      id: 'rule-evening-digest',
      type: 'digest',
      time: '20:00',
      conditionLabel: 'Evening Digest (20:00)',
      actionLabel: 'Deliver evening summary and music recommendations',
      enabled: true
    }
  ];
  let rules = [];
  let lastProactiveTime = 0;

  // ==========================================================================
  // IndexedDB + LocalStorage Persistence & Cross-Tab Sync
  // ==========================================================================
  let dbInstance = null;

  function openDatabase() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = () => resolve(null);
    });
  }

  function idbSet(key, val) {
    if (!dbInstance) return;
    try {
      const tx = dbInstance.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
    } catch (e) {}
  }

  function loadAllState() {
    try {
      const tRaw = localStorage.getItem(TURNS_LS_KEY);
      if (tRaw) conversationTurns = JSON.parse(tRaw);
    } catch (e) {}

    try {
      const mRaw = localStorage.getItem(MEMORIES_LS_KEY);
      if (mRaw) personalMemories = JSON.parse(mRaw);
    } catch (e) {}

    try {
      const pRaw = localStorage.getItem(PERMS_LS_KEY);
      permissions = pRaw ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(pRaw) } : { ...DEFAULT_PERMISSIONS };
    } catch (e) {
      permissions = { ...DEFAULT_PERMISSIONS };
    }

    try {
      const aRaw = localStorage.getItem(AUDIT_LS_KEY);
      if (aRaw) auditLog = JSON.parse(aRaw);
    } catch (e) {}

    try {
      const sRaw = localStorage.getItem(SKILLS_LS_KEY);
      skills = sRaw ? JSON.parse(sRaw) : JSON.parse(JSON.stringify(DEFAULT_SKILLS));
    } catch (e) {
      skills = JSON.parse(JSON.stringify(DEFAULT_SKILLS));
    }

    try {
      const rRaw = localStorage.getItem(RULES_LS_KEY);
      rules = rRaw ? JSON.parse(rRaw) : JSON.parse(JSON.stringify(DEFAULT_RULES));
    } catch (e) {
      rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    }

    try {
      const ttsRaw = localStorage.getItem(TTS_LS_KEY);
      if (ttsRaw) ttsConfig = { ...ttsConfig, ...JSON.parse(ttsRaw) };
    } catch (e) {}
  }

  function saveStateSlice(lsKey, data, syncType) {
    try {
      localStorage.setItem(lsKey, JSON.stringify(data));
      idbSet(lsKey, data);
      if (syncChannel && syncType) {
        syncChannel.postMessage({ type: syncType, payload: data });
      }
    } catch (e) {}
  }

  function recordTurn(role, text) {
    conversationTurns.push({
      id: 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      role,
      text,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    });
    if (conversationTurns.length > MAX_TURNS) {
      conversationTurns = conversationTurns.slice(-MAX_TURNS);
    }
    saveStateSlice(TURNS_LS_KEY, conversationTurns, 'SYNC_TURNS');
    if (isDrawerOpen && activeDrawerTab === 'chat') {
      renderDrawerContent();
    }
  }

  function recordAudit(actionId, appId, detail, status = 'allowed') {
    auditLog.unshift({
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      actionId,
      appId,
      detail,
      status,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    });
    if (auditLog.length > 40) auditLog = auditLog.slice(0, 40);
    saveStateSlice(AUDIT_LS_KEY, auditLog, 'SYNC_AUDIT');
    if (isDrawerOpen && activeDrawerTab === 'audit') {
      renderDrawerContent();
    }
  }

  // ==========================================================================
  // 1. Deltarune-Style Web-Synthesized Voice Blips & Optional Browser TTS
  // ==========================================================================
  function playDeltaruneBlip(charCode = 97) {
    if (ttsConfig.muted || !ttsConfig.synthBlip) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!synthCtx) synthCtx = new AudioContextClass();
      if (synthCtx.state === 'suspended') synthCtx.resume();

      const now = synthCtx.currentTime;
      const osc = synthCtx.createOscillator();
      const filter = synthCtx.createBiquadFilter();
      const gain = synthCtx.createGain();

      // Subtle character-seeded pitch variation like Deltarune dialogue blips
      const pitchScale = Math.max(0.6, Math.min(1.6, Number(ttsConfig.pitch) || 1.0));
      const semitoneOffset = ((charCode * 7) % 5) - 2;
      const baseFreq = (310 + semitoneOffset * 14) * pitchScale;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.08, now + 0.018);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.92, now + 0.036);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1350, now);

      const masterVol = window.GoldenGateOS?.getMasterVolume?.() ?? 0.8;
      const peakGain = Math.max(0.005, 0.045 * masterVol);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(synthCtx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  function speakReply(text) {
    if (ttsConfig.muted || !ttsConfig.useSpeech || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = Math.max(0.5, Math.min(2.0, Number(ttsConfig.rate) || 1.0));
      utter.pitch = Math.max(0.5, Math.min(2.0, Number(ttsConfig.pitch) || 1.0));
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  function updateTtsMuteButtonUI() {
    const btn = document.getElementById('droplet-tts-mute-btn');
    if (!btn) return;
    btn.classList.toggle('muted', ttsConfig.muted);
    btn.innerHTML = ttsConfig.muted
      ? window.GoldenGateIcons.getUiIcon('mute', 16)
      : window.GoldenGateIcons.getUiIcon('mic', 16);
  }

  // ==========================================================================
  // 5. App Action Registry + 11. Permission & Destructive Action Guard
  // ==========================================================================
  function isSkillEnabledForAction(actionId) {
    const sk = skills.find((s) => (s.actions || []).includes(actionId));
    return sk ? Boolean(sk.enabled) : true;
  }

  function checkPermission(appId, mode = 'write') {
    const appPerm = permissions[appId] || { read: true, write: true };
    return Boolean(appPerm[mode]);
  }

  function getHatedMusicTerms() {
    const terms = [];
    personalMemories.forEach((m) => {
      const txt = m.text.toLowerCase();
      const match = txt.match(/hate\s+([a-z0-9\s]+?)(?:\s+music|$)/i);
      if (match && match[1]) terms.push(match[1].trim());
    });
    return terms;
  }

  const ACTION_REGISTRY = {
    'notes.create': {
      app: 'notes',
      mode: 'write',
      destructive: false,
      run: async ({ title, content }) => {
        window.GoldenGateOS.launchApp('notes');
        const note = window.GoldenGateApps.notesApi.createNote(title || 'New List', content || '');
        followupState.lastApp = 'notes';
        followupState.lastNoteTitle = note.title;
        followupState.lastEntity = note.title;
        return `Created note "${note.title}" in Notes.`;
      }
    },
    'notes.append': {
      app: 'notes',
      mode: 'write',
      destructive: false,
      run: async ({ item, targetTitle }) => {
        window.GoldenGateOS.launchApp('notes');
        const titleToUse = targetTitle || followupState.lastNoteTitle || '';
        const note = window.GoldenGateApps.notesApi.appendItem(item, titleToUse);
        followupState.lastApp = 'notes';
        if (note) followupState.lastNoteTitle = note.title;
        return `Added "${item}" to "${note ? note.title : 'Notes'}".`;
      }
    },
    'notes.summarize': {
      app: 'notes',
      mode: 'read',
      destructive: false,
      run: async () => {
        const ctx = window.GoldenGateOS.getActiveScreenContext();
        const note = ctx.activeNote;
        if (!note || !note.content.trim()) {
          return 'The current note is empty.';
        }
        const lines = note.content
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const preview = lines.slice(0, 4).join(', ');
        return `Note "${note.title}" has ${lines.length} line(s): ${preview}.`;
      }
    },
    'notes.delete': {
      app: 'notes',
      mode: 'write',
      destructive: true,
      run: async ({ title }) => {
        const target = title || followupState.lastNoteTitle || 'Quick Note';
        const removed = window.GoldenGateApps.notesApi.deleteNote(target);
        return removed ? `Deleted note "${removed.title}".` : `Could not find note "${target}".`;
      }
    },
    'files.open': {
      app: 'files',
      mode: 'read',
      destructive: false,
      run: async () => {
        window.GoldenGateOS.launchApp('files');
        followupState.lastApp = 'files';
        return 'Opened Files.';
      }
    },
    'files.createShortcut': {
      app: 'files',
      mode: 'write',
      destructive: false,
      run: async ({ title, url }) => {
        window.GoldenGateOS.addWebsiteShortcut({ title, url });
        followupState.lastEntity = title;
        followupState.lastUrl = url;
        return `Created desktop shortcut for ${title}.`;
      }
    },
    'files.deleteShortcut': {
      app: 'files',
      mode: 'write',
      destructive: true,
      run: async ({ title }) => {
        const scs = window.GoldenGateOS.getShortcuts();
        const match = scs.find((s) => s.title.toLowerCase() === (title || '').toLowerCase());
        if (!match) return `Shortcut "${title}" not found.`;
        window.GoldenGateOS.removeShortcut(match.id);
        return `Deleted shortcut "${match.title}".`;
      }
    },
    'music.play': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async ({ query }) => {
        if (query) {
          const matchedPl = window.GoldenGateMusic.findPlaylist(query);
          if (matchedPl && matchedPl.tracks && matchedPl.tracks.length > 0) {
            return await executeRegistryAction('music.playPlaylist', { name: query });
          }
        }
        const out = window.GoldenGateOS.runTerminalCommand(query ? `music-play ${query}` : 'music-play');
        followupState.lastApp = 'music';
        followupState.lastEntity = query || 'music';
        return out;
      }
    },
    'music.playPlaylist': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async ({ name }) => {
        const res = window.GoldenGateMusic.playPlaylist(name);
        followupState.lastApp = 'music';
        if (res && res.success) {
          followupState.lastEntity = res.name;
          return `Playing playlist "${res.name}" (${res.count} tracks). Starting with "${res.firstTrack.title}".`;
        }
        if (res && res.empty) {
          return `Playlist "${res.name}" is currently empty.`;
        }
        return `Playlist "${name}" not found in your library.`;
      }
    },
    'music.pause': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async () => {
        return window.GoldenGateOS.runTerminalCommand('music-pause');
      }
    },
    'music.recommend': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async () => {
        const hated = getHatedMusicTerms();
        const topTrack = await window.GoldenGateMusic.playTasteRecommendations(hated);
        followupState.lastApp = 'music';
        if (topTrack) {
          followupState.lastTrack = topTrack;
          return `Playing "${topTrack.title}" by ${topTrack.artist} based on your taste profile${hated.length ? ` (excluding ${hated.join(', ')})` : ''}.`;
        }
        return 'Playing recommended tracks from your library.';
      }
    },
    'music.moreLikeThis': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async () => {
        const next = await window.GoldenGateMusic.playMoreLikeCurrent();
        if (next) {
          return `Playing "${next.title}" by ${next.artist}, similar to your current track.`;
        }
        return 'Queued tracks similar to your current song.';
      }
    },
    'music.skipArtist': {
      app: 'music',
      mode: 'write',
      destructive: false,
      run: async () => {
        const artist = window.GoldenGateMusic.skipCurrentArtist();
        if (artist) {
          return `Skipped ${artist} and lowered their taste affinity score.`;
        }
        return 'Skipped to the next track.';
      }
    },
    'aero.openUrl': {
      app: 'aero',
      mode: 'write',
      destructive: false,
      run: async ({ url, title }) => {
        window.GoldenGateOS.openUrlInBrowser(url, title || url);
        followupState.lastApp = 'aero';
        followupState.lastUrl = url;
        followupState.lastEntity = title || url;
        return `Opened ${title || url} in Aero browser.`;
      }
    },
    'system.openApp': {
      app: 'system',
      mode: 'write',
      destructive: false,
      run: async ({ appId }) => {
        window.GoldenGateOS.launchApp(appId);
        followupState.lastApp = appId;
        followupState.lastEntity = appId;
        return `Opened ${appId}.`;
      }
    },
    'system.closeApp': {
      app: 'system',
      mode: 'write',
      destructive: false,
      run: async ({ appId }) => {
        const ok = window.GoldenGateOS.closeApp(appId);
        return ok ? `Closed ${appId}.` : `${appId} is not open.`;
      }
    },
    'system.setVolume': {
      app: 'system',
      mode: 'write',
      destructive: false,
      run: async ({ level }) => {
        return window.GoldenGateOS.runTerminalCommand(`set-volume ${level}`);
      }
    },
    'system.setTint': {
      app: 'system',
      mode: 'write',
      destructive: false,
      run: async ({ color }) => {
        return window.GoldenGateOS.runTerminalCommand(`set-tint ${color}`);
      }
    },
    'system.weather': {
      app: 'system',
      mode: 'read',
      destructive: false,
      run: async () => {
        return window.GoldenGateOS.runTerminalCommand('weather-fetch');
      }
    },
    'comm.send': {
      app: 'comm',
      mode: 'write',
      destructive: true,
      run: async ({ recipient, content }) => {
        const msgBody = content || followupState.lastEntity || followupState.lastNoteTitle || 'Note content';
        window.GoldenGateOS.pushNotification({
          title: `Sent to ${recipient}`,
          body: `Dispatched: "${msgBody}"`,
          category: 'system'
        });
        return `Sent "${msgBody}" to ${recipient}.`;
      }
    }
  };

  async function executeRegistryAction(actionId, params = {}, bypassConfirm = false) {
    const def = ACTION_REGISTRY[actionId];
    if (!def) return `Unknown action ${actionId}.`;

    if (!isSkillEnabledForAction(actionId)) {
      recordAudit(actionId, def.app, JSON.stringify(params), 'blocked (skill disabled)');
      return `Action ${actionId} is blocked because its skill is disabled in the Skills tab.`;
    }

    if (!checkPermission(def.app, def.mode)) {
      recordAudit(actionId, def.app, JSON.stringify(params), `blocked (no ${def.mode} permission)`);
      return `Permission denied: Droplet does not have ${def.mode} access to ${def.app}.`;
    }

    if (def.destructive && !bypassConfirm) {
      return new Promise((resolve) => {
        showConfirmationPrompt(
          `Confirm destructive action: ${actionId} (${Object.values(params).filter(Boolean).join(', ')})?`,
          async () => {
            const res = await def.run(params);
            recordAudit(actionId, def.app, JSON.stringify(params), 'confirmed');
            resolve(res);
          },
          () => {
            recordAudit(actionId, def.app, JSON.stringify(params), 'canceled');
            resolve(`Canceled ${actionId}.`);
          }
        );
      });
    }

    const output = await def.run(params);
    recordAudit(actionId, def.app, JSON.stringify(params), 'allowed');
    return output;
  }

  function showConfirmationPrompt(label, onConfirm, onCancel) {
    const bar = document.getElementById('droplet-confirm-bar');
    const txt = document.getElementById('droplet-confirm-text');
    const yesBtn = document.getElementById('droplet-confirm-yes');
    const noBtn = document.getElementById('droplet-confirm-no');
    if (!bar || !txt || !yesBtn || !noBtn) {
      onConfirm();
      return;
    }
    txt.textContent = label;
    bar.classList.remove('hidden');

    yesBtn.onclick = () => {
      bar.classList.add('hidden');
      onConfirm();
    };
    noBtn.onclick = () => {
      bar.classList.add('hidden');
      onCancel();
    };
  }

  // ==========================================================================
  // Local Math, Unit, Time & Direct Command Optimizer (Zero Gemini Calls Needed)
  // ==========================================================================
  const KNOWN_SITES = {
    youtube: 'https://www.youtube.com',
    google: 'https://www.google.com',
    wikipedia: 'https://en.wikipedia.org/wiki/Main_Page',
    github: 'https://github.com',
    hackernews: 'https://news.ycombinator.com',
    reddit: 'https://www.reddit.com',
    example: 'https://example.com',
    truffled: 'https://truffled.lol/g'
  };

  function trySolveMathOrFactLocally(rawInput) {
    const q = rawInput.trim();
    const lower = q.toLowerCase().replace(/[?!.]+$/, '').trim();

    // 1. Time / Date queries
    if (/^(what time is it|current time|time)$/.test(lower)) {
      return `The current time is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    }
    if (/^(what day is it|what is today's date|today's date|date)$/.test(lower)) {
      return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
    }

    // 2. Square root / percentage / power queries
    const sqrtMatch = lower.match(/^(?:what(?:'s| is)\s+)?(?:the\s+)?(?:square root|sqrt)\s+of\s+(\d+(?:\.\d+)?)$/);
    if (sqrtMatch) {
      const n = Number(sqrtMatch[1]);
      return `The square root of ${n} is ${Number(Math.sqrt(n).toFixed(6))}.`;
    }

    const pctMatch = lower.match(/^(?:what(?:'s| is)\s+)?(\d+(?:\.\d+)?)%\s+of\s+(\d+(?:\.\d+)?)$/);
    if (pctMatch) {
      const p = Number(pctMatch[1]);
      const base = Number(pctMatch[2]);
      return `${p}% of ${base} is ${Number(((p / 100) * base).toFixed(6))}.`;
    }

    // 3. Arithmetic expressions: "whats 9 + 10", "calculate 25 * 14", "100 / 4 + 7"
    const mathCleaned = lower
      .replace(/^(what(?:'s| is)|calculate|compute|solve|eval)\s+/i, '')
      .replace(/\bplus\b/g, '+')
      .replace(/\bminus\b/g, '-')
      .replace(/\btimes\b|\bmultiplied by\b/g, '*')
      .replace(/\bdivided by\b/g, '/')
      .replace(/\bto the power of\b|\^/g, '**')
      .trim();

    if (/^[0-9+\-*/().\s*]+$/.test(mathCleaned) && /[0-9]/.test(mathCleaned) && /[+\-*/]/.test(mathCleaned)) {
      try {
        const val = Function(`"use strict"; return (${mathCleaned});`)();
        if (typeof val === 'number' && Number.isFinite(val)) {
          return `${mathCleaned} = ${Number(val.toFixed(6))}.`;
        }
      } catch (e) {}
    }

    return null;
  }

  // ==========================================================================
  // 6. Personal Memory Save & Retrieval
  // ==========================================================================
  function tryHandleMemoryLocally(rawInput) {
    const q = rawInput.trim();
    const lower = q.toLowerCase();

    // Explicit or implicit memory storage:
    // "Remember that Alex's birthday is June 3", "Alex's birthday is June 3", "I hate country music", "My favorite color is blue"
    const remMatch = q.match(/^(?:remember(?:\s+that)?|note that|save memory:?)\s+(.+)$/i);
    if (remMatch) {
      const fact = remMatch[1].trim();
      personalMemories.unshift({ id: 'mem-' + Date.now(), text: fact, createdAt: Date.now() });
      saveStateSlice(MEMORIES_LS_KEY, personalMemories, 'SYNC_MEMORIES');
      return `Saved to memory: "${fact}".`;
    }

    if (
      /^[a-z0-9']+s\s+birthday\s+is\s+.+$/i.test(q) ||
      /^i\s+(?:hate|love|like|dislike|prefer)\s+.+$/i.test(q) ||
      /^my\s+favorite\s+.+\s+is\s+.+$/i.test(q)
    ) {
      personalMemories.unshift({ id: 'mem-' + Date.now(), text: q, createdAt: Date.now() });
      saveStateSlice(MEMORIES_LS_KEY, personalMemories, 'SYNC_MEMORIES');
      return `Got it. I stored "${q}" in your personal memory.`;
    }

    // Memory retrieval questions: "When is Alex's birthday?", "What music do I hate?", "What do you remember?"
    if (lower.includes('what do you remember') || lower === 'show memories' || lower === 'my memories') {
      if (personalMemories.length === 0) return 'You have no saved personal memories yet.';
      return `Saved memories: ${personalMemories.map((m) => m.text).join(' | ')}.`;
    }

    if (lower.startsWith('when is ') || lower.startsWith('what is ') || lower.startsWith('who is ') || lower.includes('do i hate') || lower.includes('do i like') || lower.includes('my favorite')) {
      const keywords = lower
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !['when', 'what', 'who', 'the', 'does', 'hate', 'like'].includes(w));

      const matched = personalMemories.find((m) => {
        const mLow = m.text.toLowerCase();
        return keywords.some((kw) => mLow.includes(kw));
      });
      if (matched) {
        return `From your personal memory: ${matched.text}.`;
      }
    }

    return null;
  }

  // ==========================================================================
  // 2. Follow-Up Resolution & 3. Multi-Step Command Router + 4. Onscreen Awareness
  // ==========================================================================
  async function parseAndExecuteSingleStep(stepText) {
    const raw = stepText.trim();
    const lower = raw.toLowerCase().replace(/[.!?]+$/, '').trim();

    // Follow-up: "do that again" / "repeat that"
    if (lower === 'do that again' || lower === 'repeat that' || lower === 'again') {
      if (followupState.lastCommandInput && followupState.lastCommandInput.toLowerCase() !== lower) {
        return await parseAndExecuteSingleStep(followupState.lastCommandInput);
      }
      return 'No previous command to repeat.';
    }

    // Follow-up: "open it"
    if (lower === 'open it') {
      if (followupState.lastUrl) {
        return await executeRegistryAction('aero.openUrl', {
          url: followupState.lastUrl,
          title: followupState.lastEntity
        });
      }
      if (followupState.lastApp) {
        return await executeRegistryAction('system.openApp', { appId: followupState.lastApp });
      }
    }

    // Follow-up: "delete it" / "remove it"
    if (lower === 'delete it' || lower === 'remove it') {
      if (followupState.lastApp === 'notes' && followupState.lastNoteTitle) {
        return await executeRegistryAction('notes.delete', { title: followupState.lastNoteTitle });
      }
    }

    // Follow-up: "send it to <person>" / "send to <person>"
    const sendMatch = raw.match(/^send\s+(?:it|this|that|(.+?))\s+to\s+([a-zA-Z0-9_]+)$/i);
    if (sendMatch) {
      const customContent = sendMatch[1] ? sendMatch[1].trim() : '';
      const recipient = sendMatch[2].trim();
      const ctx = window.GoldenGateOS.getActiveScreenContext();
      const noteText = ctx.activeNote ? `${ctx.activeNote.title}: ${ctx.activeNote.content}` : '';
      return await executeRegistryAction('comm.send', {
        recipient,
        content: customContent || noteText || followupState.lastEntity
      });
    }

    // Onscreen Awareness: "summarize this note" / "what is on my screen" / "add this to my list"
    if (lower.includes('summarize this note') || lower.includes('summarise this note') || lower === 'read this note') {
      return await executeRegistryAction('notes.summarize', {});
    }

    if (lower.includes('what is on my screen') || lower.includes('what app is open') || lower.includes('onscreen')) {
      const ctx = window.GoldenGateOS.getActiveScreenContext();
      if (ctx.externalBrowserBlocked) {
        return `Focused app is Aero displaying an external site (${ctx.aeroUrl}). For security, Droplet only inspects Web OS apps and cannot read external browser tabs.`;
      }
      const openList = ctx.openApps.length ? ctx.openApps.join(', ') : 'none';
      const noteInfo = ctx.activeNote ? `Active note is "${ctx.activeNote.title}".` : '';
      const trackInfo = ctx.currentTrack ? `Playing "${ctx.currentTrack.title}" by ${ctx.currentTrack.artist}.` : '';
      return `Open apps: ${openList}. Focused app: ${ctx.focusedApp || 'desktop'}. ${noteInfo} ${trackInfo}`.trim();
    }

    const addThisListMatch = raw.match(/^add\s+this\s+to\s+(?:my\s+)?(?:list|todo|groceries)$/i);
    if (addThisListMatch) {
      const ctx = window.GoldenGateOS.getActiveScreenContext();
      const itemToUse =
        ctx.currentTrack?.title || followupState.lastEntity || ctx.activeNote?.title || 'Pinned item';
      return await executeRegistryAction('notes.append', { item: itemToUse, targetTitle: 'Todo' });
    }

    // Music Taste Model Commands (Feature 7)
    if (
      lower.includes('play some songs i would like') ||
      lower.includes("play something i'd like") ||
      lower.includes('play something i would like') ||
      lower.includes('play music i like') ||
      lower.includes('recommend music')
    ) {
      return await executeRegistryAction('music.recommend', {});
    }

    if (lower === 'more like this' || lower === 'play more like this') {
      return await executeRegistryAction('music.moreLikeThis', {});
    }

    if (lower === 'skip this artist' || lower === 'block this artist') {
      return await executeRegistryAction('music.skipArtist', {});
    }

    if (lower === 'sign in' || lower === 'login' || lower === 'log in' || lower === 'account' || lower === 'my account') {
      return await executeRegistryAction('system.openApp', { appId: 'account' });
    }

    if (lower === 'sync' || lower === 'sync now' || lower === 'cloud sync' || lower === 'sync to cloud') {
      if (window.AeroAuth) {
        await window.AeroAuth.saveToCloud();
        return 'Synced settings and music tastes to your cloud account.';
      }
    }

    // Notes: "make a list called Groceries" / "create a note called Ideas"
    const makeListMatch = raw.match(/^(?:make|create|start)\s+(?:a\s+)?(?:list|note)\s+(?:called|named)\s+(.+)$/i);
    if (makeListMatch) {
      return await executeRegistryAction('notes.create', { title: makeListMatch[1].trim() });
    }

    // Notes: "add milk to Groceries" or "add milk"
    const addToNamedMatch = raw.match(/^add\s+(.+?)\s+to\s+([a-zA-Z0-9\s]+)$/i);
    if (addToNamedMatch && !lower.includes('shortcut')) {
      return await executeRegistryAction('notes.append', {
        item: addToNamedMatch[1].trim(),
        targetTitle: addToNamedMatch[2].trim()
      });
    }

    const addSimpleMatch = raw.match(/^add\s+(.+)$/i);
    if (addSimpleMatch && !lower.includes('shortcut') && !lower.includes('rule')) {
      return await executeRegistryAction('notes.append', {
        item: addSimpleMatch[1].trim(),
        targetTitle: followupState.lastNoteTitle || 'Groceries'
      });
    }

    // Delete note: "delete note Groceries"
    const delNoteMatch = raw.match(/^(?:delete|remove)\s+(?:note|list)\s+(.+)$/i);
    if (delNoteMatch) {
      return await executeRegistryAction('notes.delete', { title: delNoteMatch[1].trim() });
    }

    // Open website in browser: "open youtube in browser", "open github.com in aero", "go to wikipedia.org"
    const openBrowserMatch = raw.match(
      /^(?:open|launch|go to)\s+([a-zA-Z0-9.-]+)(?:\s+in\s+(?:browser|aero))?$/i
    );
    if (openBrowserMatch) {
      const target = openBrowserMatch[1].toLowerCase();
      const inBrowserExplicit = /in\s+(?:browser|aero)/i.test(raw);
      const appIds = window.GoldenGateApps.getApps().map((a) => a.id);

      if (!inBrowserExplicit && appIds.includes(target)) {
        return await executeRegistryAction('system.openApp', { appId: target });
      }
      if (KNOWN_SITES[target]) {
        return await executeRegistryAction('aero.openUrl', { url: KNOWN_SITES[target], title: target });
      }
      if (target.includes('.') || inBrowserExplicit) {
        const fullUrl = target.includes('.') ? `https://${target}` : `https://www.${target}.com`;
        return await executeRegistryAction('aero.openUrl', { url: fullUrl, title: target });
      }
    }

    // Close app: "close notes"
    const closeAppMatch = lower.match(/^(?:close|quit|exit)\s+([a-z]+)$/);
    if (closeAppMatch) {
      return await executeRegistryAction('system.closeApp', { appId: closeAppMatch[1] });
    }

    // Music play / pause & playlist recognition
    if (lower === 'pause' || lower === 'pause music' || lower === 'stop music') {
      return await executeRegistryAction('music.pause', {});
    }

    // Explicit playlist prompts: "play playlist <name>", "play the playlist <name>", "play my <name> playlist", "play <name> playlist"
    const plExplicitMatch =
      raw.match(/^play\s+(?:the\s+|my\s+)?playlist\s+(.+)$/i) ||
      raw.match(/^play\s+(?:the\s+|my\s+)?(.+?)\s+playlist$/i);
    if (plExplicitMatch) {
      return await executeRegistryAction('music.playPlaylist', { name: plExplicitMatch[1].trim() });
    }

    // Generic "play playlist" without name (plays active or first playlist)
    if (/^play\s+(?:the\s+|my\s+)?playlist$/i.test(raw)) {
      return await executeRegistryAction('music.playPlaylist', { name: '' });
    }

    const playMatch = raw.match(/^play\s+(.+)$/i);
    if (playMatch) {
      const q = playMatch[1].trim();
      const matchedPl = window.GoldenGateMusic.findPlaylist(q);
      if (matchedPl && matchedPl.tracks && matchedPl.tracks.length > 0) {
        return await executeRegistryAction('music.playPlaylist', { name: q });
      }
      return await executeRegistryAction('music.play', { query: q });
    }

    // Volume
    const volMatch = lower.match(/(?:set\s+)?volume\s+(?:to\s+)?(\d+)/);
    if (volMatch) {
      return await executeRegistryAction('system.setVolume', { level: Number(volMatch[1]) });
    }

    // Tint
    const tintMatch = lower.match(/(?:set\s+)?tint\s+(?:to\s+)?(#[0-9a-f]{3,6}|bw|blue|green|amber|red|violet)/);
    if (tintMatch) {
      const map = {
        blue: '#3b82f6',
        green: '#10b981',
        amber: '#f59e0b',
        red: '#ef4444',
        violet: '#a855f7',
        bw: 'bw'
      };
      const c = map[tintMatch[1]] || tintMatch[1];
      return await executeRegistryAction('system.setTint', { color: c });
    }

    // Weather
    if (lower === 'weather' || lower === 'check weather' || lower === 'fetch weather') {
      return await executeRegistryAction('system.weather', {});
    }

    // Digest trigger
    if (lower.includes('morning digest') || lower.includes('evening digest') || lower === 'run digest') {
      return triggerScheduledDigest('Manual Digest');
    }

    return null;
  }

  async function tryExecuteMultiStepCommands(rawInput) {
    // Split multi-step chains separated by commas, "and then", or "then"
    const segments = rawInput
      .split(/\s*(?:,|;\s*|\band then\b|\bthen\b)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length === 0) return null;

    // Check if the first segment is a recognized command
    const firstResult = await parseAndExecuteSingleStep(segments[0]);
    if (!firstResult) return null;

    const outputs = [firstResult];
    for (let i = 1; i < segments.length; i++) {
      const stepRes = await parseAndExecuteSingleStep(segments[i]);
      if (stepRes) outputs.push(stepRes);
    }

    followupState.lastCommandInput = rawInput;
    return outputs.join(' ');
  }

  // ==========================================================================
  // 8. Scheduled Digests (Service Worker + Notifications API)
  // ==========================================================================
  function buildDigestSummaryText(periodLabel = 'Daily Digest') {
    const notes = window.GoldenGateApps.notesApi?.getAllNotes() || [];
    const shortcuts = window.GoldenGateOS.getShortcuts?.() || [];
    const notifs = window.GoldenGateOS.getNotifications?.() || [];
    const curTrack = window.GoldenGateMusic.getCurrentTrack?.();
    const recs = window.GoldenGateMusic.getHomeRecommendations?.() || [];
    const pick = curTrack || recs[0];

    return `${periodLabel}: ${notes.length} note(s) (${notes.map((n) => n.title).slice(0, 3).join(', ')}), ${shortcuts.length} desktop shortcut(s), ${notifs.length} unread alert(s). Music pick: ${pick ? `${pick.title} by ${pick.artist}` : 'Limusic Chill Mix'}.`;
  }

  function triggerScheduledDigest(periodLabel = 'Daily Digest') {
    const summary = buildDigestSummaryText(periodLabel);

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_DIGEST_NOTIFICATION',
        title: `Droplet ${periodLabel}`,
        body: summary
      });
    } else {
      window.GoldenGateOS.pushNotification({
        title: `Droplet ${periodLabel}`,
        body: summary,
        category: 'digest'
      });
    }

    recordAudit('digest.deliver', 'system', periodLabel, 'allowed');
    return summary;
  }

  // ==========================================================================
  // 9. Simple Rules Engine & 13. Light Proactivity
  // ==========================================================================
  function showProactiveSuggestion(text, onAccept) {
    const now = Date.now();
    if (now - lastProactiveTime < 25000) return; // Keep rare and non-intrusive
    lastProactiveTime = now;

    const chip = document.getElementById('droplet-proactive-chip');
    const txtEl = document.getElementById('droplet-proactive-text');
    const yesBtn = document.getElementById('droplet-proactive-accept');
    const noBtn = document.getElementById('droplet-proactive-dismiss');
    if (!chip || !txtEl || !yesBtn || !noBtn) return;

    txtEl.textContent = text;
    chip.classList.remove('hidden');

    yesBtn.onclick = async () => {
      chip.classList.add('hidden');
      if (typeof onAccept === 'function') {
        const res = await onAccept();
        if (res) setReply(res);
      }
    };

    noBtn.onclick = () => {
      chip.classList.add('hidden');
    };
  }

  function initRulesAndProactivity() {
    // App-event listener
    window.addEventListener('os:app-event', (e) => {
      const detail = e.detail || {};
      if (detail.type === 'notes:created' && detail.note) {
        const noteRule = rules.find((r) => r.id === 'rule-note-task' && r.enabled);
        if (noteRule && detail.note.title.toLowerCase() !== 'todo') {
          showProactiveSuggestion(
            `This note "${detail.note.title}" looks like a task. Add to Todo?`,
            async () => {
              return await executeRegistryAction('notes.append', {
                item: detail.note.title,
                targetTitle: 'Todo'
              });
            }
          );
        }
      }
    });

    // Time-based rule checker every 60 seconds
    setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      rules.forEach((r) => {
        if (!r.enabled || !r.time) return;
        if (r.time === hhmm && r._lastFiredDate !== now.toDateString()) {
          r._lastFiredDate = now.toDateString();
          if (r.type === 'digest') {
            triggerScheduledDigest(r.conditionLabel);
          } else {
            showProactiveSuggestion(`${r.actionLabel}. Play evening music picks?`, async () => {
              return await executeRegistryAction('music.recommend', {});
            });
          }
        }
      });
    }, 60000);
  }

  // ==========================================================================
  // General Question AI Responder (Gemini + Local Server AI Bridge + Wikipedia)
  // ==========================================================================
  async function askAIModel(userPrompt) {
    const ctx = window.GoldenGateOS.getActiveScreenContext();
    const recentHistory = conversationTurns
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'User' : 'Droplet'}: ${t.text}`)
      .join('\n');
    const memText = personalMemories.map((m) => m.text).join('; ');
    const screenSummary = `Focused app: ${ctx.focusedApp || 'desktop'}. Active note: ${ctx.activeNote ? `${ctx.activeNote.title} (${ctx.activeNote.content.slice(0, 120)})` : 'none'}. Current song: ${ctx.currentTrack ? `${ctx.currentTrack.title} by ${ctx.currentTrack.artist}` : 'none'}.`;

    const sysInstruction = [
      'You are Droplet, the intelligent AI assistant inside AeroOS.',
      'Reply in 1 to 4 clear, helpful sentences. Never use em-dashes.',
      `User memories: ${memText || 'none'}.`,
      `Onscreen OS context: ${screenSummary}`,
      recentHistory ? `Recent conversation:\n${recentHistory}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const apiKey = (localStorage.getItem(API_KEY_LS) || '').trim();

    // 1. Direct client Google Gemini API call if key is saved (works everywhere, including GitHub Pages)
    if (apiKey) {
      for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']) {
        try {
          const gemUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const payload = {
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }]
              }
            ],
            systemInstruction: {
              parts: [{ text: sysInstruction }]
            },
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 600
            }
          };
          const gRes = await fetch(gemUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (gRes.ok) {
            const gData = await gRes.json();
            const text = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim()) {
              return text.trim().replace(/\u2014/g, ', ');
            }
          }
        } catch (err) {}
      }
    }

    // 2. Call local server /ai route (proxies Gemini or Cloud AI)
    try {
      const res = await fetch('/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          system: sysInstruction,
          apiKey
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.reply) {
          return data.reply.replace(/\u2014/g, ', ');
        }
      }
    } catch (e) {}

    // 3. Zero-config Cloud AI fallback via Pollinations OpenAI endpoint
    try {
      const polRes = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: sysInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.4
        })
      });
      if (polRes.ok) {
        const polData = await polRes.json();
        const content = polData.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return content.trim().replace(/\u2014/g, ', ');
        }
      }
    } catch (e) {}

    // 4. Wikipedia summary fallback for factual queries
    try {
      const topic = userPrompt
        .replace(/^(what is|who is|who was|tell me about|explain|define|where is)\s+/i, '')
        .replace(/[?.,!]/g, '')
        .trim();
      if (topic) {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract) {
            return wikiData.extract.split('. ').slice(0, 2).join('. ') + '.';
          }
        }
      }
    } catch (e) {}

    return `I received "${userPrompt}". You can ask me questions, request code, search the web, or run commands to control music and apps.`;
  }

  // ==========================================================================
  // Main User Prompt Handler & Kinetic Typography Streaming
  // ==========================================================================
  function setReply(text, speak = true) {
    const clean = (text || '').replace(/\u2014/g, ', ');
    const el = document.getElementById('droplet-reply-text');
    const bubble = document.getElementById('droplet-reply-bubble');
    if (bubble) {
      bubble.classList.remove('hidden');
      bubble.classList.remove('droplet-bubble-pop');
      void bubble.offsetWidth;
      bubble.classList.add('droplet-bubble-pop');
    }
    if (!el) return;

    if (typingTimer) {
      clearInterval(typingTimer);
      typingTimer = null;
    }

    if (!speak) {
      el.innerHTML = `<span class="droplet-kinetic-char">${clean}</span>`;
      return;
    }

    el.innerHTML = '';
    const chars = Array.from(clean);
    let idx = 0;
    const step = chars.length > 140 ? 2 : 1;
    const speedMs = Math.max(12, Math.round(20 / (Number(ttsConfig.rate) || 1.0)));

    typingTimer = setInterval(() => {
      if (idx >= chars.length) {
        clearInterval(typingTimer);
        typingTimer = null;
        return;
      }

      const slice = chars.slice(idx, idx + step).join('');
      const span = document.createElement('span');
      span.className = 'droplet-kinetic-char';
      span.textContent = slice;
      el.appendChild(span);

      const firstChar = slice.trim().charAt(0);
      if (firstChar && idx % 2 === 0) {
        playDeltaruneBlip(firstChar.charCodeAt(0));
      }

      idx += step;
    }, speedMs);

    if (ttsConfig.useSpeech) {
      speakReply(clean);
    }
  }

  async function handlePromptSubmit(rawPrompt) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return;

    recordTurn('user', prompt);

    // 1. Check local math, conversions, or date/time (no Gemini usage)
    const localMathOrFact = trySolveMathOrFactLocally(prompt);
    if (localMathOrFact) {
      setReply(localMathOrFact);
      recordTurn('assistant', localMathOrFact);
      return;
    }

    // 2. Check Personal Memory store/retrieve locally (no Gemini usage)
    const memoryReply = tryHandleMemoryLocally(prompt);
    if (memoryReply) {
      setReply(memoryReply);
      recordTurn('assistant', memoryReply);
      return;
    }

    // 3. Check Multi-Step or Single-Step OS Commands & Follow-ups (no Gemini usage)
    const cmdReply = await tryExecuteMultiStepCommands(prompt);
    if (cmdReply) {
      setReply(cmdReply);
      recordTurn('assistant', cmdReply);
      return;
    }

    // 4. General Question -> AI Responder (Gemini / Cloud AI Bridge)
    setReply('Thinking...', false);
    const aiReply = await askAIModel(prompt);
    setReply(aiReply, true);
    recordTurn('assistant', aiReply);
  }

  // ==========================================================================
  // Control Drawer Renderer (Chat & TTS | Skills | Memory & Taste | Rules & Digest | Audit)
  // ==========================================================================
  function renderDrawerContent() {
    const body = document.getElementById('droplet-drawer-body');
    if (!body) return;

    document.querySelectorAll('.droplet-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.dtab === activeDrawerTab);
    });

    if (activeDrawerTab === 'chat') {
      const savedKey = localStorage.getItem(API_KEY_LS) || '';
      body.innerHTML = `
        <div class="droplet-tab-stage" style="display:flex;flex-direction:column;gap:10px;">
          <div class="droplet-glass-row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 12px;border-radius:12px;">
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:600;">
              <input type="checkbox" id="dt-tts-synth" ${ttsConfig.synthBlip ? 'checked' : ''} style="accent-color:#38bdf8;" />
              Synth Blips
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="dt-tts-speech" ${ttsConfig.useSpeech ? 'checked' : ''} style="accent-color:#38bdf8;" />
              Browser TTS
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;">
              Speed
              <input type="range" id="dt-tts-rate" min="0.6" max="1.8" step="0.1" value="${ttsConfig.rate}" style="width:56px;accent-color:#38bdf8;" />
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;">
              Pitch
              <input type="range" id="dt-tts-pitch" min="0.6" max="1.6" step="0.1" value="${ttsConfig.pitch}" style="width:56px;accent-color:#38bdf8;" />
            </label>
            <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">
              <input type="checkbox" id="dt-tts-mute" ${ttsConfig.muted ? 'checked' : ''} style="accent-color:#38bdf8;" />
              Mute
            </label>
          </div>

          <form id="dt-gemini-key-form" style="display:flex;gap:6px;">
            <input type="password" id="dt-gemini-key-in" class="clean-input droplet-glass-input" value="${savedKey}" placeholder="Gemini API Key" style="font-size:11px;padding:6px 10px;flex:1;" />
            <button type="submit" class="btn-solid" style="padding:4px 10px;font-size:11px;">Save</button>
            <button type="button" id="dt-gemini-test-btn" class="btn-flat" style="padding:4px 10px;font-size:11px;">Test Key</button>
          </form>
          <div id="dt-key-test-status" style="font-size:11px;color:#38bdf8;margin-top:-4px;display:none;"></div>

          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:rgba(255,255,255,0.78);">Conversation History (${conversationTurns.length}/${MAX_TURNS})</span>
            <div style="display:flex;gap:6px;">
              <button class="btn-flat" id="dt-export-turns" style="padding:2px 8px;font-size:10.5px;">Export</button>
              <button class="btn-flat" id="dt-clear-turns" style="padding:2px 8px;font-size:10.5px;">Clear</button>
            </div>
          </div>

          <div style="max-height:145px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
            ${
              conversationTurns.length === 0
                ? `<div class="droplet-glass-row" style="font-size:11.5px;color:rgba(255,255,255,0.72);padding:8px 10px;border-radius:10px;">No messages yet. Try asking "Whats 9 + 10" or "open Notes, make a list called Groceries, add milk".</div>`
                : conversationTurns
                    .slice()
                    .reverse()
                    .map(
                      (t, i) => `
                  <div class="droplet-glass-row" style="padding:7px 10px;border-radius:10px;font-size:11.5px;animation-delay:${i * 22}ms;">
                    <strong style="color:${t.role === 'user' ? '#7dd3fc' : '#ffffff'};">${t.role === 'user' ? 'You' : 'Droplet'}:</strong>
                    <span>${t.text}</span>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        </div>
      `;

      body.querySelector('#dt-tts-synth')?.addEventListener('change', (e) => {
        ttsConfig.synthBlip = e.target.checked;
        saveStateSlice(TTS_LS_KEY, ttsConfig);
        if (ttsConfig.synthBlip) playDeltaruneBlip(100);
      });
      body.querySelector('#dt-tts-speech')?.addEventListener('change', (e) => {
        ttsConfig.useSpeech = e.target.checked;
        saveStateSlice(TTS_LS_KEY, ttsConfig);
      });
      body.querySelector('#dt-tts-rate')?.addEventListener('input', (e) => {
        ttsConfig.rate = Number(e.target.value);
        saveStateSlice(TTS_LS_KEY, ttsConfig);
      });
      body.querySelector('#dt-tts-pitch')?.addEventListener('input', (e) => {
        ttsConfig.pitch = Number(e.target.value);
        saveStateSlice(TTS_LS_KEY, ttsConfig);
        playDeltaruneBlip(105);
      });
      body.querySelector('#dt-tts-mute')?.addEventListener('change', (e) => {
        ttsConfig.muted = e.target.checked;
        saveStateSlice(TTS_LS_KEY, ttsConfig);
        updateTtsMuteButtonUI();
      });
      body.querySelector('#dt-gemini-key-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const k = body.querySelector('#dt-gemini-key-in').value.trim();
        if (k) localStorage.setItem(API_KEY_LS, k);
        else localStorage.removeItem(API_KEY_LS);
        window.GoldenGateOS.showToast('API Key preference saved');
      });
      body.querySelector('#dt-gemini-test-btn')?.addEventListener('click', async () => {
        const k = body.querySelector('#dt-gemini-key-in')?.value.trim();
        const statusEl = body.querySelector('#dt-key-test-status');
        if (!k) {
          if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#f87171'; statusEl.textContent = 'Please enter an API key first'; }
          return;
        }
        if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#38bdf8'; statusEl.textContent = 'Testing Gemini API key...'; }
        try {
          const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(k)}`;
          const res = await fetch(testUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] })
          });
          if (res.ok) {
            localStorage.setItem(API_KEY_LS, k);
            if (statusEl) { statusEl.style.color = '#4ade80'; statusEl.textContent = 'Gemini API Key Verified Successfully!'; }
            window.GoldenGateOS.showToast('Gemini Key Verified');
          } else {
            const err = await res.json();
            if (statusEl) { statusEl.style.color = '#f87171'; statusEl.textContent = `Error: ${err.error?.message || res.statusText}`; }
          }
        } catch (e) {
          if (statusEl) { statusEl.style.color = '#f87171'; statusEl.textContent = 'Network error testing Gemini key'; }
        }
      });
      body.querySelector('#dt-export-turns')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(conversationTurns, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `droplet-chat-history-${Date.now()}.json`;
        a.click();
        window.GoldenGateOS.showToast('Chat history exported');
      });
      body.querySelector('#dt-clear-turns')?.addEventListener('click', () => {
        conversationTurns = [];
        saveStateSlice(TURNS_LS_KEY, conversationTurns, 'SYNC_TURNS');
        renderDrawerContent();
      });
      return;
    }

    if (activeDrawerTab === 'skills') {
      body.innerHTML = `
        <div class="droplet-tab-stage" style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:11px;color:rgba(255,255,255,0.78);">Enable or disable manifest-based Droplet skills:</div>
          ${skills
            .map(
              (sk, idx) => `
            <div class="droplet-glass-row" style="padding:8px 11px;border-radius:11px;display:flex;justify-content:space-between;align-items:center;gap:10px;animation-delay:${idx * 28}ms;">
              <div>
                <div style="font-size:12px;font-weight:600;color:#fff;">${sk.name}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.75);">${sk.description}</div>
                <div style="font-size:10px;color:#7dd3fc;margin-top:2px;">Actions: ${sk.actions.join(', ')}</div>
              </div>
              <input type="checkbox" class="dt-skill-toggle" data-idx="${idx}" ${sk.enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:#38bdf8;cursor:pointer;" />
            </div>
          `
            )
            .join('')}
        </div>
      `;
      body.querySelectorAll('.dt-skill-toggle').forEach((chk) => {
        chk.onchange = () => {
          const sk = skills[Number(chk.dataset.idx)];
          if (sk) {
            sk.enabled = chk.checked;
            saveStateSlice(SKILLS_LS_KEY, skills, 'SYNC_SKILLS');
          }
        };
      });
      return;
    }

    if (activeDrawerTab === 'memory') {
      const taste = window.GoldenGateMusic.getTasteProfile?.() || { artistScores: {} };
      const topArtists = Object.entries(taste.artistScores || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `${k} (${v > 0 ? '+' : ''}${v.toFixed(1)})`)
        .join(', ');

      body.innerHTML = `
        <div class="droplet-tab-stage" style="display:flex;flex-direction:column;gap:10px;">
          <form id="dt-add-mem-form" style="display:flex;gap:6px;">
            <input type="text" id="dt-mem-in" class="clean-input droplet-glass-input" placeholder="Add fact (e.g. Alex's birthday is June 3)" style="font-size:11.5px;padding:6px 10px;" required />
            <button type="submit" class="btn-solid" style="padding:4px 10px;font-size:11px;">Remember</button>
          </form>

          <div class="droplet-glass-row" style="padding:8px 11px;border-radius:11px;font-size:11px;display:flex;justify-content:space-between;align-items:center;">
            <span>Music Taste Affinities: ${topArtists || 'Play or like songs to train'}</span>
            <button class="btn-solid" id="dt-play-taste-btn" style="padding:3px 8px;font-size:10.5px;">Play My Taste</button>
          </div>

          <div style="max-height:135px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
            ${personalMemories
              .map(
                (m, idx) => `
              <div class="droplet-glass-row" style="padding:6px 10px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;animation-delay:${idx * 25}ms;">
                <span>${m.text}</span>
                <button class="btn-flat dt-del-mem" data-idx="${idx}" style="padding:2px 6px;font-size:10px;">Remove</button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;

      body.querySelector('#dt-add-mem-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = body.querySelector('#dt-mem-in').value.trim();
        if (!val) return;
        personalMemories.unshift({ id: 'mem-' + Date.now(), text: val, createdAt: Date.now() });
        saveStateSlice(MEMORIES_LS_KEY, personalMemories, 'SYNC_MEMORIES');
        renderDrawerContent();
      });

      body.querySelector('#dt-play-taste-btn')?.addEventListener('click', async () => {
        const res = await executeRegistryAction('music.recommend', {});
        setReply(res);
      });

      body.querySelectorAll('.dt-del-mem').forEach((btn) => {
        btn.onclick = () => {
          personalMemories.splice(Number(btn.dataset.idx), 1);
          saveStateSlice(MEMORIES_LS_KEY, personalMemories, 'SYNC_MEMORIES');
          renderDrawerContent();
        };
      });
      return;
    }

    if (activeDrawerTab === 'rules') {
      body.innerHTML = `
        <div class="droplet-tab-stage" style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:rgba(255,255,255,0.78);">Active Triggers &amp; Scheduled Digests</span>
            <button class="btn-solid" id="dt-run-digest-now" style="padding:3px 9px;font-size:11px;">Run Digest Now</button>
          </div>
          ${rules
            .map(
              (r, idx) => `
            <div class="droplet-glass-row" style="padding:7px 11px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;animation-delay:${idx * 28}ms;">
              <div>
                <div style="font-size:11.5px;font-weight:600;color:#fff;">${r.conditionLabel}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.75);">${r.actionLabel}</div>
              </div>
              <input type="checkbox" class="dt-rule-toggle" data-idx="${idx}" ${r.enabled ? 'checked' : ''} style="width:15px;height:15px;accent-color:#38bdf8;cursor:pointer;" />
            </div>
          `
            )
            .join('')}
        </div>
      `;

      body.querySelector('#dt-run-digest-now')?.addEventListener('click', () => {
        const summary = triggerScheduledDigest('Instant Digest');
        setReply(summary);
      });

      body.querySelectorAll('.dt-rule-toggle').forEach((chk) => {
        chk.onchange = () => {
          const r = rules[Number(chk.dataset.idx)];
          if (r) {
            r.enabled = chk.checked;
            saveStateSlice(RULES_LS_KEY, rules, 'SYNC_RULES');
          }
        };
      });
      return;
    }

    if (activeDrawerTab === 'audit') {
      const appKeys = Object.keys(permissions);
      body.innerHTML = `
        <div class="droplet-tab-stage" style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:11px;color:rgba(255,255,255,0.78);">Per-App Permissions (Read / Write):</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
            ${appKeys
              .map(
                (app, idx) => `
              <div class="droplet-glass-row" style="padding:6px 9px;border-radius:9px;font-size:11px;display:flex;justify-content:space-between;align-items:center;animation-delay:${idx * 20}ms;">
                <strong style="color:#fff;">${app}</strong>
                <div style="display:flex;gap:6px;">
                  <label><input type="checkbox" class="dt-perm-chk" data-app="${app}" data-mode="read" ${permissions[app]?.read ? 'checked' : ''}/> R</label>
                  <label><input type="checkbox" class="dt-perm-chk" data-app="${app}" data-mode="write" ${permissions[app]?.write ? 'checked' : ''}/> W</label>
                </div>
              </div>
            `
              )
              .join('')}
          </div>

          <div style="font-size:11px;color:rgba(255,255,255,0.78);">Action Audit Log (${auditLog.length}):</div>
          <div style="max-height:115px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">
            ${
              auditLog.length === 0
                ? `<div class="droplet-glass-row" style="font-size:11px;color:rgba(255,255,255,0.7);padding:6px 10px;border-radius:8px;">No actions logged yet.</div>`
                : auditLog
                    .map(
                      (a, idx) => `
                  <div class="droplet-glass-row" style="padding:5px 9px;border-radius:8px;font-size:10.5px;display:flex;justify-content:space-between;gap:8px;animation-delay:${idx * 18}ms;">
                    <span><strong>${a.actionId}</strong> (${a.appId})</span>
                    <span style="color:${a.status.includes('blocked') ? '#fca5a5' : '#6ee7b7'};">${a.status} · ${a.time}</span>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        </div>
      `;

      body.querySelectorAll('.dt-perm-chk').forEach((chk) => {
        chk.onchange = () => {
          const app = chk.dataset.app;
          const mode = chk.dataset.mode;
          if (!permissions[app]) permissions[app] = { read: true, write: true };
          permissions[app][mode] = chk.checked;
          saveStateSlice(PERMS_LS_KEY, permissions, 'SYNC_PERMS');
        };
      });
    }
  }

  // ==========================================================================
  // WebGL Orb Shader (Obsidian Black Sphere + Shifting App-Tint Rim Glow)
  // ==========================================================================
  function hexToRgbNormalized(hex) {
    const clean = (hex || '#38bdf8').replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16) || 0x38bdf8;
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  }

  function initWebGLOrb() {
    const canvas = document.getElementById('droplet-webgl-canvas');
    if (!canvas) return;
    gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return;

    const vsSource = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    // Matches the uploaded reference image: deep black core with a liquid shifting colored crescent rim
    const fsSource = `
      precision mediump float;
      varying vec2 v_uv;
      uniform float u_time;
      uniform vec3 u_tint;

      float waveNoise(vec2 p, float t) {
        float c = cos(t * 0.6);
        float s = sin(t * 0.6);
        p = mat2(c, -s, s, c) * p;
        return sin(p.x * 4.5 + sin(p.y * 4.0 + t * 1.4)) * cos(p.y * 4.5 - cos(p.x * 3.5 - t * 1.1));
      }

      void main() {
        vec2 p = (v_uv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) {
          discard;
        }

        float z = sqrt(max(0.0, 1.0 - r * r));
        float n1 = waveNoise(p * 1.6, u_time);
        float n2 = waveNoise(p * 2.8 + vec2(n1 * 0.4), -u_time * 1.2);

        // Shifting color that blends the current app tint with a live hue shift
        vec3 shiftColor = 0.5 + 0.5 * cos(u_time * 0.8 + vec3(0.0, 2.0, 4.0) + n1 * 1.5);
        vec3 activeTint = mix(u_tint, shiftColor, 0.45);

        // Deep obsidian black interior like the reference image
        vec3 col = vec3(0.015, 0.018, 0.03);

        // Crescent liquid refraction along the bottom-right & outer rim
        float crescent = smoothstep(0.15, 0.95, dot(p, normalize(vec2(0.55, -0.65))) + n1 * 0.28);
        float rim = pow(r, 2.6);

        col += activeTint * crescent * (0.45 + 0.55 * rim);
        col += vec3(0.92, 0.96, 1.0) * pow(max(0.0, crescent * r), 4.0) * 0.85;
        col += activeTint * pow(r, 5.0) * (0.7 + 0.3 * n2);

        float edgeAlpha = smoothstep(1.0, 0.92, r);
        gl_FragColor = vec4(col, edgeAlpha);
      }
    `;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vs);
    gl.attachShader(shaderProgram, fs);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(shaderProgram, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(shaderProgram, 'u_time');
    const uTint = gl.getUniformLocation(shaderProgram, 'u_tint');

    function renderLoop(now) {
      if (isOpen && gl && shaderProgram) {
        const st = window.LiquidGLEngine?.getState?.() || { tintMode: 'bw', tintColor: '#38bdf8' };
        const baseHex = st.tintMode === 'bw' ? '#38bdf8' : st.tintColor || '#38bdf8';
        const [tr, tg, tb] = hexToRgbNormalized(baseHex);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(shaderProgram);
        gl.uniform1f(uTime, (now - startTime) * 0.001);
        gl.uniform3f(uTint, tr, tg, tb);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      requestAnimationFrame(renderLoop);
    }

    requestAnimationFrame(renderLoop);
  }

  function toggleDroplet(forceState) {
    const winEl = document.getElementById('droplet-orb-window');
    if (!winEl) return;
    isOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
    winEl.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      document.getElementById('droplet-prompt-input')?.focus();
    }
  }

  function toggleDrawer(forceTab) {
    const panel = document.getElementById('droplet-drawer-panel');
    if (!panel) return;
    if (forceTab) {
      activeDrawerTab = forceTab;
      isDrawerOpen = true;
    } else {
      isDrawerOpen = !isDrawerOpen;
    }
    panel.classList.toggle('hidden', !isDrawerOpen);
    if (isDrawerOpen) {
      renderDrawerContent();
    }
  }

  function initEvents() {
    const winEl = document.getElementById('droplet-orb-window');
    if (!winEl) return;

    // Listen for Alt key or Alt+Space to summon/toggle Droplet
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        altPressedAlone = false;
        toggleDroplet();
        return;
      }
      if (e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        altPressedAlone = true;
      } else {
        altPressedAlone = false;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && altPressedAlone) {
        e.preventDefault();
        altPressedAlone = false;
        toggleDroplet();
      }
    });

    document.getElementById('droplet-input-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('droplet-prompt-input');
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      handlePromptSubmit(val);
    });

    document.getElementById('droplet-tts-mute-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ttsConfig.muted = !ttsConfig.muted;
      saveStateSlice(TTS_LS_KEY, ttsConfig);
      updateTtsMuteButtonUI();
      window.GoldenGateOS.showToast(ttsConfig.muted ? 'Droplet voice muted' : 'Droplet voice active');
    });

    document.getElementById('droplet-wave-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer('chat');
    });

    document.getElementById('droplet-drawer-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer();
    });

    document.getElementById('droplet-orb-trigger')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const bubble = document.getElementById('droplet-reply-bubble');
      bubble?.classList.toggle('hidden');
    });

    // Quick Action Suggestion Chips
    document.querySelectorAll('.droplet-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = chip.dataset.chip;
        if (action === 'summarize') {
          handlePromptSubmit('summarize active screen context');
        } else if (action === 'code') {
          handlePromptSubmit('write a clean javascript function example');
        } else if (action === 'dj') {
          handlePromptSubmit('play music based on my taste profile');
        } else if (action === 'theme') {
          handlePromptSubmit('switch desktop tint theme');
        } else if (action === 'note') {
          handlePromptSubmit('open notes and add a quick thought');
        }
      });
    });

    // Voice Speech-To-Text Microphone
    const micBtn = document.getElementById('droplet-mic-btn');
    if (micBtn) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        micBtn.title = 'Speech Recognition not supported in this browser';
        micBtn.style.opacity = '0.4';
      } else {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = true;
        let isListening = false;
        rec.onstart = () => {
          isListening = true;
          micBtn.classList.add('recording');
          window.GoldenGateOS?.showToast?.('Listening...');
        };
        rec.onresult = (evt) => {
          const transcript = Array.from(evt.results).map((r) => r[0].transcript).join('');
          const inEl = document.getElementById('droplet-prompt-input');
          if (inEl) inEl.value = transcript;
        };
        rec.onend = () => {
          isListening = false;
          micBtn.classList.remove('recording');
          const inEl = document.getElementById('droplet-prompt-input');
          if (inEl && inEl.value.trim()) {
            const query = inEl.value.trim();
            inEl.value = '';
            handlePromptSubmit(query);
          }
        };
        rec.onerror = () => {
          isListening = false;
          micBtn.classList.remove('recording');
        };
        micBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isListening) rec.stop();
          else rec.start();
        });
      }
    }

    document.querySelectorAll('.droplet-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeDrawerTab = btn.dataset.dtab;
        renderDrawerContent();
      });
    });

    // Cross-tab BroadcastChannel sync listener
    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'SYNC_TURNS' && Array.isArray(payload)) {
          conversationTurns = payload;
          const last = conversationTurns[conversationTurns.length - 1];
          if (last && last.role === 'assistant') setReply(last.text, false);
        } else if (type === 'SYNC_MEMORIES' && Array.isArray(payload)) {
          personalMemories = payload;
        } else if (type === 'SYNC_PERMS' && payload) {
          permissions = payload;
        } else if (type === 'SYNC_AUDIT' && Array.isArray(payload)) {
          auditLog = payload;
        }
        if (isDrawerOpen) renderDrawerContent();
      };
    }

    winEl.addEventListener('click', (e) => e.stopPropagation());
  }

  function init() {
    loadAllState();
    openDatabase();
    initWebGLOrb();
    initEvents();
    initRulesAndProactivity();
    updateTtsMuteButtonUI();
  }

  return {
    init,
    toggleDroplet,
    handlePromptSubmit,
    triggerScheduledDigest
  };
})();

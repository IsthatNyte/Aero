// js/auth.js - Aero Cloud Sync & Supabase Authentication
(function() {
  const SUPABASE_URL = 'https://uymucsjjousqbfegujyr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_TW_KglLKr3l2Re8b4gqZrg_W6Bvwc3e';

  const DEFAULT_PROFILE = {
    displayName: 'nyte',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aero',
    bannerBg: 'linear-gradient(180deg, #ffd1dc 0%, #fff0f5 45%, #fffdfd 100%)',
    bio: 'yoo\ni play cs2 roblox and some other games'
  };

  let client = null;
  let currentUser = null;
  let currentUsername = localStorage.getItem('webos_account_username') || '';
  let lastSyncTime = null;
  let isSyncing = false;
  let syncTimeout = null;

  function getProfile() {
    try {
      const raw = localStorage.getItem('webos_profile_v2');
      if (raw) return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_PROFILE };
  }

  function setProfile(updates) {
    const current = getProfile();
    const updated = { ...current, ...updates };
    localStorage.setItem('webos_profile_v2', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('aero:profile-changed', { detail: updated }));
    scheduleAutoSync();
    return updated;
  }

  function init() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });

        // Listen for auth state changes
        client.auth.onAuthStateChange((event, session) => {
          currentUser = session ? session.user : null;
          if (currentUser) {
            localStorage.setItem('webos_auth_cached_user', JSON.stringify(currentUser));
          } else {
            localStorage.removeItem('webos_auth_cached_user');
          }
          if (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) {
            currentUsername = currentUser.user_metadata.username;
            localStorage.setItem('webos_account_username', currentUsername);
          }
          window.dispatchEvent(new CustomEvent('aero:auth-change', { detail: { event, user: currentUser, username: currentUsername } }));
          if (currentUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
            loadFromCloud();
          }
        });

        // Check active session immediately
        client.auth.getSession().then(({ data }) => {
          if (data && data.session) {
            currentUser = data.session.user;
            if (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) {
              currentUsername = currentUser.user_metadata.username;
              localStorage.setItem('webos_account_username', currentUsername);
            }
            window.dispatchEvent(new CustomEvent('aero:auth-change', { detail: { event: 'INITIAL_SESSION', user: currentUser, username: currentUsername } }));
            loadFromCloud();
          }
        });
      } catch (err) {
        console.error('Supabase init failed:', err);
      }
    }

    // Listen to local OS changes and debounced auto-sync
    window.addEventListener('liquidgl:changed', () => scheduleAutoSync());
    window.addEventListener('music:library-changed', () => scheduleAutoSync());
    window.addEventListener('notes:updated', () => scheduleAutoSync());
    window.addEventListener('desktop:changed', () => scheduleAutoSync());
    window.addEventListener('code:changed', () => scheduleAutoSync());
    window.addEventListener('storage', () => scheduleAutoSync());
  }

  function getClient() {
    return client;
  }

  function getUser() {
    if (currentUser) return currentUser;
    try {
      const cached = localStorage.getItem('webos_auth_cached_user');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }

  function getUsername() {
    return currentUsername || (currentUser && currentUser.user_metadata ? currentUser.user_metadata.username : '') || '';
  }

  function setUsername(newUsername) {
    currentUsername = (newUsername || '').trim();
    localStorage.setItem('webos_account_username', currentUsername);
    scheduleAutoSync();
  }

  function getLastSyncTime() {
    return lastSyncTime;
  }

  async function checkUsernameAvailable(rawUsername) {
    if (!client) return { available: false, error: 'Auth client not ready' };
    const username = (rawUsername || '').trim();
    if (username.length < 3) {
      return { available: false, error: 'Username must be at least 3 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { available: false, error: 'Only letters, numbers, and underscores allowed' };
    }
    const current = getUsername();
    if (current && current.toLowerCase() === username.toLowerCase()) {
      return { available: true };
    }
    const tables = ['profiles', 'user_profiles', 'User Profiles'];
    for (const tbl of tables) {
      try {
        const { data, error } = await client
          .from(tbl)
          .select('id')
          .ilike('username', username)
          .limit(1);
        if (!error) {
          if (data && data.length > 0) {
            if (currentUser && data[0].id === currentUser.id) return { available: true };
            return { available: false, error: 'Username already taken' };
          }
          return { available: true };
        }
      } catch (e) {}
    }
    return { available: true };
  }

  async function signUp(email, password, rawUsername = '') {
    if (!client) throw new Error('Auth client not initialized');
    const username = (rawUsername || '').trim();
    if (username) {
      const check = await checkUsernameAvailable(username);
      if (!check.available) {
        throw new Error(check.error || 'Username already taken');
      }
    }
    const res = await client.auth.signUp({
      email,
      password,
      options: {
        data: { username: username }
      }
    });
    if (res.error) throw res.error;
    currentUser = res.data.user;
    if (username) {
      currentUsername = username;
      localStorage.setItem('webos_account_username', username);
      setProfile({ displayName: username });
    }
    if (currentUser) {
      await saveToCloud();
    }
    return res.data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Auth client not initialized');
    const res = await client.auth.signInWithPassword({ email, password });
    if (res.error) throw res.error;
    currentUser = res.data.user;
    if (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) {
      currentUsername = currentUser.user_metadata.username;
      localStorage.setItem('webos_account_username', currentUsername);
    }
    if (currentUser) {
      await loadFromCloud();
    }
    return res.data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    currentUsername = '';
    localStorage.removeItem('webos_account_username');
    localStorage.removeItem('webos_auth_cached_user');
    lastSyncTime = null;
    window.dispatchEvent(new CustomEvent('aero:auth-change', { detail: { event: 'SIGNED_OUT', user: null, username: '' } }));
  }

  function scheduleAutoSync() {
    if (!currentUser || isSyncing) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      saveToCloud(true);
    }, 2000);
  }

  // Helper to attempt upserting across possible table name variations
  async function upsertProfile(payload) {
    if (!client) return { error: new Error('No client') };
    const tables = ['profiles', 'user_profiles', 'User Profiles'];
    for (const tbl of tables) {
      try {
        const { data, error } = await client.from(tbl).upsert(payload, { onConflict: 'id' });
        if (!error) return { data, error: null, table: tbl };
      } catch (e) {}
    }
    return { error: new Error('Could not write to profiles table') };
  }

  async function fetchProfile(userId) {
    if (!client) return null;
    const tables = ['profiles', 'user_profiles', 'User Profiles'];
    for (const tbl of tables) {
      try {
        const { data, error } = await client.from(tbl).select('*').eq('id', userId).maybeSingle();
        if (!error && data) return data;
      } catch (e) {}
    }
    return null;
  }

  async function saveToCloud(isBackground = false) {
    if (!client || !currentUser) return;
    isSyncing = true;
    try {
      const lglRaw = localStorage.getItem('webos_lgl_state_v2');
      let lgl = {};
      try { lgl = JSON.parse(lglRaw || '{}'); } catch (e) {}

      const playlistsRaw = localStorage.getItem('webos_limusic_user_playlists_v2');
      let playlists = [];
      try { playlists = JSON.parse(playlistsRaw || '[]'); } catch (e) {}

      const likedRaw = localStorage.getItem('webos_limusic_liked_v2');
      let liked = [];
      try { liked = JSON.parse(likedRaw || '[]'); } catch (e) {}

      const recentRaw = localStorage.getItem('webos_limusic_recent_v2');
      let recent = [];
      try { recent = JSON.parse(recentRaw || '[]'); } catch (e) {}

      const musicSettingsRaw = localStorage.getItem('webos_limusic_settings_v1');
      let musicSettings = {};
      try { musicSettings = JSON.parse(musicSettingsRaw || '{}'); } catch (e) {}

      const desktopItems = JSON.parse(localStorage.getItem('webos_desktop_items_v5') || localStorage.getItem('webos_desktop_items_v2') || '[]');
      const notesList = JSON.parse(localStorage.getItem('webos_notes_list_v2') || '[]');
      const codeContent = localStorage.getItem('webos_code_editor_v1') || '';
      const invisiproxyUrl = localStorage.getItem('aero_invisiproxy_url') || '';
      const pinnedTaskbar = JSON.parse(localStorage.getItem('webos_pinned_taskbar_apps_v1') || '[]');

      const dropletMemories = localStorage.getItem('webos_droplet_memories') || '[]';
      let memories = [];
      try { memories = JSON.parse(dropletMemories); } catch (e) {}

      const profile = getProfile();
      const activeUsername = currentUsername || (currentUser.user_metadata ? currentUser.user_metadata.username : '') || '';

      const payload = {
        id: currentUser.id,
        username: activeUsername,
        settings: {
          profile: profile,
          lgl: lgl,
          desktop: desktopItems,
          notes: notesList,
          code: codeContent,
          invisiproxy_url: invisiproxyUrl,
          pinned_taskbar: pinnedTaskbar,
          music_settings: musicSettings
        },
        playlists: playlists,
        liked_songs: liked,
        listening_history: recent,
        wallpaper: lgl.wallpaperUrl || lgl.activePreset || 'fluid',
        app_tint: lgl.tint || 'tint-bw',
        droplet_info: { memories: memories }
      };

      // 1. Save directly to Supabase Auth user_metadata (guaranteed to persist even if public DB tables are absent)
      try {
        if (client.auth && typeof client.auth.updateUser === 'function') {
          const { data: authUpdateData } = await client.auth.updateUser({
            data: {
              aero_cloud_sync: payload,
              username: activeUsername,
              displayName: profile.displayName || activeUsername
            }
          });
          if (authUpdateData && authUpdateData.user) {
            currentUser = authUpdateData.user;
            localStorage.setItem('webos_auth_cached_user', JSON.stringify(currentUser));
          }
        }
      } catch (authErr) {
        console.warn('Supabase auth metadata update error:', authErr);
      }

      // 2. Also try database table upsert
      await upsertProfile(payload);

      lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent('aero:sync-complete', { detail: { time: lastSyncTime } }));
      if (!isBackground && window.GoldenGateOS && window.GoldenGateOS.showNotification) {
        window.GoldenGateOS.showNotification('Cloud Synced');
      }
    } catch (err) {
      console.warn('Sync to cloud error:', err);
    } finally {
      isSyncing = false;
    }
  }

  async function loadFromCloud() {
    if (!client || !currentUser) return;
    isSyncing = true;
    try {
      let metaPayload = null;
      try {
        const { data: authData } = await client.auth.getUser();
        if (authData && authData.user) {
          currentUser = authData.user;
          localStorage.setItem('webos_auth_cached_user', JSON.stringify(currentUser));
          if (currentUser.user_metadata && currentUser.user_metadata.aero_cloud_sync) {
            metaPayload = currentUser.user_metadata.aero_cloud_sync;
          }
        }
      } catch (e) {}

      if (!metaPayload && currentUser.user_metadata && currentUser.user_metadata.aero_cloud_sync) {
        metaPayload = currentUser.user_metadata.aero_cloud_sync;
      }

      const row = await fetchProfile(currentUser.id);
      const data = metaPayload || row;

      if (!data) {
        await saveToCloud(true);
        return;
      }

      // Restore Username
      if (data.username) {
        currentUsername = data.username;
        localStorage.setItem('webos_account_username', currentUsername);
      }

      // Restore Profile Customization
      if (data.settings && data.settings.profile) {
        setProfile(data.settings.profile);
      } else if (data.profile) {
        setProfile(data.profile);
      }

      // Restore Playlists
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        localStorage.setItem('webos_limusic_user_playlists_v2', JSON.stringify(data.playlists));
      }
      // Restore Liked Songs
      if (Array.isArray(data.liked_songs) && data.liked_songs.length > 0) {
        localStorage.setItem('webos_limusic_liked_v2', JSON.stringify(data.liked_songs));
      }
      // Restore Listening History
      if (Array.isArray(data.listening_history) && data.listening_history.length > 0) {
        localStorage.setItem('webos_limusic_recent_v2', JSON.stringify(data.listening_history));
      }
      // Restore Music Settings
      if (data.settings && data.settings.music_settings) {
        localStorage.setItem('webos_limusic_settings_v1', JSON.stringify(data.settings.music_settings));
      }

      // Restore Desktop
      const desktopItems = (data.settings && data.settings.desktop) || data.desktop;
      if (Array.isArray(desktopItems) && desktopItems.length > 0) {
        localStorage.setItem('webos_desktop_items_v5', JSON.stringify(desktopItems));
        localStorage.setItem('webos_desktop_items_v2', JSON.stringify(desktopItems));
        window.dispatchEvent(new CustomEvent('desktop:reload'));
      }

      // Restore Notes
      if (data.settings && Array.isArray(data.settings.notes) && data.settings.notes.length > 0) {
        localStorage.setItem('webos_notes_list_v2', JSON.stringify(data.settings.notes));
        window.dispatchEvent(new CustomEvent('notes:updated'));
      }

      // Restore Code Scratchpad
      if (data.settings && data.settings.code) {
        localStorage.setItem('webos_code_editor_v1', data.settings.code);
      }

      // Restore InvisiProxy URL
      if (data.settings && data.settings.invisiproxy_url) {
        localStorage.setItem('aero_invisiproxy_url', data.settings.invisiproxy_url);
      }

      // Restore LiquidGL Settings
      if (data.settings && data.settings.lgl && Object.keys(data.settings.lgl).length > 0) {
        localStorage.setItem('webos_lgl_state_v2', JSON.stringify(data.settings.lgl));
        if (window.LiquidGL && window.LiquidGL.applyPreset && data.settings.lgl.activePreset) {
          window.LiquidGL.applyPreset(data.settings.lgl.activePreset);
        }
      }

      // Reload Music in memory
      if (window.GoldenGateMusic && typeof window.GoldenGateMusic.reloadLibrary === 'function') {
        window.GoldenGateMusic.reloadLibrary();
      }

      lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent('aero:sync-complete', { detail: { time: lastSyncTime } }));
      if (window.GoldenGateOS && window.GoldenGateOS.showNotification) {
        const displayName = currentUsername ? `@${currentUsername}` : currentUser.email;
        window.GoldenGateOS.showNotification(`Account Synced: ${displayName}`);
      }
    } catch (err) {
      console.warn('Load from cloud error:', err);
    } finally {
      isSyncing = false;
    }
  }

  window.AeroAuth = {
    init,
    getClient,
    getUser,
    getUsername,
    setUsername,
    getProfile,
    setProfile,
    checkUsernameAvailable,
    signUp,
    signIn,
    signOut,
    saveToCloud,
    loadFromCloud,
    getLastSyncTime
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

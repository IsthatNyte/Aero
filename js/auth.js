// js/auth.js - Aero Cloud Sync & Supabase Authentication
(function() {
  const SUPABASE_URL = 'https://uymucsjjousqbfegujyr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_TW_KglLKr3l2Re8b4gqZrg_W6Bvwc3e';

  let client = null;
  let currentUser = null;
  let currentUsername = localStorage.getItem('webos_account_username') || '';
  let lastSyncTime = null;
  let isSyncing = false;
  let syncTimeout = null;

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
    window.addEventListener('storage', () => scheduleAutoSync());
  }

  function getClient() {
    return client;
  }

  function getUser() {
    return currentUser;
  }

  function getUsername() {
    return currentUsername || (currentUser && currentUser.user_metadata ? currentUser.user_metadata.username : '') || '';
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
    lastSyncTime = null;
    window.dispatchEvent(new CustomEvent('aero:auth-change', { detail: { event: 'SIGNED_OUT', user: null, username: '' } }));
  }

  function scheduleAutoSync() {
    if (!currentUser || isSyncing) return;
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      saveToCloud(true);
    }, 4000);
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

      const dropletMemories = localStorage.getItem('webos_droplet_memories') || '[]';
      let memories = [];
      try { memories = JSON.parse(dropletMemories); } catch (e) {}

      const activeUsername = currentUsername || (currentUser.user_metadata ? currentUser.user_metadata.username : '') || '';

      const payload = {
        id: currentUser.id,
        username: activeUsername,
        settings: {
          lgl: lgl,
          desktop: JSON.parse(localStorage.getItem('webos_desktop_items_v2') || '[]'),
          notes: JSON.parse(localStorage.getItem('webos_notes_list_v2') || '[]')
        },
        playlists: playlists,
        liked_songs: liked,
        listening_history: recent,
        wallpaper: lgl.wallpaperUrl || lgl.activePreset || 'fluid',
        app_tint: lgl.tint || 'tint-bw',
        droplet_info: { memories: memories }
      };

      await upsertProfile(payload);
      lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent('aero:sync-complete', { detail: { time: lastSyncTime } }));
      if (!isBackground && window.OS && window.OS.showNotification) {
        window.OS.showNotification('Cloud Synced', 'Your playlists, settings, and music tastes were saved.');
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
      const row = await fetchProfile(currentUser.id);
      if (!row) {
        // No row yet on cloud, upload local state
        await saveToCloud(true);
        return;
      }

      // Restore Username
      if (row.username) {
        currentUsername = row.username;
        localStorage.setItem('webos_account_username', currentUsername);
      }

      // Restore Playlists
      if (Array.isArray(row.playlists) && row.playlists.length > 0) {
        localStorage.setItem('webos_limusic_user_playlists_v2', JSON.stringify(row.playlists));
      }
      // Restore Liked Songs
      if (Array.isArray(row.liked_songs) && row.liked_songs.length > 0) {
        localStorage.setItem('webos_limusic_liked_v2', JSON.stringify(row.liked_songs));
      }
      // Restore Listening History
      if (Array.isArray(row.listening_history) && row.listening_history.length > 0) {
        localStorage.setItem('webos_limusic_recent_v2', JSON.stringify(row.listening_history));
      }
      // Restore LiquidGL Settings
      if (row.settings && row.settings.lgl && Object.keys(row.settings.lgl).length > 0) {
        localStorage.setItem('webos_lgl_state_v2', JSON.stringify(row.settings.lgl));
        if (window.LiquidGL && window.LiquidGL.applyPreset) {
          if (row.settings.lgl.activePreset) window.LiquidGL.applyPreset(row.settings.lgl.activePreset);
        }
      }
      // Restore Notes
      if (row.settings && Array.isArray(row.settings.notes) && row.settings.notes.length > 0) {
        localStorage.setItem('webos_notes_list_v2', JSON.stringify(row.settings.notes));
      }

      lastSyncTime = new Date();
      window.dispatchEvent(new CustomEvent('aero:sync-complete', { detail: { time: lastSyncTime } }));
      if (window.OS && window.OS.showNotification) {
        const displayName = currentUsername ? `@${currentUsername}` : currentUser.email;
        window.OS.showNotification('Account Synced', `Loaded profile for ${displayName}`);
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

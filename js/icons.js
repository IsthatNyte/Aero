window.GoldenGateIcons = (function () {
  const logoCache = new Map();

  function getStartIcon() {
    return `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#38bdf8" stroke-width="2" fill="rgba(56, 189, 248, 0.14)"/>
        <path d="M9.8 8.3C9.8 7.5 10.7 7.05 11.38 7.48L16.4 10.68C17.02 11.07 17.02 11.93 16.4 12.32L11.38 15.52C10.7 15.95 9.8 15.5 9.8 14.7V8.3Z" fill="#38bdf8"/>
      </svg>
    `;
  }

  function getIconSVG(type, size = 26) {
    switch (type) {
      case 'aero':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5"/>
            <path d="M9.8 8.4C9.8 7.65 10.65 7.2 11.3 7.62L16.1 10.68C16.7 11.06 16.7 11.94 16.1 12.32L11.3 15.38C10.65 15.8 9.8 15.35 9.8 14.6V8.4Z" fill="currentColor" stroke="none"/>
          </svg>
        `;

      case 'account':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        `;

      case 'music':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        `;

      case 'games':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="6"/>
            <line x1="6" y1="12" x2="10" y2="12"/>
            <line x1="8" y1="10" x2="8" y2="14"/>
            <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>
            <circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none"/>
          </svg>
        `;

      case 'files':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.8l2.2 2.5h7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11z"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        `;

      case 'notes':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="3" width="14" height="18" rx="3"/>
            <line x1="8.5" y1="8" x2="15.5" y2="8"/>
            <line x1="8.5" y1="12" x2="15.5" y2="12"/>
            <line x1="8.5" y1="16" x2="12.5" y2="16"/>
          </svg>
        `;

      case 'terminal':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3"/>
            <polyline points="7.5 9.5 10.5 12 7.5 14.5"/>
            <line x1="12.5" y1="14.5" x2="16.5" y2="14.5"/>
          </svg>
        `;

      case 'wallpaper':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3"/>
            <circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none"/>
            <path d="M21 15l-4.5-4.5L7 20"/>
          </svg>
        `;

      case 'glass':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="5"/>
            <circle cx="12" cy="12" r="3.5"/>
          </svg>
        `;

      case 'calc':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="3"/>
            <line x1="8" y1="7.5" x2="16" y2="7.5"/>
            <circle cx="8.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12.5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="15.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="8.5" cy="16.5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none"/>
            <circle cx="15.5" cy="16.5" r="1" fill="currentColor" stroke="none"/>
          </svg>
        `;

      case 'code':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
            <line x1="14" y1="4" x2="10" y2="20"/>
          </svg>
        `;

      case 'monitor':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3"/>
            <polyline points="6 13 9.5 13 11.5 8.5 13.5 15.5 15.5 12 18 12"/>
          </svg>
        `;

      case 'photos':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="8.5" r="3"/>
            <circle cx="12" cy="15.5" r="3"/>
            <circle cx="8.5" cy="12" r="3"/>
            <circle cx="15.5" cy="12" r="3"/>
          </svg>
        `;

      case 'droplet':
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
        `;

      case 'shortcut':
      default:
        return `
          <svg class="simple-icon-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8.5"/>
            <line x1="3.6" y1="12" x2="20.4" y2="12"/>
            <path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17z"/>
          </svg>
        `;
    }
  }

  // Pure SVG vector icons for UI controls and weather conditions (replaces all emojis)
  function getUiIcon(name, size = 14) {
    switch (name) {
      case 'play':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
      case 'pause':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
      case 'prev':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"/></svg>`;
      case 'next':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"/></svg>`;
      case 'loop':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
      case 'heart':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.3l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
      case 'heartFilled':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.3l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
      case 'plus':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      case 'close':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      case 'refresh':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
      case 'home':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z"/></svg>`;
      case 'search':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.2" y2="16.2"/></svg>`;
      case 'settings':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      case 'import':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      case 'shield':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      case 'puzzle':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.4 12a2.4 2.4 0 0 1 0 4.8H18v3.2a1 1 0 0 1-1 1h-3.2v-1.4a2.4 2.4 0 0 0-4.8 0V21H5.8a1 1 0 0 1-1-1v-3.2H3.4a2.4 2.4 0 0 1 0-4.8h1.4V8.8a1 1 0 0 1 1-1H9V6.4a2.4 2.4 0 0 1 4.8 0v1.4H17a1 1 0 0 1 1 1V12h1.4z"/></svg>`;
      case 'pin':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`;
      case 'back':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
      case 'note':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      case 'sun':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>`;
      case 'cloud':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
      case 'rain':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 13v8"/><path d="M8 13v8"/><path d="M12 15v8"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`;
      case 'snow':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/><line x1="19.1" y1="4.9" x2="4.9" y2="19.1"/></svg>`;
      case 'storm':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      case 'bell':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
      case 'volume':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
      case 'crop':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
      case 'zoomIn':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
      case 'zoomOut':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
      case 'rotate':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
      case 'lyrics':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      case 'mic':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`;
      case 'waveform':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>`;
      case 'mute':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
      case 'check':
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      default:
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>`;
    }
  }

  function getDomain(rawUrl) {
    try {
      if (!rawUrl || rawUrl.startsWith('aero://')) {
        return '';
      }
      const u = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
      return u.hostname;
    } catch (e) {
      return '';
    }
  }

  function removeEdgeBackgroundFromImage(img) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;

    const edgeSamples = [];
    function samplePixel(x, y) {
      const idx = (y * size + x) * 4;
      if (d[idx + 3] > 20) {
        edgeSamples.push([d[idx], d[idx + 1], d[idx + 2]]);
      }
    }

    for (let i = 0; i < size; i++) {
      samplePixel(i, 0);
      samplePixel(i, size - 1);
      samplePixel(0, i);
      samplePixel(size - 1, i);
    }

    for (let i = 2; i < size - 2; i += 2) {
      samplePixel(i, 2);
      samplePixel(i, size - 3);
      samplePixel(2, i);
      samplePixel(size - 3, i);
    }

    if (edgeSamples.length === 0) {
      return canvas.toDataURL('image/png');
    }

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    edgeSamples.forEach(([r, g, b]) => {
      sumR += r;
      sumG += g;
      sumB += b;
    });
    const bgR = sumR / edgeSamples.length;
    const bgG = sumG / edgeSamples.length;
    const bgB = sumB / edgeSamples.length;

    function colorDist(r, g, b) {
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    const visited = new Uint8Array(size * size);
    const queue = [];
    const threshold = 48;
    const softThreshold = 68;

    function pushIfEdgeMatch(x, y) {
      if (x < 0 || x >= size || y < 0 || y >= size) return;
      const pIdx = y * size + x;
      if (visited[pIdx]) return;
      const cIdx = pIdx * 4;
      const dist = colorDist(d[cIdx], d[cIdx + 1], d[cIdx + 2]);
      if (d[cIdx + 3] <= 20 || dist < softThreshold) {
        visited[pIdx] = 1;
        queue.push([x, y]);
      }
    }

    for (let i = 0; i < size; i++) {
      pushIfEdgeMatch(i, 0);
      pushIfEdgeMatch(i, size - 1);
      pushIfEdgeMatch(0, i);
      pushIfEdgeMatch(size - 1, i);
    }

    while (queue.length > 0) {
      const [cx, cy] = queue.pop();
      const cIdx = (cy * size + cx) * 4;
      const dist = colorDist(d[cIdx], d[cIdx + 1], d[cIdx + 2]);

      if (dist < threshold) {
        d[cIdx + 3] = 0;
      } else if (dist < softThreshold) {
        const factor = (dist - threshold) / (softThreshold - threshold);
        d[cIdx + 3] = Math.round(d[cIdx + 3] * factor);
      }

      pushIfEdgeMatch(cx + 1, cy);
      pushIfEdgeMatch(cx - 1, cy);
      pushIfEdgeMatch(cx, cy + 1);
      pushIfEdgeMatch(cx, cy - 1);
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function extractWebsiteLogo(url, onReady) {
    const domain = getDomain(url);
    if (!domain) return;

    if (logoCache.has(domain)) {
      onReady(logoCache.get(domain));
      return;
    }

    const candidates = [
      `/proxy?url=${encodeURIComponent(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)}`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`
    ];

    let idx = 0;
    function tryNext() {
      if (idx >= candidates.length) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const processedDataUrl = removeEdgeBackgroundFromImage(img);
          logoCache.set(domain, processedDataUrl);
          onReady(processedDataUrl);
        } catch (e) {}
      };
      img.onerror = () => {
        idx++;
        tryNext();
      };
      img.src = candidates[idx];
    }

    tryNext();
  }

  return {
    getStartIcon,
    getIconSVG,
    getUiIcon,
    extractWebsiteLogo
  };
})();

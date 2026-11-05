window.LiquidGLEngine = (function () {
  let canvas, gl, program;
  let startTime = performance.now();

  const state = {
    enabled: true,
    refraction: 32,
    frost: 14,
    tintMode: 'bw',
    tintColor: '#ffffff',
    tintName: 'B&W',
    wallpaperType: 'fluid',
    wallpaperUrl: ''
  };

  const vsSource = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Smooth sapphire, midnight, and warm cream fluid background matching Reference Image 2
  const fsSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_res;

    void main() {
      vec2 uv = v_uv;
      float t = u_time * 0.18;

      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / max(u_res.y, 1.0);

      for (float i = 1.0; i < 4.0; i++) {
        p.x += 0.35 / i * sin(i * 2.2 * p.y + t);
        p.y += 0.35 / i * cos(i * 1.8 * p.x + t * 0.8);
      }

      float wave = 0.5 + 0.5 * sin(p.x * 1.6 + p.y * 1.4);
      float glow = smoothstep(-0.8, 0.9, sin(p.x - p.y + t));

      vec3 deepBlack = vec3(0.02, 0.03, 0.07);
      vec3 cobaltBlue = vec3(0.02, 0.22, 0.78);
      vec3 iceBlue = vec3(0.58, 0.82, 0.96);
      vec3 warmSand = vec3(0.95, 0.86, 0.82);

      vec3 col = mix(deepBlack, cobaltBlue, wave);
      col = mix(col, iceBlue, glow * 0.65);
      col = mix(col, warmSand, smoothstep(0.65, 1.0, (1.0 - uv.y) * glow) * 0.75);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // Generate an optical squircle refraction normal map for SVG feDisplacementMap
  function buildLensDisplacementMap() {
    const size = 256;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x / (size - 1)) * 2 - 1;
        const ny = (y / (size - 1)) * 2 - 1;

        // Superellipse squircle distance (power 4)
        const dist = Math.pow(Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4), 0.25);
        // Stronger Snell curvature near the perimeter of the glass
        const edgeFactor = Math.pow(Math.min(dist, 1.0), 2.4);

        const dx = -nx * edgeFactor;
        const dy = -ny * edgeFactor;

        const r = Math.max(0, Math.min(255, Math.round((dx * 0.5 + 0.5) * 255)));
        const g = Math.max(0, Math.min(255, Math.round((dy * 0.5 + 0.5) * 255)));

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = off.toDataURL('image/png');
    const feImg = document.getElementById('liquidgl-normal-map');
    if (feImg) {
      feImg.setAttribute('href', dataUrl);
      feImg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
    }
  }

  function createShader(glCtx, type, src) {
    const s = glCtx.createShader(type);
    glCtx.shaderSource(s, src);
    glCtx.compileShader(s);
    if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
      glCtx.deleteShader(s);
      return null;
    }
    return s;
  }

  function initWebGL() {
    canvas = document.getElementById('wallpaper-canvas');
    if (!canvas) return;
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return;

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(render);
  }

  function resize() {
    if (!canvas || !gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now) {
    if (gl && program && state.wallpaperType === 'fluid') {
      gl.useProgram(program);
      gl.uniform1f(gl.getUniformLocation(program, 'u_time'), (now - startTime) * 0.001);
      gl.uniform2f(gl.getUniformLocation(program, 'u_res'), canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    requestAnimationFrame(render);
  }

  function hexToRgbString(hex) {
    const clean = (hex || '#ffffff').replace('#', '');
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return '255, 255, 255';
    return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
  }

  function applyState() {
    const root = document.documentElement;
    const body = document.body;

    body.classList.toggle('liquidgl-on', state.enabled);
    body.classList.toggle('tint-bw', state.tintMode === 'bw');
    body.classList.toggle('tint-colored', state.tintMode === 'tinted');

    root.style.setProperty('--tint-color', state.tintColor);
    root.style.setProperty('--tint-rgb', hexToRgbString(state.tintColor));
    root.style.setProperty('--lgl-frost', `${state.frost}px`);
    root.style.setProperty('--lgl-refraction', state.refraction);

    const disp = document.getElementById('liquidgl-disp');
    if (disp) {
      disp.setAttribute('scale', state.enabled ? state.refraction : 0);
    }

    // Wallpaper image vs fluid canvas
    const wpImg = document.getElementById('wallpaper-img');
    if (wpImg) {
      if (state.wallpaperType === 'image' && state.wallpaperUrl) {
        wpImg.src = state.wallpaperUrl;
        wpImg.classList.remove('hidden');
      } else {
        wpImg.classList.add('hidden');
      }
    }

    // Sync macOS right-click controls
    const tintNameEl = document.getElementById('ctx-tint-name');
    if (tintNameEl) tintNameEl.textContent = state.tintName;

    const lglCheck = document.getElementById('ctx-liquidgl-toggle');
    if (lglCheck) lglCheck.checked = state.enabled;

    const refRange = document.getElementById('ctx-lgl-refraction');
    if (refRange) refRange.value = state.refraction;

    const blurRange = document.getElementById('ctx-lgl-frost');
    if (blurRange) blurRange.value = state.frost;

    try {
      const toSave = { ...state };
      // Avoid saving giant base64 strings if over 2MB
      if (toSave.wallpaperUrl && toSave.wallpaperUrl.length > 1500000) {
        toSave.wallpaperUrl = '';
        toSave.wallpaperType = 'fluid';
      }
      localStorage.setItem('webos_lgl_state_v2', JSON.stringify(toSave));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('liquidgl:changed', { detail: { ...state } }));
  }

  function setCustomWallpaper(url) {
    if (!url) {
      state.wallpaperType = 'fluid';
      state.wallpaperUrl = '';
    } else {
      state.wallpaperType = 'image';
      state.wallpaperUrl = url;
    }
    applyState();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('webos_lgl_state_v2');
      if (raw) {
        Object.assign(state, JSON.parse(raw));
      }
    } catch (e) {}
  }

  function init() {
    loadState();
    buildLensDisplacementMap();
    initWebGL();
    applyState();
  }

  return {
    init,
    getState: () => state,
    setState: (patch) => {
      Object.assign(state, patch);
      applyState();
    },
    setCustomWallpaper
  };
})();

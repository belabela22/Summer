/* Summery Vibes — app.js */
(() => {
  'use strict';

  // Elements
  const dom = {
    body: document.body,
    hero: document.getElementById('hero'),
    enterBtn: document.getElementById('enterBtn'),
    app: document.getElementById('app'),
    gallery: document.getElementById('gallery'),
    search: document.getElementById('search'),
    modal: document.getElementById('albumModal'),
    modalCover: document.getElementById('modalCover'),
    modalTitle: document.getElementById('modalTitle'),
    modalDesc: document.getElementById('modalDesc'),
    trackList: document.getElementById('trackList'),
    playAlbumBtn: document.getElementById('playAlbumBtn'),
    player: document.getElementById('player'),
    playerCover: document.getElementById('playerCover'),
    playerTitle: document.getElementById('playerTitle'),
    playerSubtitle: document.getElementById('playerSubtitle'),
    btnShuffle: document.getElementById('btnShuffle'),
    btnPrev: document.getElementById('btnPrev'),
    btnPlay: document.getElementById('btnPlay'),
    btnNext: document.getElementById('btnNext'),
    btnRepeat: document.getElementById('btnRepeat'),
    seekBar: document.getElementById('seekBar'),
    volume: document.getElementById('volume'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    volIcon: document.getElementById('volIcon'),
    audio: document.getElementById('audio'),
    viz: document.getElementById('viz'),
    vizFallback: document.getElementById('vizFallback'),
  };

  // State
  const state = {
    albums: [],
    filteredAlbums: [],
    currentAlbum: null,
    currentIndex: -1,
    shuffle: false,
    repeat: 'off', // 'off' | 'all' | 'one'
    isPlaying: false,
  };

  // Audio / WebAudio
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let rafId = null;
  const bars = 32;

  function initVisualizer() {
    try {
      if (audioCtx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('No AudioContext');
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      if (sourceNode) sourceNode.disconnect();
      sourceNode = audioCtx.createMediaElementSource(dom.audio);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      dom.vizFallback.hidden = true;
    } catch {
      // Fallback to CSS animation
      dom.vizFallback.hidden = false;
      buildVizFallback();
    }
  }

  function buildVizFallback() {
    if (dom.vizFallback.childElementCount) return;
    const barsCount = 24;
    for (let i = 0; i < barsCount; i++) {
      const span = document.createElement('span');
      span.style.display = 'block';
      span.style.height = '100%';
      span.style.background = i % 3 === 0 ? 'var(--turquoise)' : (i % 3 === 1 ? 'var(--coral)' : 'var(--orange)');
      span.style.transformOrigin = 'bottom';
      span.style.animation = `fallbackBeat ${1.2 + (i % 5) * 0.1}s ease-in-out ${i * 0.03}s infinite`;
      dom.vizFallback.appendChild(span);
    }
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fallbackBeat {
        0%,100% { transform: scaleY(.3); opacity: .7 }
        50% { transform: scaleY(1); opacity: 1 }
      }
    `;
    document.head.appendChild(style);
  }

  function drawViz() {
    if (!analyser || !dom.viz) return;
    const ctx = dom.viz.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = dom.viz.clientWidth * dpr;
    const height = dom.viz.clientHeight * dpr;
    if (dom.viz.width !== width || dom.viz.height !== height) {
      dom.viz.width = width; dom.viz.height = height;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0,0,width,height);
    const step = Math.floor(data.length / bars);
    const barW = Math.max(2 * dpr, width / bars - 2 * dpr);
    for (let i=0;i<bars;i++){
      const v = data[i * step] / 255;
      const barH = Math.max(2 * dpr, v * height);
      const x = i * (width / bars);
      const grad = ctx.createLinearGradient(0,height-barH,0,height);
      grad.addColorStop(0,'#2ec4b6');
      grad.addColorStop(1,'#ffa500');
      ctx.fillStyle = grad;
      ctx.fillRect(x, height - barH, barW, barH);
      ctx.globalAlpha = 0.9;
    }
    rafId = requestAnimationFrame(drawViz);
  }

  function startViz() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!audioCtx) initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(drawViz);
  }
  function stopViz() {
    cancelAnimationFrame(rafId);
  }

  // Helpers
  const fmtTime = s => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2,'0');
    return `${m}:${sec}`;
  };

  function lazyImg(src, alt, width, height) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = alt || '';
    if (width) img.width = width;
    if (height) img.height = height;
    img.src = src;
    img.addEventListener('error', () => {
      img.src = placeholderCover();
    }, {once:true});
    return img;
  }

  function placeholderCover() {
    // inline SVG data URI placeholder
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>
        <defs>
          <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
            <stop stop-color='#ff6f61'/>
            <stop offset='1' stop-color='#2ec4b6'/>
          </linearGradient>
        </defs>
        <rect width='600' height='600' fill='url(#g)'/>
        <circle cx='300' cy='300' r='160' fill='rgba(255,255,255,.3)'/>
      </svg>`
    );
    return `data:image/svg+xml;charset=utf-8,${svg}`;
  }

  // Build gallery
  function renderGallery(list) {
    dom.gallery.innerHTML = '';
    dom.gallery.setAttribute('role','list');
    list.forEach(album => {
      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('role','listitem');

      const btn = document.createElement('button');
      btn.className = 'card-btn';
      btn.setAttribute('aria-label', `Open ${album.title} by ${album.artist} (${album.year})`);
      btn.addEventListener('click', () => openAlbum(album));

      const cover = lazyImg(album.cover, `${album.title} cover`);
      btn.appendChild(cover);

      const body = document.createElement('div');
      body.className = 'card-body';
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = album.title;
      const sub = document.createElement('p');
      sub.className = 'card-sub';
      sub.textContent = `${album.artist} • ${album.year}`;

      body.appendChild(title);
      body.appendChild(sub);

      card.appendChild(btn);
      card.appendChild(body);
      dom.gallery.appendChild(card);
    });
  }

  // Modal
  let modalLastFocus = null;
  function openAlbum(album) {
    state.currentAlbum = album;
    dom.modalCover.src = album.cover;
    dom.modalCover.alt = `${album.title} cover art`;
    dom.modalTitle.textContent = album.title;
    dom.modalDesc.textContent = `${album.artist} • ${album.year}`;
    dom.trackList.innerHTML = '';

    album.tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'track';
      li.tabIndex = 0;
      li.setAttribute('role','button');
      li.setAttribute('aria-label', `Play track ${i+1}: ${t.title}, duration ${t.duration}`);
      const left = document.createElement('div');
      left.className = 'track-left';
      const idx = document.createElement('span');
      idx.className = 'track-index';
      idx.textContent = i+1;
      const name = document.createElement('span');
      name.className = 'track-title';
      name.textContent = t.title;
      left.append(idx, name);
      const time = document.createElement('span');
      time.className = 'track-time';
      time.textContent = t.duration;
      li.append(left, time);

      li.addEventListener('click', () => playTrack(i));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTrack(i); }
      });

      dom.trackList.appendChild(li);
    });

    dom.playAlbumBtn.onclick = () => playTrack(0);
    modalLastFocus = document.activeElement;
    dom.modal.hidden = false;
    trapFocus(dom.modal);
  }

  function closeModal() {
    dom.modal.hidden = true;
    releaseFocus();
    if (modalLastFocus && modalLastFocus.focus) modalLastFocus.focus();
  }

  function trapFocus(container) {
    function onKey(e){
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const focusables = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
    }
    container.addEventListener('keydown', onKey);
    container._untrap = () => container.removeEventListener('keydown', onKey);
    const firstBtn = container.querySelector('button, [tabindex]');
    (firstBtn || container).focus();
    // backdrop click or close buttons
    container.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal, {once:false}));
  }
  function releaseFocus(){
    if (dom.modal._untrap) dom.modal._untrap();
  }

  // Player control
  function loadTrack(album, index) {
    state.currentAlbum = album;
    state.currentIndex = index;
    const track = album.tracks[index];

    dom.audio.src = track.audio;
    dom.audio.load();

    dom.playerCover.src = album.cover;
    dom.playerCover.alt = `${album.title} cover`;
    dom.playerTitle.textContent = track.title;
    dom.playerSubtitle.textContent = `${album.artist} — ${album.title}`;
    dom.totalTime.textContent = '0:00';
    dom.currentTime.textContent = '0:00';
    dom.seekBar.value = 0;
    dom.player.hidden = false;
  }

  async function playTrack(index) {
    if (!state.currentAlbum) return;
    loadTrack(state.currentAlbum, index);
    closeModal();
    await play();
  }

  async function play() {
    try {
      initVisualizer(); // safe to call repeatedly
      if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
      await dom.audio.play();
      state.isPlaying = true;
      dom.btnPlay.textContent = '⏸';
      dom.btnPlay.setAttribute('aria-label','Pause');
      dom.body.classList.add('playing');
      startViz();
    } catch {
      // playback might be blocked; UI remains consistent
    }
  }

  function pause() {
    dom.audio.pause();
    state.isPlaying = false;
    dom.btnPlay.textContent = '▶';
    dom.btnPlay.setAttribute('aria-label','Play');
    dom.body.classList.remove('playing');
    stopViz();
  }

  function togglePlay() {
    if (dom.audio.src) {
      if (dom.audio.paused) play(); else pause();
    } else if (state.currentAlbum) {
      playTrack(0);
    }
  }

  function nextTrack() {
    if (!state.currentAlbum) return;
    const tracks = state.currentAlbum.tracks;
    if (state.repeat === 'one') return play();
    if (state.shuffle) {
      let next;
      do { next = Math.floor(Math.random() * tracks.length); } while (tracks.length > 1 && next === state.currentIndex);
      playTrack(next);
    } else {
      let next = state.currentIndex + 1;
      if (next >= tracks.length) {
        if (state.repeat === 'all') next = 0; else return pause();
      }
      playTrack(next);
    }
  }

  function prevTrack() {
    if (!state.currentAlbum) return;
    if (dom.audio.currentTime > 3) { dom.audio.currentTime = 0; return; }
    const tracks = state.currentAlbum.tracks;
    let prev = state.currentIndex - 1;
    if (prev < 0) prev = state.repeat === 'all' ? tracks.length - 1 : 0;
    playTrack(prev);
  }

  function setShuffle(on) {
    state.shuffle = on;
    dom.btnShuffle.setAttribute('aria-pressed', String(on));
    dom.btnShuffle.title = on ? 'Shuffle on' : 'Shuffle off';
  }

  function cycleRepeat() {
    const modes = ['off','all','one'];
    const idx = modes.indexOf(state.repeat);
    state.repeat = modes[(idx + 1) % modes.length];
    dom.btnRepeat.dataset.mode = state.repeat;
    dom.btnRepeat.setAttribute('aria-label', `Repeat ${state.repeat}`);
    dom.btnRepeat.title = `Repeat ${state.repeat}`;
  }

  // Events
  dom.enterBtn.addEventListener('click', () => {
    dom.body.classList.add('entered');
    dom.app.hidden = false;
    dom.player.hidden = false; // show bar (idle)
    // Prime audio context on user gesture
    initVisualizer();
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (typing) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); dom.audio.currentTime = Math.min(dom.audio.duration || 0, dom.audio.currentTime + 5); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 5); }
    if (e.key === 'ArrowUp') { e.preventDefault(); dom.audio.volume = Math.min(1, dom.audio.volume + 0.05); dom.volume.value = dom.audio.volume; updateVolIcon(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); dom.audio.volume = Math.max(0, dom.audio.volume - 0.05); dom.volume.value = dom.audio.volume; updateVolIcon(); }
    if (e.key === 'Escape' && !dom.modal.hidden) { closeModal(); }
  });

  dom.btnPlay.addEventListener('click', togglePlay);
  dom.btnNext.addEventListener('click', nextTrack);
  dom.btnPrev.addEventListener('click', prevTrack);
  dom.btnShuffle.addEventListener('click', () => setShuffle(!state.shuffle));
  dom.btnRepeat.addEventListener('click', cycleRepeat);

  dom.seekBar.addEventListener('input', () => {
    const pct = dom.seekBar.value / 100;
    if (isFinite(dom.audio.duration)) dom.audio.currentTime = pct * dom.audio.duration;
  });

  dom.volume.addEventListener('input', () => {
    dom.audio.volume = parseFloat(dom.volume.value);
    updateVolIcon();
  });

  function updateVolIcon(){
    const v = dom.audio.volume;
    dom.volIcon.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
  }

  dom.audio.addEventListener('loadedmetadata', () => {
    dom.totalTime.textContent = fmtTime(dom.audio.duration);
  });
  dom.audio.addEventListener('timeupdate', () => {
    dom.currentTime.textContent = fmtTime(dom.audio.currentTime);
    if (isFinite(dom.audio.duration)) {
      dom.seekBar.value = (dom.audio.currentTime / dom.audio.duration) * 100;
    }
  });
  dom.audio.addEventListener('ended', () => {
    if (state.repeat === 'one') play();
    else nextTrack();
  });

  // Close modal handlers
  dom.modal.addEventListener('click', (e) => {
    if (e.target && e.target.hasAttribute('data-close-modal')) closeModal();
  });

  // Search
  dom.search.addEventListener('input', () => {
    const q = dom.search.value.trim().toLowerCase();
    state.filteredAlbums = state.albums.filter(a =>
      a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
    renderGallery(state.filteredAlbums);
  });

  // Data loading
  async function loadAlbums() {
    try {
      const res = await fetch('data/albums.json', {cache:'no-store'});
      const data = await res.json();
      state.albums = data.albums || [];
      state.filteredAlbums = [...state.albums];
      renderGallery(state.filteredAlbums);
      // Seed player UI with first album cover
      if (state.albums[0]) {
        dom.playerCover.src = state.albums[0].cover;
        dom.playerCover.alt = `${state.albums[0].title} cover`;
      }
    } catch {
      // fallback minimal data
      state.albums = [{
        id: 'fallback',
        title: 'Sun Demos',
        artist: 'Various',
        year: 2025,
        cover: placeholderCover(),
        tracks: [{title:'Warm Intro', duration:'0:02', audio:''}]
      }];
      state.filteredAlbums = state.albums;
      renderGallery(state.filteredAlbums);
    }
  }

  // Kick off
  loadAlbums();

})();

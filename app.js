// --- Utility & State ---
    const $ = (s, root=document) => root.querySelector(s);
    const $$ = (s, root=document) => [...root.querySelectorAll(s)];
    const state = { unit: 'C' }; // 'C' or 'F'

    function toF(c) { return (c * 9/5) + 32; }
    function fmtTemp(v) { return state.unit === 'C' ? `${Math.round(v)} °C` : `${Math.round(toF(v))} °F`; }
    function fmtPct(v) { return `${Math.round(v)}%`; }

    // Cache last loaded forecast for re-rendering with different windows
    state.lastData = null;

    function getWindowRange(data) {
      const h = data.hourly;
      const hours = parseInt(document.getElementById('windowHours').value || '12', 10);
      const useCustom = document.getElementById('customToggle').checked;
      const startInput = document.getElementById('startAt').value;

      let startISO;
      if (useCustom && startInput) {
        // datetime-local is local time; convert to ISO with timezone by constructing date
        const d = new Date(startInput);
        startISO = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).toISOString().slice(0,19);
      } else {
        // Use current_weather time if present (already aligned to forecast grid/timezone), else now
        startISO = (data.current_weather?.time || new Date().toISOString()).slice(0,19);
      }

      // Find the closest index >= startISO
      const idx = h.time.findIndex(t => t.slice(0,19) >= startISO);
      const start = idx >= 0 ? idx : 0;
      const end = Math.min(start + hours, h.time.length);
      return [start, end];
    }

    function renderHourlyWithWindow(data) {
      const body = document.getElementById('hourly-body');
      body.innerHTML = '';
      const h = data.hourly;
      if (!h) return;

      const [start, end] = getWindowRange(data);

      for (let i = start; i < end; i++) {
        const tr = document.createElement('tr');
        const t = new Date(h.time[i]);
        const tdTime = document.createElement('td');
        tdTime.textContent = t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const tdTemp = document.createElement('td');
        tdTemp.textContent = fmtTemp(h.temperature_2m[i]);
        const tdHum = document.createElement('td');
        tdHum.textContent = fmtPct(h.relative_humidity_2m?.[i] ?? 0);
        const tdPop = document.createElement('td');
        const p = h.precipitation_probability?.[i];
        tdPop.textContent = p == null ? '—' : fmtPct(p);
        tr.append(tdTime, tdTemp, tdHum, tdPop);
        body.appendChild(tr);
      }
    }


    function announce(msg) {
      const live = $('#live');
      live.textContent = msg;
    }

    function showError(msg) {
      const box = $('#error');
      box.style.display = 'block';
      box.textContent = msg || 'เกิดข้อผิดพลาดในการดึงข้อมูล';
    }

    function clearError() { const box = $('#error'); box.style.display='none'; }

    // --- Fetching ---
    async function geocode(name) {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', name);
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'th');
      url.searchParams.set('format', 'json');
      const res = await fetch(url);
      if (!res.ok) throw new Error('geocoding failed');
      const data = await res.json();
      if (!data.results || !data.results.length) throw new Error('ไม่พบพื้นที่ตามคำค้นหา');
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, name: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}` };
    }

    async function fetchForecast(lat, lon) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat);
      url.searchParams.set('longitude', lon);
      url.searchParams.set('current_weather', 'true');
      url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability');
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url);
      if (!res.ok) throw new Error('forecast failed');
      return res.json();
    }

    // --- Rendering ---
    function renderCurrent(data) {
      const cur = data.current_weather;
      const details = $('#details');
      details.innerHTML = '';
      if (!cur) { $('#current').textContent = '—'; return; }
      $('#current').textContent = `อุณหภูมิ ${fmtTemp(cur.temperature)} • ลม ${Math.round(cur.windspeed)} กม./ชม. • ทิศลม ${cur.winddirection}°`;

      const list = [
        ['อัปเดตล่าสุด', new Date(cur.time).toLocaleString('th-TH')],
        ['ค่าความกดอากาศ', data.hourly?.surface_pressure?.[0] ? `${Math.round(data.hourly.surface_pressure[0])} hPa` : '—'],
      ];
      for (const [k, v] of list) {
        const li = document.createElement('li'); li.textContent = `${k}: ${v}`; details.appendChild(li);
      }
    }

    function renderHourly(data) { // legacy fallback

      const body = $('#hourly-body');
      body.innerHTML = '';
      const h = data.hourly;
      if (!h) return;
      // Find the current hour index
      const nowISO = data.current_weather?.time || new Date().toISOString();
      const idx = h.time.findIndex(t => t === nowISO);
      const start = idx >= 0 ? idx : 0;
      const end = Math.min(start + 12, h.time.length);

      for (let i = start; i < end; i++) {
        const tr = document.createElement('tr');
        const t = new Date(h.time[i]);
        const tdTime = document.createElement('td');
        tdTime.textContent = t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const tdTemp = document.createElement('td');
        tdTemp.textContent = fmtTemp(h.temperature_2m[i]);
        const tdHum = document.createElement('td');
        tdHum.textContent = fmtPct(h.relative_humidity_2m?.[i] ?? 0);
        const tdPop = document.createElement('td');
        const p = h.precipitation_probability?.[i];
        tdPop.textContent = p == null ? '—' : fmtPct(p);
        tr.append(tdTime, tdTemp, tdHum, tdPop);
        body.appendChild(tr);
      }
    }

    function setPlaceLabel(name, lat, lon) {
      $('#place').textContent = `${name} (ละติจูด ${lat.toFixed(3)}, ลองจิจูด ${lon.toFixed(3)})`;
    }

    async function loadByCoords(lat, lon, name='ตำแหน่งที่เลือก') {
      clearError();
      announce('กำลังดึงข้อมูลพยากรณ์อากาศ…');
      try {
        const data = await fetchForecast(lat, lon);
        setPlaceLabel(name, lat, lon);
        renderCurrent(data);
        state.lastData = data; renderHourlyWithWindow(data);
        announce(`โหลดข้อมูลสำเร็จสำหรับ ${name}`);
      } catch (e) {
        console.error(e);
        showError('ไม่สามารถดึงข้อมูลได้ กรุณาลองใหม่');
        announce('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }
    }

    async function loadByQuery(q) {
      clearError();
      announce(`กำลังค้นหา “${q}” …`);
      try {
        const loc = await geocode(q);
        await loadByCoords(loc.lat, loc.lon, loc.name);
      } catch (e) {
        console.error(e);
        showError(e.message || 'ไม่พบพื้นที่หรือดึงข้อมูลไม่ได้');
        announce('ค้นหาล้มเหลว');
      }
    }

    // --- Wire up UI ---
    $('#btnC').addEventListener('click', () => {
      state.unit = 'C';
      $('#btnC').setAttribute('aria-pressed', 'true');
      $('#btnF').setAttribute('aria-pressed', 'false');
      // Re-render numbers if we already have data in the table by toggling unit
      const place = $('#place').textContent;
      if (place && place.includes('ละติจูด')) {
        // Re-run last query via updating table values from existing dataset would require cached data.
        // Simpler: trigger a discreet re-fetch using coordinates parsed from label.
        const m = /ละติจูด ([\d.-]+), ลองจิจูด ([\d.-]+)/.exec(place);
        if (m) loadByCoords(parseFloat(m[1]), parseFloat(m[2]), place.split(' (')[0]);
      }
      announce('สลับหน่วยเป็นเซลเซียส');
    });

    $('#btnF').addEventListener('click', () => {
      state.unit = 'F';
      $('#btnC').setAttribute('aria-pressed', 'false');
      $('#btnF').setAttribute('aria-pressed', 'true');
      const place = $('#place').textContent;
      const m = /ละติจูด ([\d.-]+), ลองจิจูด ([\d.-]+)/.exec(place);
      if (m) loadByCoords(parseFloat(m[1]), parseFloat(m[2]), place.split(' (')[0]);
      announce('สลับหน่วยเป็นฟาเรนไฮต์');
    });

    $('#btnSearch').addEventListener('click', (e) => {
      e.preventDefault();
      const q = $('#q').value.trim();
      if (!q) { announce('โปรดพิมพ์ชื่อพื้นที่'); return; }
      loadByQuery(q);
    });

    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      $('#btnSearch').click();
    });

    $$('.chip').forEach(b => b.addEventListener('click', () => {
      const name = b.dataset.city;
      const lat = parseFloat(b.dataset.lat);
      const lon = parseFloat(b.dataset.lon);
      loadByCoords(lat, lon, name);
      // move focus to result title for SR users
      $('#result-title').focus?.();
    }));

    
    // Time window controls
    const customToggle = document.getElementById('customToggle');
    const customWrap = document.getElementById('customStartWrap');
    customToggle.addEventListener('change', () => {
      const on = customToggle.checked;
      customWrap.hidden = !on;
      customToggle.setAttribute('aria-expanded', String(on));
      announce(on ? 'โหมดกำหนดเวลาเริ่มต้นเอง' : 'โหมดจากเวลาปัจจุบัน');
    });

    document.getElementById('applyWindow').addEventListener('click', (e) => {
      e.preventDefault();
      if (state.lastData) {
        renderHourlyWithWindow(state.lastData);
        announce('อัปเดตช่วงเวลาที่แสดงผลแล้ว');
      } else {
        announce('ยังไม่มีข้อมูลพยากรณ์ กรุณาเลือกพื้นที่ก่อน');
      }
    });

    document.getElementById('windowHours').addEventListener('change', () => {
      if (state.lastData) renderHourlyWithWindow(state.lastData);
    });

    // Default: load Bangkok
    loadByCoords(13.7563, 100.5018, 'กรุงเทพฯ');

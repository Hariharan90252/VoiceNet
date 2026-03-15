(() => {
  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('status');
  const clips = document.getElementById('clips');

  const clientId = Math.random().toString(36).slice(2,10);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}`;
  let ws;

  let localStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let starting = false;

  function setStatus(s){ status.textContent = s; }

  function connectWS(){
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => setStatus('Connected — hold to record'));
    ws.addEventListener('close', () => setStatus('Disconnected (refresh to reconnect)'));
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'audio') {
          // Optionally ignore your own broadcast
          if (msg.clientId === clientId) return;
          showIncoming(msg);
        }
      } catch(e) { console.warn('WS parse error', e) }
    });
  }

  function showIncoming(msg){
    const el = document.createElement('div');
    el.className = 'clip';
    const tm = document.createElement('time');
    tm.textContent = new Date(msg.ts).toLocaleTimeString();
 const audio = document.createElement('audio');
audio.src = msg.url;
audio.controls = true;
audio.autoplay = false;
audio.addEventListener('canplay', () => audio.play()); 
   el.appendChild(tm); el.appendChild(audio);
    clips.prepend(el);
  }

  async function ensureMedia(){
    if (localStream) return localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return localStream;
    } catch (err) {
      alert('Microphone required — please allow access.');
      throw err;
    }
  }

  async function startRecord(e){
    e.preventDefault();
    if (isRecording || starting) return;
    starting = true;
    btn.classList.add('pending');
    try {
      await ensureMedia();
    } catch (err) {
      starting = false; btn.classList.remove('pending');
      setStatus('Mic denied');
      return;
    }

    // choose best mime
    let options = {};
    const preferred = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg'
    ];
    for (const m of preferred) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
        options.mimeType = m; break;
      }
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(localStream, options);
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) recordedChunks.push(ev.data);
    };
    mediaRecorder.onstop = onStop; // will call upload
    mediaRecorder.start();
    isRecording = true;
    starting = false;
    btn.classList.remove('pending');
    btn.classList.add('recording');
    setStatus('Recording...');
  }

  function stopRecord(e){
    if (e) e.preventDefault();
    starting = false;
    btn.classList.remove('pending');
    if (!isRecording) return;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    btn.classList.remove('recording');
    setStatus('Processing...');
  }

  async function onStop(){
    const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'audio/webm' });

    // local preview
    const localEl = document.createElement('div');
    localEl.className = 'clip';
    const t = document.createElement('time'); t.textContent = 'You — ' + new Date().toLocaleTimeString();
    const a = document.createElement('audio'); a.src = URL.createObjectURL(blob); a.controls = true;
    localEl.appendChild(t); localEl.appendChild(a);
    clips.prepend(localEl);

    // upload via fetch (multipart/form-data)
    setStatus('Uploading...');
    const fd = new FormData();
    // give a filename with extension (helps server pick ext)
    const ext = blob.type.split('/')[1] || 'webm';
    fd.append('file', blob, `clip.${ext}`);
    fd.append('clientId', clientId);

    try {
      const res = await fetch('/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json && json.ok) {
        setStatus('Uploaded');
      } else {
        console.error('Upload failed', json);
        setStatus('Upload failed');
      }
    } catch (err) {
      console.error('Upload error', err);
      setStatus('Upload error');
    } finally {
      setTimeout(()=>setStatus('Idle'), 800);
    }
  }

  // use pointer events for universal support
  btn.addEventListener('pointerdown', startRecord);
  btn.addEventListener('pointerup', stopRecord);
  btn.addEventListener('pointercancel', stopRecord);
  btn.addEventListener('pointerleave', () => { if (isRecording) stopRecord(); });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('getUserMedia not supported in this browser');
    setStatus('No mic support');
    btn.disabled = true;
  } else {
    connectWS();
  }
})();
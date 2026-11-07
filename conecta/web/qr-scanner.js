(() => {
  const byId = (id) => document.getElementById(id);
  const dialog = byId("qr-dialog"), video = byId("qr-video");
  let stream, timer, generation = 0;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {willReadFrequently:true});
  function stop() {
    generation++;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    if (dialog.open) dialog.close();
  }
  function readCode(value) {
    try {
      const url = new URL(value);
      if (url.origin !== location.origin || url.pathname !== "/app") return null;
      return url.hash.match(/^#pair=([A-F0-9]{12})$/)?.[1] || null;
    } catch { return null; }
  }
  function scan(id) {
    if (id !== generation || !dialog.open) return;
    if (video.readyState >= 2 && video.videoWidth) {
      canvas.width = Math.min(video.videoWidth, 720);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(frame.data, frame.width, frame.height);
      if (result) {
        const code = readCode(result.data);
        if (code) {
          stop();
          byId("pair-code").value = code;
          byId("pair-form").requestSubmit();
          return;
        }
        byId("qr-feedback").textContent = "Use o QR code mostrado pelo NFS-e Conecta no PC.";
      }
    }
    timer = setTimeout(() => scan(id), 130);
  }
  byId("scan-qr").onclick = async () => {
    stop();
    const id = generation;
    dialog.showModal();
    byId("qr-feedback").textContent = "Autorize a câmera para ler o QR.";
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera-unavailable");
      const camera = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:720}},audio:false});
      if (id !== generation) { camera.getTracks().forEach((track) => track.stop()); return; }
      stream = camera;
      video.srcObject = camera;
      await video.play();
      byId("qr-feedback").textContent = "Enquadre o QR code do PC.";
      scan(id);
    } catch {
      byId("qr-feedback").textContent = "Não foi possível abrir a câmera. Confira a permissão e use a versão atualizada do Android. Você também pode digitar o código.";
    }
  };
  byId("close-scanner").onclick = stop;
  dialog.addEventListener("cancel", stop);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  if (window.NfseAndroid) byId("installed-version").textContent = "Android " + NfseAndroid.version();
  byId("check-updates").onclick = () => {
    if (window.NfseAndroid) NfseAndroid.checkUpdates();
    else location.href = "/#downloads";
  };
})();

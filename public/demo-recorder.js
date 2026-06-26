const canvas = document.querySelector("#demo");
const ctx = canvas.getContext("2d");
const status = document.querySelector("#status");
const screenshot = new Image();
screenshot.src = "/video-assets/widget-full.png";
await screenshot.decode();

const width = canvas.width;
const height = canvas.height;
const fps = 30;
const duration = 22;

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function text(value, x, y, size, color = "#ffffff", weight = 700, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Roboto Slab", serif`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

function paragraph(lines, x, y, size, color, gap = 1.25) {
  lines.forEach((line, index) => text(line, x, y + index * size * gap, size, color, 500));
}

function cover(title, subtitle, progress = 0) {
  ctx.fillStyle = "#102a43";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f766e";
  ctx.fillRect(0, 0, width, 18);
  text("FII SELECT", 42, 105, 21, "#8edbd2", 800);
  text("MVP DE ANÁLISE", 42, 138, 15, "#b8d8d4", 700);
  paragraph(title, 42, 280, 54, "#ffffff", 1.08);
  paragraph(subtitle, 42, 490, 25, "#b8d8d4", 1.35);
  ctx.fillStyle = "#0f766e";
  roundedRect(42, 745, 456 * Math.min(1, progress), 9, 5);
  text("Conteúdo educacional • Estimativa por renda", 42, 805, 16, "#829ab1", 600);
}

function screenshotStage(sourceY, label, time, zoom = 1.06) {
  ctx.fillStyle = "#eef5f4";
  ctx.fillRect(0, 0, width, height);
  const sourceWidth = screenshot.width;
  const visibleHeight = height / zoom;
  const maxY = Math.max(0, screenshot.height - visibleHeight);
  const y = Math.min(maxY, Math.max(0, sourceY));
  ctx.drawImage(screenshot, 0, y, sourceWidth, visibleHeight, 0, 0, width, height);
  const fade = ctx.createLinearGradient(0, 0, 0, 165);
  fade.addColorStop(0, "rgba(16,42,67,.95)");
  fade.addColorStop(1, "rgba(16,42,67,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, 180);
  ctx.fillStyle = "#0f766e";
  roundedRect(24, 28, 492, 65, 18);
  text(label, 270, 70, 22, "#ffffff", 800, "center");
  ctx.fillStyle = "#ffffff";
  roundedRect(455, 900, 58, 32, 16);
  text(`${Math.round(time)}s`, 484, 922, 13, "#0f766e", 800, "center");
}

function render(seconds) {
  if (seconds < 3) {
    cover(["Valor justo de FIIs", "em segundos"], ["Renda, risco e patrimônio", "em uma leitura simples."], seconds / 3);
  } else if (seconds < 7) {
    screenshotStage((seconds - 3) * 15, "01 • Ajuste as premissas", seconds);
  } else if (seconds < 11) {
    screenshotStage(600 + (seconds - 7) * 18, "02 • Veja o valor justo", seconds);
  } else if (seconds < 15) {
    screenshotStage(870 + (seconds - 11) * 12, "03 • Compare com o P/VP", seconds);
  } else if (seconds < 19) {
    screenshotStage(1420 + (seconds - 15) * 20, "04 • Compare até 5 FIIs", seconds);
  } else {
    cover(["Compare.", "Entenda.", "Decida melhor."], ["FII Select", "MVP em validação."], (seconds - 19) / 3);
  }
}

const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
  ? "video/webm;codecs=vp9"
  : "video/webm";
const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType, videoBitsPerSecond: 2800000 });
const chunks = [];
recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
recorder.addEventListener("stop", async () => {
  status.textContent = "Salvando vídeo...";
  const video = new Blob(chunks, { type: mimeType });
  const response = await fetch("/api/demo-video", { method: "POST", body: video });
  const result = await response.json();
  status.textContent = result.ok ? `Vídeo pronto: ${result.bytes} bytes` : "Falha ao salvar vídeo.";
});

recorder.start(500);
const started = performance.now();
function tick(now) {
  const seconds = (now - started) / 1000;
  render(seconds);
  status.textContent = `Renderizando ${Math.min(duration, seconds).toFixed(1)}s / ${duration}s`;
  if (seconds < duration) requestAnimationFrame(tick);
  else recorder.stop();
}
requestAnimationFrame(tick);


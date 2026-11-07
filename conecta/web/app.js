const $ = (id) => document.getElementById(id);
let pairing;
try {
  pairing = JSON.parse(localStorage.getItem("nfsePair") || "null");
} catch {
  localStorage.removeItem("nfsePair");
}
let online = false,
  busy = false,
  polling = false,
  timer,
  requestId = sessionStorage.getItem("nfseRequest") || null;
const feedback = (text) => {
  $("feedback").textContent = text;
};
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(pairing ? { authorization: "Bearer " + pairing.mobileToken } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      pairing = null;
      localStorage.removeItem("nfsePair");
      render();
    }
    throw new Error(data.error || "Não foi possível conectar.");
  }
  return data;
}
function render() {
  $("pair-panel").hidden = !!pairing;
  $("invoice-panel").hidden = !pairing;
  $("send").disabled = !online || busy;
  for (const id of ["cnpj", "description", "amount", "suspended"])
    if ($(id).disabled !== busy) $(id).disabled = busy;
  if (pairing) $("computer-name").textContent = pairing.name;
}
function saveDraft() {
  sessionStorage.setItem(
    "nfseDraft",
    JSON.stringify({
      cnpj: $("cnpj").value,
      description: $("description").value,
      amount: $("amount").value,
      suspended: $("suspended").checked,
    }),
  );
}
try {
  const draft = JSON.parse(sessionStorage.getItem("nfseDraft") || "null");
  if (draft) {
    $("cnpj").value = draft.cnpj || "";
    $("description").value = draft.description || "";
    $("amount").value = draft.amount || "";
    $("suspended").checked = !!draft.suspended;
  }
} catch {}
$("cnpj").addEventListener("input", () => {
  const x = $("cnpj").value.replace(/\D/g, "").slice(0, 14);
  $("cnpj").value = x
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
  saveDraft();
});
for (const id of ["description", "amount", "suspended"])
  $(id).addEventListener("input", saveDraft);
$("pair-code").addEventListener("input", () => {
  $("pair-code").value = $("pair-code")
    .value.toUpperCase()
    .replace(/[^A-F0-9]/g, "");
});
$("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("pair-button").disabled = true;
  feedback("Conectando…");
  try {
    const data = await api("/api/pair", {
      method: "POST",
      body: JSON.stringify({ code: $("pair-code").value }),
    });
    pairing = data;
    localStorage.setItem("nfsePair", JSON.stringify(data));
    feedback("");
    render();
    await refresh();
  } catch (error) {
    feedback(error.message);
  } finally {
    $("pair-button").disabled = false;
  }
});
function amountValue() {
  const value = $("amount").value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.replace(/\./g, "").split(",");
  const normalized =
    whole.replace(/^0+(?=\d)/, "") + "," + decimal.padEnd(2, "0");
  return /[1-9]/.test(normalized) ? normalized : null;
}
$("invoice-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !online) return;
  const amount = amountValue(),
    cnpj = $("cnpj").value.replace(/\D/g, "");
  if (!amount || cnpj.length !== 14) {
    feedback("Confira os 14 números do CNPJ e o valor no formato 1.234,56.");
    return;
  }
  busy = true;
  render();
  feedback("Enviando ao computador…");
  requestId ||= crypto.randomUUID();
  sessionStorage.setItem("nfseRequest", requestId);
  try {
    await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        invoice: {
          cnpj,
          description: $("description").value,
          amount,
          issqnSuspended: $("suspended").checked,
        },
      }),
    });
    feedback("");
    await refresh();
  } catch (error) {
    feedback(error.message);
    busy = false;
    render();
  }
});
async function refresh() {
  if (!pairing || polling) return;
  polling = true;
  try {
    const status = await api("/api/status");
    online = status.online;
    $("online").textContent = online ? "PC conectado" : "PC desconectado";
    $("online").dataset.online = String(online);
    const job = status.job;
    if (
      job &&
      ["review", "error"].includes(job.state) &&
      requestId === job.id
    ) {
      requestId = null;
      sessionStorage.removeItem("nfseRequest");
    }
    busy = !!job && ["queued", "claimed", "running"].includes(job.state);
    $("progress").hidden = !job;
    if (job) {
      $("progress-title").textContent =
        {
          queued: "Enviado ao computador",
          claimed: "Abrindo o portal",
          running: "Preenchimento em andamento",
          review: "Tudo pronto para conferir",
          error: "Sua atenção é necessária",
        }[job.state] || "Andamento";
      $("progress-message").textContent = job.message;
      $("new-note").hidden = busy;
      const text = job.message.toLowerCase();
      const phase =
        job.state === "review"
          ? 3
          : text.includes("valores")
            ? 2
            : text.includes("serviço") || text.includes("servico")
              ? 1
              : 0;
      Array.from($("step-track").children).forEach((el, index) =>
        el.classList.toggle("active", job.state !== "error" && index <= phase),
      );
    }
    render();
  } catch (error) {
    online = false;
    render();
    feedback(error.message);
  } finally {
    polling = false;
  }
}
$("new-note").onclick = () => {
  requestId = null;
  sessionStorage.removeItem("nfseRequest");
  $("invoice-form").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  feedback("Confira os dados antes de enviar a próxima solicitação.");
};
$("disconnect").onclick = async () => {
  if (!confirm("Desconectar este celular do computador?")) return;
  try {
    await api("/api/unpair", { method: "POST", body: "{}" });
    pairing = null;
    online = false;
    busy = false;
    localStorage.removeItem("nfsePair");
    sessionStorage.removeItem("nfseRequest");
    requestId = null;
    render();
    feedback("Celular desconectado.");
  } catch (error) {
    feedback(error.message);
  }
};
function start() {
  clearInterval(timer);
  if (!document.hidden) {
    refresh();
    timer = setInterval(refresh, 3000);
  }
}
document.addEventListener("visibilitychange", start);
window.addEventListener("online", start);
render();
start();
const qrMatch = location.hash.match(/^#pair=([A-F0-9]{12})$/);
if (qrMatch) {
  history.replaceState(null, "", location.pathname);
  if (pairing) {
    feedback("Este celular já está conectado. Desconecte para trocar de computador.");
  } else {
    $("pair-code").value = qrMatch[1];
    $("pair-form").requestSubmit();
  }
}

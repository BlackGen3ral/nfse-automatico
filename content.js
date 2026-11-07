(() => {
  if (!/^\/EmissorNacional\/DPS\//i.test(location.pathname)) return;
  const DIGITS = (value) => (value || "").replace(/\D/g, "");
  const norm = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  let running = false;
  let stopped = false, activeRemoteJobId = null;
  function ensureRunning() {
    if (stopped) { const error = new Error("Preenchimento interrompido."); error.name = "AbortError"; throw error; }
  }
  const peoplePath = /\/DPS\/Pessoas(?:\/|$)/i;
  const servicePath = /\/DPS\/Servi(?:c|ç|%c3%a7)o(?:\/|$)/i;
  const valuesPath = /\/DPS\/Tributacao(?:\/|$)/i;

  function cnpjInEmitterHeader() {
    const text = Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.children.length === 0 && /logado como/i.test(element.textContent || ""))
      .map((element) => element.textContent || "")
      .join(" ");
    const found = text.match(/(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    return found ? DIGITS(found[0]) : "";
  }

  function visible(element) {
    return !!element && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function formGroup(label) {
    let element = label;
    for (let i = 0; i < 6 && element && element !== document.body; i++, element = element.parentElement) {
      if (element.matches?.(".form-group,.form-control-group,.form-row,.row,.input-group,[class*=form-group]")) return element;
      if (element.querySelectorAll?.("input,select,textarea").length === 1) return element;
    }
    return label?.parentElement || null;
  }

  function findControl(scope, labelPattern) {
    if (!scope) return null;
    const labels = Array.from(scope.querySelectorAll("label,[aria-label]"));
    for (const label of labels) {
      const text = norm(label.innerText || label.getAttribute("aria-label") || label.textContent);
      if (!labelPattern.test(text)) continue;
      const direct = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector("input,select,textarea,[role=combobox]");
      const candidates = [direct, formGroup(label)?.querySelector("input,select,textarea,[role=combobox]")].filter(Boolean);
      const usable = candidates.find((item) => !item.matches("input[type=radio],input[type=checkbox],input[type=hidden]"));
      if (usable) return usable;
    }
    return null;
  }

  function setNativeValue(element, value) {
    ensureRunning();
    if (!element || element.disabled) return false;
    const next = String(value);
    if (element.value === next) return true;
    guide.point(element);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, next);
    else element.value = next;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    if (element.value === next) guide.confirm(element);
    return true;
  }

  function selectOption(element, wanted, firstValid = false) {
    ensureRunning();
    if (!(element instanceof HTMLSelectElement)) return false;
    const options = Array.from(element.options).filter((option) =>
      !option.matches(":disabled") && option.value && !/^selecione\b/.test(norm(option.textContent)));
    const target = norm(wanted).replace(/\s/g, "");
    const option = firstValid ? options[0] : options.find((item) => {
      const text = norm(item.textContent);
      const label = text.replace(/\s/g, "");
      return norm(item.value).replace(/\s/g, "") === target ||
        (target && (/^\d+$/.test(target)
          ? label.startsWith(target) && !/\d/.test(label[target.length] || "")
          : text.replace(/^\d+ /, "") === norm(wanted) || text.startsWith(norm(wanted) + " ")));
    });
    if (!option) return false;
    if (element.value === option.value) return true;
    if (element.disabled) return false;
    guide.point(element, true);
    const chosen = document.getElementById(element.id + "_chosen");
    if (visible(chosen)) {
      const opener = chosen.querySelector(".chosen-single");
      if (!opener) return false;
      if (!chosen.classList.contains("chosen-with-drop")) {
        opener.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      }
      const result = Array.from(chosen.querySelectorAll(".chosen-results .active-result"))
        .find((item) => norm(item.textContent) === norm(option.textContent));
      if (!result) return false;
      guide.point(result, true);
      result.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      guide.point(opener);
      if (element.value === option.value) guide.confirm(opener);
      return element.value === option.value;
    }
    return setNativeValue(element, option.value) && element.value === option.value;
  }

  function select2LabelMatches(label, wanted) {
    const text = norm(label);
    if (/^\d+$/.test(wanted)) {
      const code = text.replace(/\s/g, "").match(/^\d+/)?.[0];
      return code === wanted;
    }
    return text === norm(wanted) || text === "pimenta bueno rondonia";
  }

  function pressWidgetKey(element, key, code) {
    ensureRunning();
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key, keyCode: code, which: code, bubbles: true, cancelable: true
    }));
  }

  async function searchSelect2(label, id, wanted, terms) {
    return recoverStep(label, () => searchSelect2Attempt(label, id, wanted, terms));
  }

  async function searchSelect2Attempt(label, id, wanted, terms) {
    const field = () => document.getElementById(id);
    const selection = () => document.getElementById("select2-" + id + "-container")?.closest(".select2-selection");
    const selected = () => {
      const option = field()?.selectedOptions?.[0];
      return !!option?.value && (option.value === wanted || select2LabelMatches(option.textContent, wanted));
    };
    const control = await waitFor(label, () => {
      const widget = selection();
      return field() && !field().disabled && visible(widget) && widget;
    }, 12000);
    if (selected()) return;
    guide.point(control, true);
    if (control.getAttribute("aria-expanded") !== "true") {
      pressWidgetKey(control, "Enter", 13);
    }
    try {
      const listId = "select2-" + id + "-results";
      const search = await waitFor(label + " · caixa de busca", () => {
        if (control.getAttribute("aria-expanded") !== "true") return null;
        const owned = document.querySelector(".select2-search__field[aria-controls='" + listId + "']");
        return owned || document.querySelector(".select2-container--open .select2-search__field");
      });
      for (const term of terms) {
        guide.point(search);
        ensureRunning();
        search.value = term;
        search.dispatchEvent(new Event("input", { bubbles: true }));
        const result = await waitFor(label + " · resultado", () => {
          const list = document.getElementById(listId);
          return Array.from(list?.querySelectorAll("li[aria-selected], li.select2-results__option--selectable") || [])
            .find((item) => visible(item) && item.getAttribute("aria-disabled") !== "true" &&
              select2LabelMatches(item.textContent, wanted));
        }, 4500).catch((error) => { if (!error.retryable) throw error; return null; });
        if (!result) continue;
        guide.point(result, true);
        ensureRunning();
        result.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        guide.point(control);
        await waitFor(label + " · seleção", selected);
        guide.confirm(control);
        return;
      }
      throw portalFailure(label + " · resultado");
    } finally {
      if (control.getAttribute("aria-expanded") === "true") {
        pressWidgetKey(control, "Escape", 27);
      }
    }
  }

  function findRadio(scope, optionText, group) {
    if (!scope) return null;
    const wanted = norm(optionText);
    const matchesGroup = (input) => input?.matches?.("input[type=radio]") &&
      (group === undefined || input.name === group);
    for (const label of scope.querySelectorAll("label")) {
      if (norm(label.innerText || label.textContent) === wanted) {
        const input = label.control || label.querySelector("input[type=radio]") || (label.htmlFor && document.getElementById(label.htmlFor));
        if (matchesGroup(input)) return input;
      }
    }
    for (const radio of scope.querySelectorAll("input[type=radio]")) {
      if (!matchesGroup(radio)) continue;
      const wrapper = radio.closest("label") || radio.parentElement;
      if (norm(wrapper?.innerText || wrapper?.textContent) === wanted) return radio;
    }
    return null;
  }

  function chooseRadio(scope, optionText, group) {
    ensureRunning();
    const radio = findRadio(scope, optionText, group);
    if (!radio || radio.disabled) return !!radio?.checked;
    if (!radio.checked) {
      guide.point(radio, true);
      const label = Array.from(radio.labels || []).find((item) =>
        norm(item.innerText || item.textContent) === norm(optionText));
      label?.click();
    }
    if (!radio.checked) radio.click();
    if (radio.checked) guide.confirm(radio);
    return radio.checked;
  }

  function findCnpjInput(panel, stem) {
    return panel?.querySelector(`#${stem}_Inscricao, input[name="${stem}.Inscricao"], input[id*="${stem}_Inscricao"]`) ||
      findControl(panel, /^(cpf cnpj|cnpj)$/);
  }

  const defaults = {
    governmentPurchase: false, recipientIsAcquirer: false,
    customerLocation: "Brasil", recipientLocation: "Brasil", intermediary: "Intermediário não informado"
  };

  async function preferences() {
    const { nfseConfig } = await chrome.storage.local.get("nfseConfig");
    const issuer = cnpjInEmitterHeader();
    const profile = issuer && nfseConfig?.companies?.find((item) => DIGITS(item.issuerCnpj) === issuer);
    return { ...defaults, ...nfseConfig?.defaults, ...profile?.overrides };
  }

  function createGuide() {
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;bottom:18px;right:18px;z-index:2147483647;pointer-events:none;display:block;visibility:visible";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host{font:13px/1.4 system-ui,sans-serif;color:#183f32}
        *{box-sizing:border-box}
        .card[hidden]{display:none!important}
        .card{position:relative;isolation:isolate;width:min(368px,calc(100vw - 36px));border:1px solid #bde7cd;border-radius:20px;background:linear-gradient(145deg,#fff,#f3fcf5);color:#214e38;font:13px/1.5 "Segoe UI",system-ui,sans-serif;box-shadow:0 18px 55px #1a6c3a22,inset 0 1px #b9f9d628;pointer-events:auto;overflow:hidden;animation:arrive .42s cubic-bezier(.2,.8,.2,1) both}
        .top{position:relative;display:flex;align-items:center;gap:14px;padding:19px 16px 12px}
        .brand{font-size:9px;letter-spacing:.15em;color:#39805a;font-weight:750}
        h2{font:700 17px/1.25 "Segoe UI",system-ui,sans-serif;letter-spacing:-.02em;margin:5px 0 0;color:#164e32}
        .controls{margin-left:auto;display:flex;align-self:flex-start;gap:3px}
        button{border:1px solid #cce9d7;background:#f1faf4;color:#397555;border-radius:7px;padding:3px 7px;font:13px/1.3 "Segoe UI",system-ui,sans-serif;cursor:pointer}button:hover{background:#e3f5e9}
        button:focus-visible{outline:2px solid #9becbf;outline-offset:2px}
        .robot{position:relative;flex:none;width:66px;height:72px;animation:bob 2.8s ease-in-out infinite;filter:drop-shadow(0 3px 2px #0b4b2320)}
        .antenna{position:absolute;left:32px;top:0;width:3px;height:12px;background:#367b5c}
        .antenna:before{content:"";position:absolute;left:-3px;top:0;width:9px;height:9px;border:2px solid #418c64;border-radius:50%;background:#c6ffb3;box-shadow:0 0 6px #bcffba}
        .body{position:absolute;inset:13px 4px 6px;border:2px solid #397c57;border-radius:18px 18px 15px 15px;background:linear-gradient(140deg,#e1ffd8,#a9e5bb 70%);box-shadow:inset 0 2px 0 #fff9,inset 0 -6px 0 #74b98e}
        .face{position:absolute;left:5px;right:5px;top:8px;height:29px;border:2px solid #2b7754;border-radius:11px;background:linear-gradient(145deg,#214f41,#103429);display:flex;align-items:center;justify-content:center;gap:13px;box-shadow:inset 0 2px 3px #0003}
        .eye{position:relative;width:7px;height:10px;border-radius:4px;background:#a9ffd3;box-shadow:0 0 5px #7cfbc54a;animation:blink 5.4s infinite}
        .eye:after{content:"";position:absolute;top:1px;left:1px;width:2px;height:3px;border-radius:2px;background:#effff5}
        .smile{position:absolute;bottom:7px;left:23px;width:9px;height:4px;border-bottom:2px solid #3a7d58;border-radius:50%}
        .hand,.arm-left{position:absolute;top:34px;width:10px;height:19px;border:2px solid #397c57;border-radius:8px;background:#b6ebc3;transform-origin:50% 20%}
        .hand{right:-2px;transform:rotate(-20deg)}
        .arm-left{left:-2px;transform:rotate(18deg)}
        .foot{position:absolute;bottom:1px;width:16px;height:9px;border:2px solid #397c57;border-radius:5px;background:#76bc91}
        .foot.left{left:13px}.foot.right{right:13px}
        .badge{position:absolute;left:9px;bottom:8px;width:7px;height:7px;border:1px solid #44845f;border-radius:2px;background:#edfff1}
        .card[data-mood=review] .eye{height:5px;background:transparent;border-top:3px solid #baffd5;border-radius:6px 6px 0 0}
        .card[data-mood=review] .hand{transform:rotate(-125deg);height:19px}
        .card[data-mood=error] .eye{transform:rotate(-12deg)}
        .message{position:relative;margin:0 16px 16px;padding:10px 12px;border:1px solid #d2e9da;border-radius:10px;background:#f1faf4;color:#365e49;font:13px/1.5 "Segoe UI",system-ui,sans-serif;min-height:44px}
        ol{position:relative;display:grid;grid-template-columns:repeat(4,1fr);padding:13px 11px 15px;margin:0;border-top:1px solid #81cc9d25;list-style:none;background:#edf8f0}
        li{position:relative;text-align:center;font:11px/1.4 "Segoe UI",system-ui,sans-serif;color:#537c63}li:before{content:"";position:absolute;top:13px;left:-29%;width:58%;height:1px;background:#6b9b7b52}li:first-child:before{display:none}li[data-state=done]+li:before{background:#78dca3}
        li span{position:relative;display:grid;place-items:center;margin:0 auto 6px;width:27px;height:27px;border:1px solid #8ebd9e47;border-radius:9px;background:#f0f9f3;color:#486c55;font-weight:750;transition:background .25s,box-shadow .25s}
        li[data-state=active]{color:#157a45;font-weight:750}
        li[data-state=active] span{background:#12854d;color:#fff;border-color:#d0ffdf;box-shadow:0 0 16px #79e5ab55;animation:pulse 2.2s ease-in-out infinite}
        li[data-state=done] span{background:#dff4e6;color:#267848;border-color:#77c59155}
        .card[data-mood=error]{border-color:#c79257}
        .card[data-mood=error] h2{color:#805820}.card[data-mood=error] .message{border-color:#e5b56b50;color:#77552d}
        .card[data-mood=error] .robot,.card[data-mood=review] .robot{animation:none}
        .card[data-mood=review] .hand:after{content:"";position:absolute;width:5px;height:8px;left:-4px;bottom:2px;border-radius:3px;background:#b6ebc3;border:1px solid #397c57}
        .card[data-mood=review] .smile{height:6px;border-bottom-width:3px}
        .card[data-mood=error] .smile{transform:rotate(180deg)}
        .card[data-mini=true] .message,.card[data-mini=true] ol{display:none}
        .card[data-mini=true] .top{padding-bottom:14px}
        .shade{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;opacity:0;transition:opacity .2s ease}
        .shade[data-active=true]{opacity:1}
        .target{position:fixed;border:2px solid #24ad71;border-radius:7px;pointer-events:none;box-shadow:0 0 0 4px #3bc28420;transition:all .22s ease;display:none}
        .cursor{position:fixed;pointer-events:none;width:32px;height:40px;filter:drop-shadow(0 0 3px #62ffb8) drop-shadow(0 0 9px #13c577b3) drop-shadow(0 2px 2px #001d28b3);transition:transform .22s ease;display:none;left:0;top:0}
        .click{position:fixed;opacity:0;width:25px;height:25px;border-radius:50%;border:2px solid #25a66f;pointer-events:none;display:none;left:0;top:0}
        @keyframes bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5px) rotate(2deg)}}
        @keyframes work-arm{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(-42deg)}}
        @keyframes work-left{0%,100%{transform:rotate(18deg)}50%{transform:rotate(35deg)}}
        @keyframes antenna-glow{50%{box-shadow:0 0 11px #bcffba;filter:brightness(1.2)}}
        @keyframes hello{0%,100%{transform:rotate(-125deg)}20%,60%{transform:rotate(-145deg)}40%,80%{transform:rotate(-110deg)}}
        .card[data-mood=working] .hand{animation:work-arm 1.6s ease-in-out infinite}
        .card[data-mood=working] .arm-left{animation:work-left 1.6s ease-in-out infinite}
        .card[data-mood=working] .antenna:before{animation:antenna-glow 1.8s ease-in-out infinite}
        .card[data-mood=review] .hand{animation:hello 1.2s ease-in-out 2}
        @keyframes blink{0%,44%,48%,100%{transform:scaleY(1)}46%{transform:scaleY(.1)}}
        @keyframes pulse{50%{box-shadow:0 0 0 4px #8ee9b216,0 0 21px #79e5ab60}}
        @keyframes arrive{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes sweep{0%,70%{transform:translateX(-160%) skewX(-18deg);opacity:0}78%{opacity:.7}100%{transform:translateX(180%) skewX(-18deg);opacity:0}}
        .card:before{content:"";position:absolute;z-index:-1;inset:-30%;background:linear-gradient(90deg,transparent,#abffd30c,transparent);pointer-events:none;animation:sweep 6s ease-in-out infinite}
        .card[data-mood=review]{border-color:#a7efc780;box-shadow:0 18px 55px #1a6c3a22,0 0 25px #80d7a21a}.card[data-mood=review]:before,.card[data-mood=error]:before{animation:none;opacity:0}
        .robot{filter:drop-shadow(0 3px 5px #266e3d24)}
        @media(prefers-reduced-motion:reduce){*,*:before,*:after,.robot,.eye,li[data-state=active] span{animation:none!important;transition:none!important}}
        .retry[hidden]{display:none!important}.retry{display:block;margin:0 16px 12px;padding:9px 12px;border-color:#94dfb755;background:#12854d;color:#edfff4;cursor:pointer}
        .dismiss-countdown{margin:0;padding:0 18px 12px;text-align:right;font-size:11px;color:#54836a;font-variant-numeric:tabular-nums}
        .worker[hidden]{display:none!important}
        .worker{position:relative;display:flex;align-items:center;gap:10px;width:min(280px,calc(100vw - 36px));padding:10px 14px;border:1px solid #99dcb4;border-radius:18px;background:linear-gradient(135deg,#fff,#eafbf0);box-shadow:0 10px 30px #001a1638;color:#24533b;font:12px/1.4 "Segoe UI",system-ui,sans-serif;pointer-events:none}
        .worker-avatar{position:relative;flex:0 0 78px;height:80px}
        .worker .hand{animation:work-arm .8s ease-in-out infinite}
        .worker .arm-left{animation:work-left .9s ease-in-out infinite}
        .worker[data-waiting=true] .hand,.worker[data-waiting=true] .arm-left{animation-duration:2s}
        .worker-copy{min-width:0}.worker strong{display:block;font-size:12px;color:#127442}.worker p{margin:5px 0 0;color:#4c755d;font-size:11px;overflow-wrap:anywhere}
        .workstation{position:absolute;left:30px;top:45px;width:39px;height:26px;border:2px solid #94d9ae;border-radius:4px;background:#d8f8e4;box-shadow:0 3px 6px #001a1640;transform:rotate(-5deg)}
        .workstation:before{content:"";position:absolute;inset:5px;background:repeating-linear-gradient(0deg,#25995b 0 2px,transparent 2px 5px);opacity:.6;animation:typing-screen 1.4s ease-in-out infinite}
        .workstation:after{content:"";position:absolute;left:-5px;bottom:-6px;width:45px;height:5px;border-radius:0 0 5px 5px;background:#a6dfbb;border-bottom:2px solid #4c9471}
        @keyframes typing-screen{50%{opacity:.95}}
        .cursor,.click{z-index:2}
        .card[data-mood=error]{border-color:#e9c07d}.card[data-mood=error] .message{background:#fff8ed}
        .worker{z-index:1;box-shadow:0 8px 24px #1d683224}
        .worker strong:before{content:"";display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#20a963;box-shadow:0 0 0 3px #dff7e8}
      </style>
      <svg class="shade" data-shade aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="#00150e" fill-opacity=".2" fill-rule="evenodd"/></svg>
      <div class="target" aria-hidden="true"></div>
      <svg class="cursor" data-cursor xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40" aria-hidden="true"><path d="M4 3L28 30L13 28L4 37Z" fill="#040c2e" stroke="#d9f6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="M4 3L13 28L4 37Z" fill="#003047"/></svg>
      <div class="click" aria-hidden="true"></div>
      <section class="worker" hidden aria-label="Robô trabalhando"><div class="worker-avatar" aria-hidden="true"></div><div class="worker-copy"><strong>Preparando sua nota</strong><p role="status" aria-live="polite"></p></div></section>
      <section class="card" hidden aria-label="Assistente de preenchimento NFS-e">
        <div class="top">
          <div class="robot" aria-hidden="true"><i class="antenna"></i><div class="body"><div class="face"><i class="eye"></i><i class="eye"></i></div><i class="smile"></i><i class="badge"></i></div><i class="arm-left"></i><i class="hand"></i><i class="foot left"></i><i class="foot right"></i></div>
          <div><div class="brand">NFS-e AUTOMÁTICO</div><h2>Vamos preparar sua nota</h2></div>
          <div class="controls"><button type="button" class="min" aria-label="Recolher painel" aria-expanded="true">−</button><button type="button" class="close" aria-label="Fechar painel de progresso">×</button></div>
        </div>
        <p class="message" role="status" aria-live="polite"></p>
        <ol aria-label="Progresso"><li><span>1</span>Pessoas</li><li><span>2</span>Serviço</li><li><span>3</span>Valores</li><li><span>4</span>Revisão</li></ol>
        <button type="button" class="retry" hidden>Tentar novamente nesta etapa</button>
        <p class="dismiss-countdown" aria-live="off"></p>
      </section>`;
    const card = root.querySelector(".card");
    const retry = root.querySelector(".retry");
    retry.onclick = () => { retry.disabled = true; retryCurrentStage().catch((error) => guide.show("error", error.message)).finally(() => { retry.disabled = false; }); };
    const worker = root.querySelector(".worker");
    const avatar = worker.querySelector(".worker-avatar");
    avatar.append(card.querySelector(".robot").cloneNode(true));
    const laptop = document.createElement("i"); laptop.className = "workstation"; avatar.append(laptop);
    const workerTitle = worker.querySelector("strong");
    const workerText = worker.querySelector("p");
    const workingTitle = () => peoplePath.test(location.pathname) ? "Conferindo Pessoas" : servicePath.test(location.pathname) ? "Preenchendo Serviço" : valuesPath.test(location.pathname) ? "Preenchendo Valores" : "Abrindo revisão";
    const message = root.querySelector(".message");
    const title = root.querySelector("h2");
    const ring = root.querySelector(".target");
    const cursor = root.querySelector("svg[data-cursor]");
    const shade = root.querySelector("svg[data-shade]");
    const shadePath = shade.querySelector("path");
    function spotlight(rect) {
      let outline = "M0 0H" + innerWidth + "V" + innerHeight + "H0Z";
      if (rect) {
        const left = Math.max(0, rect.left - 6), top = Math.max(0, rect.top - 6);
        const right = Math.min(innerWidth, rect.right + 6), bottom = Math.min(innerHeight, rect.bottom + 6);
        outline += " M" + left + " " + top + "H" + right + "V" + bottom + "H" + left + "Z";
      }
      shadePath.setAttribute("d", outline);
    }
    const click = root.querySelector(".click");
    let dismissed = false, phase = "people", baseText = "", target, lastAction = 0, lastStage = null, dismissTimer, presenting = false, observedBody;
    const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const mountObserver = window.MutationObserver ? new window.MutationObserver(() => {
      if (presenting && !dismissed && !host.isConnected) { attach(); position(); }
    }) : null;
    function attach() {
      if (!presenting || dismissed || typeof document === "undefined" || !document?.body) { mountObserver?.disconnect(); observedBody = null; return; }
      if (!host.isConnected) document.body.append(host);
      if (observedBody !== document.body) {
        mountObserver?.disconnect(); observedBody = null;
        if (document.documentElement) mountObserver?.observe(document.documentElement, {childList:true});
        mountObserver?.observe(document.body, {childList:true});
        observedBody = document.body;
      }
    }
    function keepWorking() {
      if (dismissed || ["error", "review-ready"].includes(phase)) return;
      presenting = true; worker.hidden = false; card.hidden = true; attach();
    }
    function clearTarget() {
      target = null; spotlight();
      ring.style.display = cursor.style.display = click.style.display = "none";
    }
    function position() {
      if (!target?.isConnected) return clearTarget();
      const r = target.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) {
        ring.style.display = cursor.style.display = "none";
        spotlight(); return;
      }
      spotlight(r);
      Object.assign(ring.style, {display:"block",left:(r.left-3)+"px",top:(r.top-3)+"px",width:(r.width+6)+"px",height:(r.height+6)+"px"});
      cursor.style.display = "block";
      cursor.style.transform = "translate(" + Math.max(0, Math.min(r.right-8, innerWidth-40)) + "px," + Math.max(0, Math.min(r.top+r.height/2, innerHeight-48)) + "px)";
    }
    root.querySelector(".close").onclick = () => { dismissed = true; presenting = false; mountObserver?.disconnect(); observedBody = null; clearInterval(dismissTimer); host.remove(); clearTarget(); };
    root.querySelector(".min").onclick = (event) => {
      const mini = card.dataset.mini !== "true";
      card.dataset.mini = String(mini);
      event.currentTarget.textContent = mini ? "+" : "−";
      event.currentTarget.setAttribute("aria-expanded", String(!mini));
      event.currentTarget.setAttribute("aria-label", mini ? "Expandir painel" : "Recolher painel");
    };
    window.addEventListener("scroll", position, {passive:true,capture:true});
    window.addEventListener("resize", position, {passive:true});
    window.addEventListener("pagehide", () => { presenting = false; mountObserver?.disconnect(); observedBody = null; });
    return {
      show(next, text) {
        clearInterval(dismissTimer);
        presenting = true;
        phase = next; baseText = text;
        retry.hidden = next !== "error" || !(servicePath.test(location.pathname) || valuesPath.test(location.pathname));
        shade.dataset.active = String(["people", "service", "values", "waiting"].includes(next));
        const index = peoplePath.test(location.pathname) ? 0 : servicePath.test(location.pathname) ? 1 : valuesPath.test(location.pathname) ? 2 : 3;
        worker.hidden = next === "error" || next === "review-ready";
        worker.dataset.waiting = "false";
        workerTitle.textContent = workingTitle();
        workerText.textContent = text;
        if (next !== "review-ready" && next !== "error") {
          card.hidden = true;
          if (!["people", "service", "values", "waiting"].includes(next)) clearTarget();
          attach();
          return;
        }
        card.hidden = false; attach(); message.textContent = text;
        const countdown = root.querySelector(".dismiss-countdown");
        const closeAt = Date.now() + 10000;
        countdown.textContent = "Fechando em 10 s…";
        dismissTimer = setInterval(() => {
          if (phase !== next) return;
          const seconds = Math.max(0, Math.ceil((closeAt - Date.now()) / 1000));
          if (!seconds) {
            clearInterval(dismissTimer);
            presenting = false; mountObserver?.disconnect(); observedBody = null;
            host.remove(); clearTarget();
          } else countdown.textContent = "Fechando em " + seconds + " s…";
        }, 1000);
        const stage = next === "error" ? "error" : next === "review-ready" ? "review" : String(index);
        if (lastStage !== null && stage !== lastStage && !reduced()) {
          message.animate?.([{opacity:.3,transform:"translateY(4px)"},{opacity:1,transform:"translateY(0)"}],{duration:240,easing:"ease-out"});
        }
        lastStage = stage;
        card.dataset.mood = next === "error" ? "error" : next === "review-ready" ? "review" : "working";
        title.textContent = next === "error" ? "Ficou algo pendente" : next === "review-ready" ? "Deu tudo certo! Agora é com você." : ["Preenchendo Pessoas","Preenchendo Serviço","Preenchendo Valores","Abrindo revisão"][index];
        card.querySelectorAll("li").forEach((item,i) => {
          item.dataset.state = i < index ? "done" : i === index ? "active" : "pending";
          item.querySelector("span").textContent = i < index ? "✓" : String(i+1);
          if (i === index) item.setAttribute("aria-current","step"); else item.removeAttribute("aria-current");
        });
        if (next === "error" || next === "review-ready" || next === "review") clearTarget();
      },
      wait(label) { keepWorking(); if (host.isConnected && phase !== "error") { worker.dataset.waiting = "true"; workerTitle.textContent = label.startsWith("Recuperando") ? "Tentando novamente" : "Aguardando o portal"; workerText.textContent = label; } },
      restore() { keepWorking(); worker.dataset.waiting = "false"; workerTitle.textContent = workingTitle(); workerText.textContent = baseText; },
      confirm(element) {
        this.point(element);
        if (ring.style.display === "block" && !reduced()) {
          ring.animate?.([{boxShadow:"0 0 0 0 #4ee79a80"},{boxShadow:"0 0 0 8px #4ee79a20"},{boxShadow:"0 0 0 4px #3bc28420"}], {duration:420,easing:"ease-out"});
        }
      },
      point(element, clicked = false) {
        if (dismissed || phase === "error" || phase === "review-ready" || !element) return;
        keepWorking();
        if (target === element && Date.now()-lastAction < 500) return;
        lastAction = Date.now();
        const chosen = element.id && document.getElementById(element.id+"_chosen");
        const select2 = element.id && document.getElementById("select2-"+element.id+"-container");
        target = visible(chosen) ? chosen : visible(select2) ? select2.closest(".select2-selection") : element;
        if (!visible(target)) target = Array.from(element.labels || []).find(visible);
        position();
        if (clicked && cursor.style.display === "block" && !reduced()) {
          const r = target.getBoundingClientRect();
          Object.assign(click.style,{display:"block",transform:"translate("+(r.right-20)+"px,"+(r.top+r.height/2-12)+"px)"});
          click.animate?.([{opacity:1,scale:".5"},{opacity:0,scale:"1.8"}],{duration:450});
        }
        // Mantém a seta visível até a próxima ação ou o fim da etapa.
      }
    };
  }
  const guide = createGuide();


  function showStatus(phase, text) { ensureRunning(); guide.show(phase, text); }
  let controlTimer, controlPending = false;
  async function checkRemoteControl() {
    if (controlPending) return;
    controlPending = true;
    clearTimeout(controlTimer);
    try {
      const result = await chrome.runtime.sendMessage({type:"nfse:remote-control"});
      if (result?.jobId && result.active) activeRemoteJobId = result.jobId;
      if (result?.active && !stopped) controlTimer = setTimeout(checkRemoteControl,800);
    } catch {}
    finally { controlPending = false; }
  }

  const draftId = () => new URLSearchParams(location.search).get("idr");

  function update(phase, text, { valuesDraft = null, invoice = null, invoiceDraft = null, retryStep = null } = {}) {
    ensureRunning();
    showStatus(phase, text);
    return chrome.runtime.sendMessage({
      type: "nfse:update",
      state: {
        phase, text, valuesDraft, invoice, invoiceDraft, retryStep, visualDraft: draftId(),
        until: Date.now() + (valuesDraft || retryStep || invoice ? 1800000 : 120000)
      }
    });
  }

  function validInvoice(invoice) {
    return typeof invoice?.description === "string" && !!invoice.description.trim() &&
      invoice.description.length <= 2000 && typeof invoice.amount === "string" &&
      /^\d{1,20},\d{2}$/.test(invoice.amount) && /[1-9]/.test(invoice.amount) &&
      (invoice.issqnSuspended === undefined || typeof invoice.issqnSuspended === "boolean");
  }

  function validationMessage(form, stageName) {
    const health = portalHealth();
    if (health) return health.message;
    const field = Array.from(form.elements).find((item) => !item.disabled && (visible(item) || visible(document.getElementById(item.id + "_chosen"))) &&
      (item.validity?.valid === false || item.classList.contains("input-validation-error")));
    const label = Array.from(field?.labels || []).map((item) => item.textContent.trim()).find(Boolean);
    return label ? "Confira o campo " + label.slice(0, 120) + " na etapa " + stageName : "Confira os campos obrigatórios da etapa " + stageName;
  }

  function advanceButton(fieldId, stagePath, stageName) {
    ensureRunning();
    const field = document.getElementById(fieldId);
    const form = field?.form || field?.closest("form");
    if (!stagePath.test(location.pathname) || !form) throw new Error("Formulário da etapa " + stageName);
    const buttons = Array.from(form.querySelectorAll("button,input[type=submit]")).filter((element) =>
      visible(element) && !element.disabled && norm(element.textContent || element.value) === "avancar");
    if (buttons.length !== 1) throw new Error("Botão Avançar da etapa " + stageName);
    if (!form.checkValidity() || form.querySelector("input.input-validation-error, select.input-validation-error, textarea.input-validation-error")) {
      throw new Error(validationMessage(form, stageName));
    }
    return buttons[0];
  }

  function watchAdvance(path, button, stageName, invoice = null) {
    ensureRunning();
    guide.point(button, true);
    ensureRunning();
    button.click();
    setTimeout(() => {
      if (!stopped && path.test(location.pathname)) {
        report(new Error("O portal permaneceu em " + stageName + ". Verifique os avisos da página"), invoice).catch(() => {});
      }
    }, 25000);
  }

  function portalHealth() {
    const alerts = Array.from(document.querySelectorAll(".alert-danger,.alert-warning,.validation-summary-errors li,.field-validation-error"))
      .filter(visible).map((item) => (item.innerText || item.textContent || "").trim()).filter(Boolean);
    const text = alerts.join(" · ").slice(0, 300);
    if (visible(document.querySelector("input[type=password]")) || /sessao.*(?:expir|encerr)|autenticacao.*necess|faca.*login/.test(norm(text))) {
      return { kind: "session", message: "A sessão do portal expirou. Entre novamente e abra o mesmo rascunho para continuar." };
    }
    if (Array.from(document.querySelectorAll("iframe[src*=recaptcha],iframe[src*=hcaptcha],[id*=captcha] input")).some(visible)) {
      return { kind: "captcha", message: "O portal solicitou uma verificação. Conclua-a manualmente para continuar." };
    }
    if (text) {
      const hasFieldError = Array.from(document.querySelectorAll(".validation-summary-errors li,.field-validation-error")).some((item) => visible(item) && item.textContent.trim());
      const transient = !hasFieldError && /temporari|indisponiv|tente novamente|nao foi possivel recuperar|erro de conexao|falha de conexao/.test(norm(text));
      return { kind: transient ? "transient" : "validation", message: text };
    }
    return null;
  }

  function portalFailure(label) {
    const health = portalHealth();
    const error = new Error(health ? health.message : "O portal não confirmou: " + label);
    error.kind = health?.kind || "timeout";
    error.retryable = error.kind === "timeout" || error.kind === "transient";
    return error;
  }

  async function recoverStep(label, action) {
    try { return await action(); }
    catch (error) {
      const health = portalHealth();
      if (!error.retryable || (health && !["transient"].includes(health.kind))) throw error;
      guide.wait("Recuperando " + label + " · nova tentativa 1 de 1");
      await new Promise((resolve) => setTimeout(resolve, 600));
      const blocked = portalHealth();
      if (blocked && blocked.kind !== "transient") throw portalFailure(label);
      try { return await action(); } finally { guide.restore(); }
    }
  }

  async function waitFor(label, predicate, timeout = 7500) {
    let deadline = Date.now() + timeout;
    const startedAt = Date.now();
    let waitingShown = false, extended = false, checkedAt = -Infinity;
    do {
      ensureRunning();
      if (Date.now() - checkedAt >= 400) {
        checkedAt = Date.now();
        const health = portalHealth();
        if (health && ["session", "captcha"].includes(health.kind)) throw portalFailure(label);
      }
      const result = predicate();
      if (result) { if (waitingShown) guide.restore(); return result; }
      if (!waitingShown && Date.now() - startedAt > 1300) { guide.wait(label); waitingShown = true; }
      const interval = Date.now() - startedAt < 1500 ? 60 : 140;
      await new Promise((resolve) => setTimeout(resolve, interval));
      if (Date.now() >= deadline && !extended) {
        const health = portalHealth();
        if (health && health.kind !== "transient") throw portalFailure(label);
        extended = true; deadline += 3000;
        guide.wait("O portal está demorando · conferindo " + label);
        waitingShown = true;
      }
    } while (Date.now() < deadline);
    if (waitingShown) guide.restore();
    throw portalFailure(label);
  }

  function panel(id) {
    const element = document.getElementById(id);
    return visible(element) ? element : null;
  }

  function applyRadio(scope, label, option) {
    return waitFor(label, () => chooseRadio(scope(), option));
  }

  function dateValue(field) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return field.type === "date" ? [year, month, day].join("-") : [day, month, year].join("/");
  }

  function lookupName(scope, stem) {
    const field = scope?.querySelector("#" + stem + "_Nome, [name='" + stem + ".Nome']") ||
      findControl(scope, /^(?:nome(?: (?:ou )?razao social)?|razao social)$/);
    return (field?.value || field?.textContent || "").trim();
  }

  async function lookup(scope, stem, label, cnpj) {
    const field = () => findCnpjInput(scope(), stem);
    const input = await waitFor(label + " · campo de CNPJ", () => visible(field()) && field());
    const previousCnpj = DIGITS(input.value);
    const previousName = lookupName(scope(), stem);
    const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (!setNativeValue(input, formatted) || DIGITS(input.value) !== cnpj) throw new Error(label + " · CNPJ");
    const button = await waitFor(label + " · botão de pesquisa", () => {
      const candidate = scope()?.querySelector("#btn_" + stem + "_Inscricao_pesquisar") ||
        field()?.closest(".input-group")?.querySelector("button[id$='_pesquisar']");
      return visible(candidate) && !candidate.disabled && candidate;
    });
    let nameWasCleared = !previousName || !lookupName(scope(), stem);
    await recoverStep(label + " · pesquisa", async () => {
    if (!button.isConnected || button.disabled || DIGITS(field()?.value) !== cnpj) throw portalFailure(label + " · pesquisa indisponível");
    guide.point(button, true);
    ensureRunning();
    button.click();
    await waitFor(label + " · resultado da pesquisa", () => {
      const name = lookupName(scope(), stem);
      if (!name) nameWasCleared = true;
      return DIGITS(field()?.value) === cnpj && name &&
        (previousCnpj === cnpj || nameWasCleared || name !== previousName);
    }, 12000);
    });
  }

  async function prepareIssuer() {
    const scope = document.querySelector("main, #main-content") || document;
    const ibs = () => panel("pnlInfoIBSCBS");
    if (ibs()) await applyRadio(ibs, "Preencher as informações IBS/CBS", "Sim");
    const date = await waitFor("Data de competência", () => {
      const field = document.getElementById("DataCompetencia") || findControl(scope, /^data de competencia/);
      return visible(field) && !field.disabled && field;
    });
    const changed = date.value !== dateValue(date);
    if (!setNativeValue(date, dateValue(date))) throw new Error("Data de competência");
    const ready = () => {
      const inscription = document.getElementById("Prestador_Inscricao");
      const name = document.getElementById("Prestador_Nome");
      const current = DIGITS(inscription?.value);
      const logged = cnpjInEmitterHeader();
      return current.length === 14 && !!name?.value.trim() && (!logged || current === logged);
    };
    if (!changed && !ready()) {
      // Refaz a consulta do próprio portal quando a data já está preenchida.
      date.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await waitFor("O portal não carregou os dados do emitente. Confira o cadastro ou tente novamente em instantes", ready, 15000);
  }

  async function fillPeople(cnpj, invoice) {
    const settings = await preferences();
    const scope = document.querySelector("main, #main-content") || document;
    const issues = [];
    async function tryStep(step) {
      try { await step(); return true; }
      catch (error) { if (error.name === "AbortError") throw error; issues.push(error.message); return false; }
    }
    const regime = () => findControl(scope, /regime de apuracao/);
    if (regime()) await tryStep(() => waitFor("Regime de apuração", () => selectOption(regime(), settings.regime, !settings.regime || settings.regime === "first-valid")));
    const government = () => panel("pnlComprasGov");
    if (government()) await tryStep(() => applyRadio(government, "Compra governamental", settings.governmentPurchase ? "Sim" : "Não"));

    const customer = () => panel("pnlTomador");
    const customerReady = await tryStep(() => applyRadio(customer, "Localização do tomador", settings.customerLocation));
    if (customerReady && settings.customerLocation === "Brasil") {
      showStatus("people", "Pesquisando o CNPJ do tomador…");
      await tryStep(() => lookup(customer, "Tomador", "Tomador", cnpj));
    }
    const destination = () => panel("pnlDestinatario");
    const destinationReady = await tryStep(() => applyRadio(destination, "Destinatário é o próprio adquirente", settings.recipientIsAcquirer ? "Sim" : "Não"));
    if (destinationReady && !settings.recipientIsAcquirer) {
      const locationReady = await tryStep(() => applyRadio(destination, "Localização do destinatário", settings.recipientLocation));
      if (locationReady && settings.recipientLocation === "Brasil") {
        showStatus("people", "Pesquisando o CNPJ do destinatário…");
        await tryStep(() => lookup(destination, "Destinatario", "Destinatário", cnpj));
      }
    }
    await tryStep(() => applyRadio(() => panel("pnlIntermediario"), "Intermediário", settings.intermediary));
    if (issues.length) throw new Error(issues.join(" · "));

    const next = document.getElementById("btnAvancar");
    const form = next?.form || next?.closest("form");
    if (!peoplePath.test(location.pathname) || !visible(next) || next.disabled || !form) throw new Error("Botão Avançar");
    if (!form.checkValidity() || form.querySelector("input.input-validation-error, select.input-validation-error, textarea.input-validation-error")) {
      throw new Error(validationMessage(form, "Pessoas"));
    }

    const armed = await update("waiting", "Pessoas preenchida. Abrindo a etapa Serviço…", {
      invoice, invoiceDraft: draftId()
    });
    if (!armed || !peoplePath.test(location.pathname)) throw new Error("Transição para Serviço");
    guide.point(next, true);
    ensureRunning();
    next.click();
    setTimeout(() => {
      if (!stopped && peoplePath.test(location.pathname)) {
        update("error", "O portal permaneceu em Pessoas. Confira os avisos da página antes de avançar.").catch(() => {});
      }
    }, 120000);
  }

  async function fillService(invoice = null) {
    await update("service", "Preenchendo Serviço…", { invoice, invoiceDraft: invoice ? draftId() : null });
    const scope = document.querySelector("main, #main-content") || document;
    const select = (label, id, value) => waitFor(label, () => selectOption(document.getElementById(id), value), 12000);
    const issues = [];
    async function attempt(step) {
      try { await step(); } catch (error) { if (error.name === "AbortError") throw error; issues.push(error.message); }
    }
    await attempt(async () => {
      await select("País", "LocalPrestacao_CodigoPaisPrestacao", "Brasil");
      showStatus("service", "Buscando Pimenta Bueno/RO…");
      await searchSelect2("Município", "LocalPrestacao_CodigoMunicipioPrestacao", "Pimenta Bueno/RO", ["Pimenta Bueno"]);
      showStatus("service", "Buscando o código de tributação 140201…");
      await searchSelect2("Código de Tributação Nacional", "ServicoPrestado_CodigoTributacaoNacional", "140201", ["140201", "14.02.01"]);
    });
    const issqn = () => {
      const panel = document.getElementById("pnlServicoPrestado") || scope;
      const label = Array.from(panel.querySelectorAll("label,legend,p,span,div")).find((element) =>
        norm(element.textContent).startsWith("o servico fornecimento prestado e um caso de imunidade") &&
        !element.querySelector("input,select,textarea"));
      if (!label) return null;
      for (let item = label.parentElement; item && item !== scope; item = item.parentElement) {
        if (findRadio(item, "Sim") && findRadio(item, "Não")) return item;
      }
      return null;
    };
    await attempt(() => applyRadio(issqn, "Imunidade, exportação ou não incidência do ISSQN", "Não"));
    if (issues.length) throw new Error(issues.join(" · "));
    await attempt(() => select("Item da NBS", "ServicoPrestado_CodigoNBS", "120012000"));
    await attempt(() => select("Código indicador da operação", "ServicoPrestado_CodigoIndOp", "050101"));
    if (issues.length) throw new Error(issues.join(" · "));
    const draft = draftId();
    if (!invoice) {
      await update("done", "Serviço preenchido. Complete a descrição e avance quando estiver pronto.", { valuesDraft: draft });
      return;
    }
    await waitFor("Descrição do Serviço/Fornecimento", () => {
      const field = document.getElementById("ServicoPrestado_Descricao");
      return visible(field) && !field.disabled && !field.readOnly &&
        setNativeValue(field, invoice.description) && field.value === invoice.description;
    });
    if (!draft) throw new Error("Rascunho da etapa Serviço");
    const next = advanceButton("ServicoPrestado_Descricao", servicePath, "Serviço");
    const armed = await update("done", "Serviço preenchido. Abrindo Valores…", { valuesDraft: draft, invoice });
    if (!armed || !servicePath.test(location.pathname)) throw new Error("Transição para Valores");
    watchAdvance(servicePath, next, "Serviço", invoice);
  }

  function selectIssqnAnswer(questionStart, answer) {
    const scope = document.getElementById("pnlOperacaoTributavel");
    if (!visible(scope)) return false;
    const question = Array.from(scope.querySelectorAll("label,legend,p,span,div")).find((item) =>
      norm(item.textContent).startsWith(questionStart) &&
      !item.querySelector("input,select,textarea"));
    if (!question) return false;
    const following = Array.from(scope.querySelectorAll("input[type=radio],hr")).filter((item) =>
      question.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [first, second] = following;
    if (!first?.name || first.name !== second?.name ||
        !first.matches("input[type=radio]") || !second.matches("input[type=radio]")) return false;
    if (!findRadio(scope, "Não", first.name) || !findRadio(scope, "Sim", first.name)) return false;
    return chooseRadio(scope, answer, first.name);
  }

  async function fillValues(invoice = null) {
    await update("values", "Preenchendo Valores…", { invoice, invoiceDraft: invoice ? draftId() : null });
    const issues = [];
    async function attempt(step) {
      try { await step(); return true; }
      catch (error) { if (error.name === "AbortError") throw error; issues.push(error.message); return false; }
    }
    const select = (label, id, code) => waitFor(label,
      () => selectOption(document.getElementById(id), code), 12000);
    if (invoice) await attempt(() => waitFor("Valor do serviço", () => {
      const field = document.getElementById("Valores_ValorServico");
      if (!visible(field) || field.disabled || field.readOnly) return false;
      const formatted = invoice.amount.replace(/\B(?=(\d{3})+,)/g, ".");
      return setNativeValue(field, formatted) && field.value.replace(/\./g, "").trim() === invoice.amount;
    }));
    const suspension = invoice?.issqnSuspended === true ? "Sim" : "Não";
    await attempt(() => waitFor("Suspensão da exigibilidade do ISSQN", () => selectIssqnAnswer(
      "a exigibilidade do recolhimento do issqn devido nesta operacao esta suspensa", suspension)));
    await attempt(() => waitFor("Retenção do ISSQN", () => selectIssqnAnswer(
      "ha retencao do issqn pelo tomador ou pelo intermediario", "Não")));
    const pisReady = await attempt(() => select("Situação Tributária do PIS/COFINS",
      "TributacaoFederal_PISCofins_SituacaoTributaria", "00"));
    if (pisReady) await attempt(() => select("Tipo de retenção do PIS/COFINS/CSLL",
      "TributacaoFederal_PISCofins_TipoRetencao", "0"));
    const ibsReady = await attempt(() => select("Código de Situação Tributária",
      "ValorTributos_CodigoSituacaoTributaria", "000"));
    if (ibsReady) await attempt(() => select("Código de Classificação Tributária",
      "ValorTributos_CodigoClassificacaoTributaria", "000001"));

    const rateModeReady = await attempt(() => applyRadio(() => panel("pnlValorTributos"),
      "Informar alíquota do Simples Nacional", "Informar alíquota do Simples Nacional"));
    if (rateModeReady) await attempt(() => waitFor("Alíquota do Simples Nacional", () => {
      const field = document.getElementById("ValorTributos_AliquotaSN");
      return visible(field) && !field.disabled && !field.readOnly &&
        setNativeValue(field, "6,00") && field.value === "6,00";
    }));

    if (issues.length) throw new Error(issues.join(" · "));
    if (!invoice) {
      await update("done", "Valores preenchidos. Confira os dados antes de avançar.");
      return;
    }
    if (invoice.issqnSuspended) {
      const scope = document.getElementById("pnlOperacaoTributavel");
      const required = scope?.querySelectorAll("input[required], input[data-val-required], select[required], select[data-val-required]") || [];
      const missing = Array.from(required).some((field) => {
        const shown = visible(field) || visible(document.getElementById(field.id + "_chosen"));
        return shown && !field.disabled && !field.matches("[type=radio],[type=checkbox],[type=hidden]") && !field.value.trim();
      });
      if (missing) throw new Error("Preencha os dados da suspensão da exigibilidade do ISSQN");
    }
    const next = advanceButton("Valores_ValorServico", valuesPath, "Valores");
    const armed = await update("review", "Preenchimento concluído. Revise a nota e decida quando emitir.");
    if (!armed || !valuesPath.test(location.pathname)) throw new Error("Transição para revisão");
    watchAdvance(valuesPath, next, "Valores", invoice);
  }

  function report(error, invoice = null) {
    if (stopped || error.name === "AbortError") return Promise.resolve(null);
    const draft = invoice && draftId();
    const health = portalHealth();
    const detail = health?.message || error.message;
    return update("error", "Não consegui concluir. " + detail, draft ? {
      invoice, invoiceDraft: draft, retryStep: peoplePath.test(location.pathname) ? "people" : valuesPath.test(location.pathname) ? "values" : "service"
    } : {});
  }

  async function retryCurrentStage() {
    if (running) return;
    const inValues = valuesPath.test(location.pathname);
    if (!inValues && !servicePath.test(location.pathname)) return;
    const health = portalHealth();
    if (health && ["session", "captcha"].includes(health.kind)) throw portalFailure("Retomada");
    const state = await chrome.runtime.sendMessage({type:"nfse:status"});
    if (state?.phase !== "error" || state.until <= Date.now() || !draftId() || state.visualDraft !== draftId() ||
        (state.invoice && (state.invoiceDraft !== draftId() || !validInvoice(state.invoice)))) {
      throw new Error("Abra o painel da extensão para iniciar nesta nota. Não há uma recuperação válida para este rascunho.");
    }
    const invoice = state.invoice || null;
    running = true;
    try { await (inValues ? fillValues(invoice) : fillService(invoice)); }
    catch (error) { await report(error, invoice); }
    finally { running = false; }
  }

  async function resume() {
    if (stopped) return;
    await checkRemoteControl();
    if (stopped) return;
    const inValues = valuesPath.test(location.pathname);
    if (!inValues && !servicePath.test(location.pathname) && !peoplePath.test(location.pathname)) {
      const state = await chrome.runtime.sendMessage({type:"nfse:status"});
      if (state?.phase === "review" && state.until > Date.now() && state.visualDraft &&
          state.visualDraft === draftId() && !document.querySelector("input[type=password]")) {
        guide.show("review-ready", "Preenchimento concluído. Confira os dados e confirme a emissão no portal.");
        chrome.runtime.sendMessage({type:"nfse:remote-result"}).catch(()=>{});
      }
      return;
    }
    if (running || (!inValues && !servicePath.test(location.pathname))) return;
    running = true;
    let invoice = null;
    try {
      let flow = await chrome.runtime.sendMessage({ type: inValues ? "nfse:claim-values" : "nfse:claim" });
      if (!flow) flow = await chrome.runtime.sendMessage({ type: "nfse:recover" });
      if (flow?.recovered && !validInvoice(flow.invoice)) throw new Error("Os dados guardados não permitem retomar este rascunho. Abra o painel da extensão.");
      if (flow?.recovered) showStatus(inValues ? "values" : "service", "Retomando o mesmo rascunho após a interrupção…");
      invoice = validInvoice(flow?.invoice) ? flow.invoice : null;
      if (flow) await (inValues ? fillValues(invoice) : fillService(invoice));
      else {
        const state = await chrome.runtime.sendMessage({type:"nfse:status"});
        if (state?.phase === "error" && state.until > Date.now() && state.visualDraft === draftId()) guide.show("error", state.text);
        else if (["service", "values"].includes(state?.phase) && state.visualDraft === draftId() && state.until > Date.now()) {
          await report(new Error("A retomada automática não está disponível. Confira os dados e use Tentar novamente nesta etapa"), validInvoice(state.invoice) ? state.invoice : null);
        }
      }
    } catch (error) {
      await report(error, invoice);
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _, respond) => {
    if (message.type === "nfse:stop") {
      if (running && activeRemoteJobId !== message.jobId) { respond({stopped:false}); return; }
      stopped = true;
      clearTimeout(controlTimer);
      guide.show("error","Preenchimento interrompido pelo celular. Confira os dados já preenchidos no portal.");
      respond({stopped:true});
      return;
    }
    if (message.type === "nfse:start-service" || message.type === "nfse:start-values") {
      const inValues = message.type === "nfse:start-values";
      if (running || !(inValues ? valuesPath : servicePath).test(location.pathname)) {
        respond({ ok: false });
        return;
      }
      running = true;
      stopped = false; activeRemoteJobId = null;
      respond({ ok: true });
      let invoice = null;
      (async () => {
        await chrome.runtime.sendMessage({type:"nfse:manual-begin"});
        const state = await chrome.runtime.sendMessage({ type: "nfse:status" });
        if (state?.until > Date.now() && state.retryStep === (inValues ? "values" : "service") &&
            state.invoiceDraft === draftId() && validInvoice(state.invoice)) invoice = state.invoice;
        await (inValues ? fillValues(invoice) : fillService(invoice));
      })().catch((error) => report(error, invoice)).finally(() => { running = false; }).catch(() => {});
      return;
    }
    if (message.type !== "nfse:start") return;
    if (running || !peoplePath.test(location.pathname) || !/^\d{14}$/.test(message.cnpj) || !validInvoice(message.invoice)) {
      respond({ ok: false });
      return;
    }
    running = true;
    stopped = false; activeRemoteJobId = message.jobId || null;
    let replied = false;
    (async () => {
      if (message.jobId) await checkRemoteControl();
      else await chrome.runtime.sendMessage({type:"nfse:manual-begin"});
      ensureRunning();
      const state = await update("people", "Preenchendo Pessoas e pesquisando o CNPJ…", { invoice: message.invoice, invoiceDraft: draftId() });
      if (!state) throw new Error("Início do preenchimento");
      showStatus("people", "Conferindo os dados do emitente…");
      await prepareIssuer();
      respond({ ok: true });
      replied = true;
      // Permite que o Chrome conclua o fechamento do painel antes das pesquisas.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fillPeople(message.cnpj, message.invoice);
    })().catch(async (error) => {
      if (!replied) respond({ ok: false, error: error.message });
      await report(error, message.invoice);
    }).finally(() => {
      running = false;
      resume().catch(() => {});
    }).catch(() => {});
    return true;
  });
  window.addEventListener("pageshow", () => resume().catch(() => {}));
  resume().catch(() => {});
  let connectingPC = false;
  async function reconnectPC() {
    if (!peoplePath.test(location.pathname) || document.hidden || running || connectingPC) return;
    connectingPC = true;
    try {
      await chrome.runtime.sendMessage({type:"nfse:connect-pc"});
    } catch {}
    finally { connectingPC = false; }
  }
  window.addEventListener("pageshow", reconnectPC);
  document.addEventListener("visibilitychange", reconnectPC);
  setInterval(reconnectPC, 5000);
  reconnectPC();
})();

// Portal certificate entry
(() => {
  if (location.origin !== "https://www.nfse.gov.br") return;
  const match = location.hash.match(/^#nfse-connect=([a-f0-9]{64})(?:&port=(\d{5}))?$/);
  let bridgeKey = match?.[1];
  if (match) history.replaceState(null, "", location.pathname + location.search);
  let checking = false;
  async function continueEntry() {
    if (checking) return;
    checking = true;
    try {
      const state = await chrome.runtime.sendMessage({
        type: "nfse:portal-entry",
        ...(bridgeKey ? { bridgeKey, bridgePort: match[2] ? Number(match[2]) : 17846 } : {}),
      });
      bridgeKey = null;
      if (!state?.active) return;
      const path = location.pathname.replace(/\/$/, "");
      if (/^\/EmissorNacional\/DPS\/Pessoas$/i.test(path)) {
        await chrome.runtime.sendMessage({ type: "nfse:connect-pc" });
        return;
      }
      if (/^\/EmissorNacional\/Login$/i.test(path)) {
        const link = document.querySelector('a[href="https://certificado.nfse.gov.br/EmissorNacional/Certificado"]');
        if (link && !link.dataset.nfseOpening) {
          link.dataset.nfseOpening = "true";
          link.click();
        }
        return;
      }
      if (state.command !== "open-invoice" || !/^\/EmissorNacional(?:\/Dashboard|\/Home(?:\/Index)?)?$/i.test(path)) return;
      const peopleLinks = Array.from(document.querySelectorAll("a[href]")).filter((link) => {
        const url = new URL(link.href, location.href);
        return url.origin === location.origin &&
          /^\/EmissorNacional\/DPS\/Pessoas\/?$/i.test(url.pathname);
      });
      const peopleLink = peopleLinks.find((link) => /Nova NFS-e - Emissão Completa/i.test(link.getAttribute?.("data-original-title") || link.title || "")) || peopleLinks[0];
      if (peopleLink && !peopleLink.dataset.nfseOpening) {
        peopleLink.dataset.nfseOpening = "true";
        peopleLink.click();
      }
    } catch {}
    finally { checking = false; }
  }
  continueEntry();
  window.addEventListener("pageshow", continueEntry);
  let entryAttempts = 0;
  const entryTimer = setInterval(() => {
    if (++entryAttempts >= 20) clearInterval(entryTimer);
    continueEntry();
  }, 1500);
  window.addEventListener("pagehide", () => clearInterval(entryTimer), {once:true});
})();

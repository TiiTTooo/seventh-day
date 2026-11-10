/* Seventh Day: site público. Dados vêm do banco (Supabase). */
const sb = supabase.createClient(SD_CONFIG.url, SD_CONFIG.key);

const BG = { claro: "fotos/bg-claro.jpg", interior: "fotos/bg-interior.jpg", cadeiras: "fotos/bg-cadeiras.jpg", maquinas: "fotos/bg-maquinas.jpg" };
const FAQ = [
  ["Preciso agendar ou posso chegar?", "Pode chegar, mas com agendamento você não espera. Encaixes dependem da agenda do dia."],
  ["E se eu me atrasar?", "Seguramos o horário por 10 minutos. Depois disso pode ser preciso remarcar."],
  ["Como remarco ou cancelo?", "Chame no WhatsApp com pelo menos 2 horas de antecedência."],
  ["Os preços são fixos?", "São valores iniciais. Cabelos mais longos ou volumosos podem ter acréscimo. Pergunte no WhatsApp."],
  ["Abre aos sábados?", "Não. Aos sábados o salão fica fechado. Atendemos aos domingos, das 10h às 17h."],
  ["Atendem mulheres e crianças?", "Sim. Temos serviços masculinos e femininos, e cortamos o cabelo das crianças também."]
];

/* estado carregado do banco */
let CFG = null, SERV = [], EQUIPE = [], GAL = [], FACHADA = null, OCUP = [];

/* ===================== utilidades ===================== */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtMin = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const fmtDur = m => m < 60 ? m + " min" : Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "min" : "");
const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const money = v => "R$ " + Number(v).toFixed(0);
const from = v => "a partir de R$ " + Number(v).toFixed(0);
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WDL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const svc = id => SERV.find(s => s.id === id);
const pro = id => EQUIPE.find(b => b.id === id);
const initials = n => n.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const waLink = (num, txt) => "https://wa.me/" + num + "?text=" + encodeURIComponent(txt);
const avatar = (b, cls = "avatar") => b.foto_url ? `<span class="${cls} ph"><img src="${esc(b.foto_url)}" alt=""></span>` : `<span class="${cls}">${esc(initials(b.nome))}</span>`;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 3000); }
function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

/* ===================== dados ===================== */
async function carregar() {
  const [c, s, e, g] = await Promise.all([
    sb.from("config").select("*").eq("id", 1).single(),
    sb.from("servicos").select("*").eq("ativo", true).order("ordem"),
    sb.from("equipe").select("id,nome,descricao,foto_url,ativo,atende,ordem").eq("ativo", true).eq("atende", true).order("ordem"),
    sb.from("galeria").select("*").order("ordem")
  ]);
  const err = c.error || s.error || e.error || g.error;
  if (err) throw err;
  CFG = c.data; SERV = s.data; EQUIPE = e.data;
  GAL = g.data.filter(x => x.secao === "trabalhos");
  FACHADA = g.data.find(x => x.secao === "fachada");
  await carregarOcupados();
}
async function carregarOcupados() {
  const hoje = new Date(), fim = new Date(); fim.setDate(fim.getDate() + (CFG?.dias_abertos || 14));
  const { data, error } = await sb.rpc("horarios_ocupados", { p_de: dkey(hoje), p_ate: dkey(fim) });
  if (error) throw error;
  OCUP = data || [];
}

/* ================ disponibilidade ================ */
function hoursFor(k) { const h = CFG.horarios[String(fromKey(k).getDay())]; return Array.isArray(h) ? h : null; }
function busy(k, pid) { return OCUP.filter(o => o.data === k && (o.profissional_id === pid || o.profissional_id === null)).map(o => [o.inicio, o.fim]); }
function freeSlots(k, pid, dur) {
  const h = hoursFor(k); if (!h) return [];
  const open = toMin(h[0]), close = toMin(h[1]);
  const min = k === dkey(new Date()) ? nowMin() + CFG.antecedencia : 0;
  const b = busy(k, pid), out = [];
  for (let t = open; t + dur <= close; t += CFG.intervalo) {
    if (t < min) continue;
    if (b.some(([s, e]) => t < e && t + dur > s)) continue;
    out.push(t);
  }
  return out;
}
function freeSlotsAny(k, dur) {
  const map = new Map();
  EQUIPE.forEach(br => freeSlots(k, br.id, dur).forEach(t => { if (!map.has(t)) map.set(t, br.id); }));
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/* ===================== site ===================== */
function renderSite() {
  $("#waHero").href = waLink(CFG.whatsapp, "Olá! Vim pelo site e gostaria de informações.");
  $("#phoneTxt").textContent = CFG.whatsapp_txt || "";
  $("#fixoTxt").textContent = CFG.telefone || "";
  $("#igLink").textContent = "@" + CFG.instagram; $("#igLink").href = "https://instagram.com/" + CFG.instagram;
  $("#addr").textContent = CFG.endereco || "";
  $("#mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(CFG.maps_query || CFG.endereco || "");
  $("#rating").href = $("#mapLink").href;
  $("#footName").textContent = "© " + new Date().getFullYear() + " " + CFG.nome_completo;

  const cats = [...new Set(SERV.map(s => s.categoria))];
  $("#menu").innerHTML = cats.map(c => `<div><h3>${esc(c)}</h3>${
    SERV.filter(s => s.categoria === c).map(s => `<div class="item" data-svc="${s.id}" role="button" tabindex="0" aria-label="Agendar ${esc(s.nome)}"><div><div class="n">${esc(s.nome)}</div><div class="d">${fmtDur(s.duracao)}${s.obs ? " · " + esc(s.obs) : ""}</div></div><span class="fill"></span><span class="p"><small class="apd">a partir de</small>${money(s.preco)}</span><span class="agbtn" aria-hidden="true">Agendar</span></div>`).join("")
  }</div>`).join("") || `<p class="loading">Nenhum serviço disponível no momento.</p>`;

  $("#marquee").innerHTML = [...GAL, ...GAL].map(g => `<img src="${esc(g.url)}" alt="">`).join("");
  $("#gallery").innerHTML = GAL.map((g, i) => `<button class="gitem" data-g="${i}" aria-label="Ampliar: ${esc(g.legenda)}"><img src="${esc(g.url)}" alt="${esc(g.legenda)}"><span class="cap" aria-hidden="true">${esc(g.legenda)}</span></button>`).join("");
  $("#gallery").querySelectorAll("[data-g]").forEach(b => b.onclick = () => { const g = GAL[+b.dataset.g]; openModal(`<img src="${esc(g.url)}" alt="" style="width:100%;border-radius:4px"><p style="margin-top:10px">${esc(g.legenda)}</p><div style="text-align:right;margin-top:12px"><button class="btn btn-dark" id="mclose">Fechar</button></div>`); $("#mclose").onclick = closeModal; });
  if (FACHADA) $("#fachada").src = FACHADA.url; else $("#fachada").remove();

  $("#faq").innerHTML = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  $("#team").innerHTML = EQUIPE.map(b => `<div class="barber">${avatar(b)}<h4>${esc(b.nome)}</h4><p>${esc(b.descricao)}</p><button class="btn btn-ghost btn-sm agb" data-barber="${b.id}">Agendar com ${esc(b.nome.split(" ")[0])}</button></div>`).join("");

  const today = new Date().getDay();
  $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => { const h = CFG.horarios[String(d)]; return `<div class="${d === today ? "today" : ""}"><span>${WDL[d]}</span><span>${Array.isArray(h) ? h[0] + " às " + h[1] : "Fechado"}</span></div>`; }).join("");
  renderStatus();
  setupReveal();
}
function renderStatus() {
  const now = new Date(), h = CFG.horarios[String(now.getDay())], m = nowMin();
  const open = Array.isArray(h) && m >= toMin(h[0]) && m < toMin(h[1]);
  $("#statusDot").classList.toggle("on", !!open);
  $("#statusText").textContent = open ? "Aberto agora" : "Fechado agora";
  if (open) $("#statusSub").textContent = "Fecha às " + h[1];
  else for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() + i); const hh = CFG.horarios[String(d.getDay())];
    if (!Array.isArray(hh)) continue; if (i === 0 && m >= toMin(hh[0])) continue;
    $("#statusSub").textContent = "Abre " + (i === 0 ? "hoje" : i === 1 ? "amanhã" : WDL[d.getDay()].toLowerCase()) + " às " + hh[0]; break; }
  const base = SERV[0];
  if (!base || !EQUIPE.length) return;
  for (let i = 0; i < CFG.dias_abertos; i++) {
    const d = new Date(); d.setDate(d.getDate() + i); const s = freeSlotsAny(dkey(d), base.duracao);
    if (s.length) { $("#nextSlot").textContent = (i === 0 ? "Hoje" : i === 1 ? "Amanhã" : WD[d.getDay()] + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1)) + ", " + fmtMin(s[0][0]);
      $("#nextSlotWho").textContent = "com " + pro(s[0][1]).nome + " · " + base.nome.toLowerCase(); return; }
  }
  $("#nextSlot").textContent = "Agenda cheia"; $("#nextSlotWho").textContent = "Chame no WhatsApp para um encaixe";
}

/* ===================== agendamento ===================== */
let B;
const KEY = "seventhday_cliente";
async function openBooking(pre) {
  pre = (pre && typeof pre === "object" && !pre.type) ? pre : {};
  if (!CFG) return;
  B = { step: 0, services: [], barberId: "any", date: null, slot: null, slotBarber: null, name: "", phone: "", sending: false, busca: "" };
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) { B.name = saved.name; B.phone = saved.phone; } } catch (e) {}
  if (pre.svc) { B.services = [pre.svc]; B.step = 1; }
  if (pre.barber) B.barberId = pre.barber;
  $("#bookOverlay").classList.remove("hidden"); document.body.style.overflow = "hidden";
  renderStep(1);
  setTimeout(() => $("#bookClose").focus(), 50);
  try { await carregarOcupados(); if (B.step === 2) renderStep(0); } catch (e) {}
}
function closeBooking() { $("#bookOverlay").classList.add("hidden"); document.body.style.overflow = ""; renderStatus(); }
const totDur = () => B.services.reduce((a, id) => a + svc(id).duracao, 0);
const totPrice = () => B.services.reduce((a, id) => a + Number(svc(id).preco), 0);
function getSlots(k) { const dur = totDur(); return B.barberId === "any" ? freeSlotsAny(k, dur) : freeSlots(k, B.barberId, dur).map(t => [t, B.barberId]); }

function renderStep(dir) {
  const bb = $("#bookBody"); if (dir) { bb.classList.remove("stepin", "stepback"); void bb.offsetWidth; bb.classList.add(dir === -1 ? "stepback" : "stepin"); }
  [...$("#stepsBar").children].forEach((s, i) => s.classList.toggle("on", i <= B.step));
  $("#stepsBar").classList.toggle("hidden", B.step > 3);
  const body = $("#bookBody"), foot = $("#bookFoot");
  const back = B.step > 0 && B.step < 4 ? `<button class="btn btn-ghost" id="bk">Voltar</button>` : `<span></span>`;

  if (B.step === 0) {
    const norm = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    body.innerHTML = `<h4>O que você vai fazer?</h4><p class="hint">Pode escolher mais de um. O tempo é somado.</p>
      <div class="svc-search" role="search"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="svcQ" type="search" autocomplete="off" placeholder="Buscar serviço (ex.: barba, escova, progressiva)" aria-label="Buscar serviço" value="${esc(B.busca || "")}"><button type="button" class="svc-clear hidden" id="svcClr" aria-label="Limpar busca">×</button></div>
      <div id="svcList">` +
      [...new Set(SERV.map(s => s.categoria))].map(c => `<div class="optcat">${esc(c)}</div>` + SERV.filter(s => s.categoria === c).map(s => `<button class="opt ${B.services.includes(s.id) ? "sel" : ""}" data-s="${s.id}" data-q="${esc(norm(s.nome + " " + s.categoria + " " + (s.obs || "")))}" aria-pressed="${B.services.includes(s.id)}"><span>${esc(s.nome)}<small>${fmtDur(s.duracao)}${s.obs ? " · " + esc(s.obs) : ""}</small></span><span class="p">${money(s.preco)}</span></button>`).join("")).join("") +
      `</div><div class="empty hidden" id="svcNone" role="status">Nenhum serviço encontrado. Fale com o salão pelo WhatsApp.</div>`;
    const q = $("#svcQ"), clr = $("#svcClr");
    const filtra = () => {
      B.busca = q.value; const t = norm(q.value.trim()); let vis = 0, cat = null, catVis = 0;
      const fecha = () => { if (cat) cat.classList.toggle("hidden", !catVis); };
      [...$("#svcList").children].forEach(el => {
        if (el.classList.contains("optcat")) { fecha(); cat = el; catVis = 0; return; }
        const ok = !t || el.dataset.q.includes(t); el.classList.toggle("hidden", !ok); if (ok) { vis++; catVis++; }
      });
      fecha();
      $("#svcNone").classList.toggle("hidden", vis > 0);
      clr.classList.toggle("hidden", !q.value);
    };
    q.oninput = filtra;
    clr.onclick = () => { q.value = ""; filtra(); q.focus(); };
    filtra();
    body.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { const id = b.dataset.s; B.services = B.services.includes(id) ? B.services.filter(x => x !== id) : [...B.services, id]; renderStep(); });
    foot.innerHTML = `<span style="align-self:center;font-weight:600">${B.services.length ? fmtDur(totDur()) + " · " + from(totPrice()) : "Nenhum serviço escolhido"}</span><button class="btn btn-dark" id="nx" ${B.services.length ? "" : "disabled"}>Continuar</button>`;
  }
  if (B.step === 1) {
    body.innerHTML = `<div class="chosen"><span>${esc(B.services.map(id => svc(id).nome).join(" + "))} · ${fmtDur(totDur())} · ${from(totPrice())}</span><button class="linkbtn2" id="addSvc">Alterar serviços</button></div><h4>Com quem?</h4><p class="hint">Sem preferência mostra mais horários.</p>` +
      [{ id: "any", nome: "Sem preferência", descricao: "Primeiro profissional livre" }, ...EQUIPE].map(b => `<button class="opt optb ${B.barberId === b.id ? "sel" : ""}" data-b="${b.id}">${b.id === "any" ? '<span class="avatar mini any">?</span>' : avatar(b, "avatar mini")}<span class="grow">${esc(b.nome)}<small>${esc(b.descricao)}</small></span></button>`).join("");
    body.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { B.barberId = b.dataset.b; B.slot = null; B.date = null; B.step = 2; renderStep(1); });
    $("#addSvc").onclick = () => { B.step = 0; renderStep(-1); };
    foot.innerHTML = back + `<span></span>`;
  }
  if (B.step === 2) {
    const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const tEnd = new Date(t0); tEnd.setDate(tEnd.getDate() + CFG.dias_abertos);
    const todayK = dkey(t0), minK = todayK, maxK = dkey(tEnd);
    const mkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1);
    const minM = mkey(t0), maxM = mkey(tEnd);
    const cnt = {}; const nOf = k => (k in cnt ? cnt[k] : (cnt[k] = k >= minK && k <= maxK ? getSlots(k).length : 0));
    if (!B.date) {
      let first = null; for (let i = 0; i <= CFG.dias_abertos; i++) { const d = new Date(t0); d.setDate(d.getDate() + i); if (nOf(dkey(d))) { first = dkey(d); break; } }
      B.date = first || todayK; B.calMonth = B.date.slice(0, 7);
    }
    if (!B.calMonth || B.calMonth < minM || B.calMonth > maxM) B.calMonth = B.date.slice(0, 7);
    const [cy, cm] = B.calMonth.split("-").map(Number);
    const first = new Date(cy, cm - 1, 1), nDays = new Date(cy, cm, 0).getDate();
    const prevOk = B.calMonth > minM, nextOk = B.calMonth < maxM;
    const longDay = d => `${WDL[d.getDay()]}, ${d.getDate()} de ${MES[d.getMonth()]}`;
    let cells = ""; for (let i = 0; i < first.getDay(); i++) cells += `<span class="cal-pad" aria-hidden="true"></span>`;
    for (let dd = 1; dd <= nDays; dd++) {
      const d = new Date(cy, cm - 1, dd), k = dkey(d), n = nOf(k), sel = k === B.date;
      const lbl = `${longDay(d)}, ${n ? n + (n === 1 ? " horário livre" : " horários livres") : "sem horários"}`;
      cells += `<button type="button" class="cal-d${sel ? " sel" : ""}${k === todayK ? " today" : ""}${n ? " has" : ""}" data-d="${k}" ${n ? "" : "disabled"} aria-pressed="${sel}" aria-label="${lbl}">${dd}</button>`;
    }
    const slots = getSlots(B.date), sd = fromKey(B.date);
    body.innerHTML = `<h4>Quando?</h4><p class="hint">${fmtDur(totDur())} reservados${B.barberId !== "any" ? " com " + esc(pro(B.barberId).nome) : ""}.</p>
      <div class="cal">
        <div class="cal-head"><button type="button" class="cal-nav" id="calPrev" aria-label="Mês anterior" ${prevOk ? "" : "disabled"}>&#8249;</button><b aria-live="polite">${MES[cm - 1][0].toUpperCase() + MES[cm - 1].slice(1)} ${cy}</b><button type="button" class="cal-nav" id="calNext" aria-label="Próximo mês" ${nextOk ? "" : "disabled"}>&#8250;</button></div>
        <div class="cal-wd" aria-hidden="true">${WD.map(w => `<span>${w}</span>`).join("")}</div>
        <div class="cal-grid">${cells}</div>
      </div>
      <div class="cal-day">${esc(longDay(sd))}</div>
      ${slots.length ? `<div class="slots">${slots.map(([t, bid]) => `<button class="slot ${B.slot === t ? "sel" : ""}" data-t="${t}" data-bid="${bid}">${fmtMin(t)}</button>`).join("")}</div>` : `<div class="empty">Sem horários neste dia. Escolha outro dia ou chame no WhatsApp para um encaixe.</div>`}`;
    const shiftM = s => { const d = new Date(cy, cm - 1 + s, 1); B.calMonth = mkey(d); renderStep(); };
    $("#calPrev").onclick = () => prevOk && shiftM(-1);
    $("#calNext").onclick = () => nextOk && shiftM(1);
    body.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { B.date = b.dataset.d; B.slot = null; renderStep(); });
    body.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { B.slot = +b.dataset.t; B.slotBarber = b.dataset.bid; renderStep(); });
    foot.innerHTML = back + `<button class="btn btn-dark" id="nx" ${B.slot !== null ? "" : "disabled"}>Continuar</button>`;
  }
  if (B.step === 3) {
    const d = fromKey(B.date);
    body.innerHTML = `<h4>Seus dados</h4><p class="hint">Usamos o WhatsApp só para confirmar e lembrar do horário.</p>
      <label for="fn">Nome</label><input id="fn" autocomplete="name" maxlength="80" value="${esc(B.name)}">
      <label for="fp">WhatsApp</label><input id="fp" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" value="${esc(B.phone)}">
      <div class="err hidden" id="ferr"></div>
      <div class="summary">
        ${B.services.map(id => `<div><span>${esc(svc(id).nome)}</span><span>${money(svc(id).preco)}</span></div>`).join("")}
        <div><span>Profissional</span><span>${esc(pro(B.slotBarber).nome)}</span></div>
        <div><span>Dia</span><span>${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${fmtMin(B.slot)}</span></div>
        <div class="tot"><span>Total estimado (pago no salão)</span><span>${from(totPrice())}</span></div>
      </div>`;
    foot.innerHTML = back + `<button class="btn btn-brass" id="nx">Confirmar agendamento</button>`;
  }
  if (B.step === 4) {
    const d = fromKey(B.date), br = pro(B.slotBarber);
    const msg = `Olá! Agendei pelo site:\n${B.services.map(id => svc(id).nome).join(" + ")}\n${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${fmtMin(B.slot)} com ${br.nome}\nNome: ${B.name}`;
    body.innerHTML = `<div class="done"><div class="big">Agendado</div>
      <p style="margin-top:12px;font-size:19px">${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às <b>${fmtMin(B.slot)}</b> com ${esc(br.nome)}</p>
      <p class="hint" style="margin-top:8px">${esc(B.services.map(id => svc(id).nome).join(" + "))} · ${from(totPrice())}</p>
      <p style="margin-top:24px"><a class="btn btn-brass" href="${waLink(CFG.whatsapp, msg)}" target="_blank" rel="noopener">Enviar confirmação no WhatsApp</a></p>
      <p class="hint" style="margin-top:12px">Precisa remarcar? Fale com o salão pelo WhatsApp ${esc(CFG.whatsapp_txt)}.</p></div>`;
    foot.innerHTML = `<span></span><button class="btn btn-dark" id="fin">Fechar</button>`;
  }
  const bk = $("#bk"); if (bk) bk.onclick = () => { B.step--; renderStep(-1); };
  const fin = $("#fin"); if (fin) fin.onclick = closeBooking;
  const nx = $("#nx"); if (nx) nx.onclick = next;
}
async function next() {
  if (B.step === 3) {
    if (B.sending) return;
    const name = $("#fn").value.trim(), phone = $("#fp").value.replace(/\D/g, ""), err = $("#ferr");
    const show = m => { err.textContent = m; err.classList.remove("hidden"); };
    if (name.length < 2) { show("Digite seu nome."); $("#fn").focus(); return; }
    if (phone.length < 10 || phone.length > 11) { show("Digite o WhatsApp com DDD, ex.: (11) 99999-9999."); $("#fp").focus(); return; }
    B.name = name; B.phone = phone; B.sending = true;
    const nx = $("#nx"); nx.disabled = true; nx.textContent = "Confirmando…";
    const { error } = await sb.rpc("criar_agendamento", { p_data: B.date, p_inicio: B.slot, p_profissional: B.slotBarber, p_servicos: B.services, p_nome: name, p_tel: phone });
    B.sending = false;
    if (error) {
      nx.disabled = false; nx.textContent = "Confirmar agendamento";
      show(error.message || "Não foi possível agendar. Tente de novo ou chame no WhatsApp.");
      carregarOcupados().catch(() => {});
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify({ name, phone })); } catch (e) {}
    carregarOcupados().catch(() => {});
  }
  B.step++; renderStep(1);
}
document.querySelectorAll("[data-book]").forEach(b => b.addEventListener("click", () => openBooking()));
document.addEventListener("click", e => {
  const it = e.target.closest("[data-svc]"); if (it) { openBooking({ svc: it.dataset.svc }); return; }
  const br = e.target.closest("[data-barber]"); if (br) openBooking({ barber: br.dataset.barber });
});
document.addEventListener("keydown", e => {
  const it = e.target.closest && e.target.closest(".item[data-svc]");
  if (it && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openBooking({ svc: it.dataset.svc }); }
  if (e.key === "Escape") { if (!$("#modal").classList.contains("hidden")) closeModal(); else if (!$("#bookOverlay").classList.contains("hidden")) closeBooking(); }
});
$("#bookClose").onclick = closeBooking;
$("#bookOverlay").addEventListener("click", e => { if (e.target.id === "bookOverlay") closeBooking(); });

function openModal(html) { $("#modalBox").innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

/* ===================== movimento ===================== */
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (MOTION) document.documentElement.classList.add("m");
let io;
function setupReveal() {
  if (!MOTION || !("IntersectionObserver" in window)) return;
  io = io || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -40px 0px" });
  const groups = ["section.block h2", ".intro", ".menu > div", ".item", "#gallery .gitem", ".barber", ".faq details", ".info-grid > div", ".band-in"];
  groups.forEach(sel => document.querySelectorAll(sel).forEach(el => {
    if (el.dataset.rv) return;
    const sib = [...el.parentNode.children].filter(c => c.matches(sel)); const i = sib.indexOf(el);
    el.dataset.rv = "1"; el.style.transitionDelay = Math.min(i, 8) * 70 + "ms"; io.observe(el);
  }));
}
const topEl = $(".top");
const para = [...document.querySelectorAll(".band-bg,.info-bg,.lit-bg")];
let ticking = false;
window.addEventListener("scroll", () => {
  topEl.classList.toggle("scrolled", scrollY > 20);
  if (MOTION && !ticking) { ticking = true; requestAnimationFrame(() => { para.forEach(el => { const r = el.parentNode.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { const k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; el.style.transform = `translateY(${(-k * 70).toFixed(1)}px)`; } }); ticking = false; }); }
}, { passive: true });

/* ===================== início ===================== */
document.querySelectorAll(".lit-bg").forEach(el => el.style.backgroundImage = `url(${BG[el.dataset.bg]})`);
$("#heroBg").style.backgroundImage = `url(${BG.interior})`;
$("#bandBg").style.backgroundImage = `url(${BG.maquinas})`;
$("#infoBg").style.backgroundImage = `url(${BG.cadeiras})`;
setupReveal();
carregar().then(renderSite).catch(err => {
  console.error(err);
  $("#menu").innerHTML = `<div class="err-box">Não foi possível carregar os serviços agora. Agende pelo WhatsApp (11) 98386-7901.</div>`;
});
setInterval(() => { if (CFG) renderStatus(); }, 60000);

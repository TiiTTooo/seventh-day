/* Seventh Day: painel da equipe */
const sb = supabase.createClient(SD_CONFIG.url, SD_CONFIG.key);

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtMin = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const money = v => "R$ " + Number(v || 0).toFixed(0);
const WDL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = n => String(n || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
const avatar = (b, cls = "avatar") => b.foto_url ? `<span class="${cls} ph"><img src="${esc(b.foto_url)}" alt=""></span>` : `<span class="${cls}">${esc(initials(b.nome))}</span>`;
const waLink = (num, txt) => "https://wa.me/" + num + "?text=" + encodeURIComponent(txt);
const fmtTel = t => t && t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : (t || "");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 3200); }
function openModal(html) { $("#modalBox").innerHTML = html; $("#modal").classList.remove("hidden"); const f = $("#modalBox").querySelector("input,select"); if (f) f.focus(); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
const show = id => ["login", "noAccess", "app"].forEach(x => $("#" + x).classList.toggle("hidden", x !== id));
const fail = (err, fallback) => toast((err && err.message) ? traduz(err.message) : fallback);
function traduz(m) {
  if (/convite_invalido|Database error saving new user/i.test(m)) return "Código de convite inválido ou vencido, ou o e-mail não é o mesmo cadastrado pelo dono. Peça um código novo.";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem acesso. Use Entrar ou Esqueci minha senha.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/violates foreign key/i.test(m)) return "Não dá para apagar: existe agendamento ligado a isso. Desative em vez de apagar.";
  if (/row-level security/i.test(m)) return "Você não tem permissão para isso.";
  return m;
}

/* ===================== login ===================== */
let modo = "entrar";
document.querySelectorAll(".tabs-mini button").forEach(b => b.onclick = () => {
  modo = b.dataset.mode;
  document.querySelectorAll(".tabs-mini button").forEach(x => x.classList.toggle("on", x === b));
  $("#lBtn").textContent = modo === "entrar" ? "Entrar" : "Criar minha senha";
  $("#loginHint").textContent = modo === "entrar" ? "Entre com o e-mail cadastrado pelo dono do salão." : "Use o e-mail que o dono cadastrou na equipe, o código de convite que ele te mandou e escolha uma senha de pelo menos 8 caracteres. Depois confirme pelo link que chega no e-mail.";
  $("#codeBox").classList.toggle("hidden", modo === "entrar");
  $("#lPass").autocomplete = modo === "entrar" ? "current-password" : "new-password";
  $("#lErr").classList.add("hidden"); $("#lOk").classList.add("hidden");
});
async function doLogin() {
  const email = $("#lEmail").value.trim().toLowerCase(), pass = $("#lPass").value;
  const err = $("#lErr"), ok = $("#lOk"); err.classList.add("hidden"); ok.classList.add("hidden");
  if (!email || pass.length < 8) { err.textContent = "Digite o e-mail e uma senha com pelo menos 8 caracteres."; err.classList.remove("hidden"); return; }
  $("#lBtn").disabled = true;
  if (modo === "entrar") {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { err.textContent = traduz(error.message); err.classList.remove("hidden"); }
  } else {
    const convite = $("#lCode").value.trim().toUpperCase();
    if (convite.length < 8) { err.textContent = "Digite o código de convite que o dono do salão te mandou."; err.classList.remove("hidden"); $("#lBtn").disabled = false; return; }
    const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname, data: { convite } } });
    if (error) { err.textContent = traduz(error.message); err.classList.remove("hidden"); }
    else if (!data.session) { ok.textContent = "Pronto. Abra o e-mail que enviamos, clique no link de confirmação e depois entre aqui."; ok.classList.remove("hidden"); }
  }
  $("#lBtn").disabled = false;
}
$("#lBtn").onclick = doLogin;
$("#lPass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
$("#lForgot").onclick = async () => {
  const email = $("#lEmail").value.trim().toLowerCase();
  if (!email) { $("#lErr").textContent = "Digite seu e-mail acima e clique de novo em Esqueci minha senha."; $("#lErr").classList.remove("hidden"); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) fail(error); else { $("#lOk").textContent = "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha."; $("#lOk").classList.remove("hidden"); }
};
$("#logout").onclick = () => sb.auth.signOut();
$("#noAccessOut").onclick = () => sb.auth.signOut();

/* ===================== sessão ===================== */
let EU = null, MASTER = false, DONO = false, EQUIPE = [], SERV = [], CFG = null;
sb.auth.onAuthStateChange(async (ev, session) => {
  if (ev === "PASSWORD_RECOVERY") {
    openModal(`<h3>Nova senha</h3><label for="np">Nova senha (mínimo 8 caracteres)</label><input id="np" type="password" autocomplete="new-password"><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-dark" id="npok">Salvar senha</button></div>`);
    $("#npok").onclick = async () => { const { error } = await sb.auth.updateUser({ password: $("#np").value }); if (error) fail(error); else { closeModal(); toast("Senha alterada."); } };
  }
  if (!session) { EU = null; $("#userBox").classList.add("hidden"); show("login"); return; }
  setTimeout(() => iniciar(session), 0);
});
let iniciado = false;
async function iniciar(session) {
  const { data, error } = await sb.from("equipe").select("*").eq("user_id", session.user.id).eq("ativo", true).maybeSingle();
  if (error || !data) { show("noAccess"); return; }
  EU = data; MASTER = data.papel === "master"; DONO = MASTER || data.papel === "dono";
  $("#userName").textContent = data.nome.split(" ")[0]; $("#userBox").classList.remove("hidden");
  document.querySelectorAll(".atabs .own").forEach(b => b.classList.toggle("hidden", !DONO));
  ["addBlock", "addWalkin"].forEach(id => $("#" + id).classList.toggle("hidden", !DONO && !EU.atende));
  show("app");
  if (iniciado) return; iniciado = true;
  await carregarBase();
  abrirAba("agenda");
  ouvirNovos();
}
async function carregarBase() {
  const [e, s, c] = await Promise.all([
    sb.from("equipe").select("*").order("ordem"),
    sb.from("servicos").select("*").order("ordem"),
    sb.from("config").select("*").eq("id", 1).single()
  ]);
  EQUIPE = e.data || []; SERV = s.data || []; CFG = c.data;
}

/* ===================== abas ===================== */
document.querySelectorAll(".atabs button").forEach(b => b.onclick = () => abrirAba(b.dataset.tab));
function abrirAba(t) {
  document.querySelectorAll(".atabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("hidden", s.id !== "tab-" + t));
  ({ agenda: renderAgenda, clientes: renderClientes, servicos: renderServicos, equipe: renderEquipe, imagens: renderImagens, config: renderConfig })[t]();
}

/* ===================== agenda ===================== */
let dia = dkey(new Date()), AG = [], BL = [], novos = new Set();
const profs = () => EQUIPE.filter(p => p.ativo && p.atende && (DONO || p.id === EU.id));
const shiftDay = n => { const d = fromKey(dia); d.setDate(d.getDate() + n); dia = dkey(d); renderAgenda(); };
$("#todayBtn").onclick = () => { dia = dkey(new Date()); calMes = null; renderAgenda(); };
let calMes = null, MES = [];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
async function renderMes() {
  const base = calMes ? fromKey(calMes + "-01") : fromKey(dia); base.setDate(1);
  calMes = base.getFullYear() + "-" + pad(base.getMonth() + 1);
  const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const { data } = await sb.from("agendamentos").select("data,status,total,profissional_id").gte("data", dkey(base)).lte("data", dkey(fim));
  MES = data || [];
  const porDia = {}; MES.filter(a => a.status !== "cancelado").forEach(a => porDia[a.data] = (porDia[a.data] || 0) + 1);
  const hoje = dkey(new Date()), cells = [];
  for (let i = 0; i < base.getDay(); i++) cells.push(`<span></span>`);
  for (let d = 1; d <= fim.getDate(); d++) {
    const k = calMes + "-" + pad(d), h = CFG.horarios[String(new Date(base.getFullYear(), base.getMonth(), d).getDay())], n = porDia[k] || 0;
    cells.push(`<button class="mc ${k === dia ? "sel" : ""} ${k === hoje ? "hoje" : ""} ${Array.isArray(h) ? "" : "fech"}" data-k="${k}" aria-pressed="${k === dia}" aria-label="${d} de ${MESES[base.getMonth()]}, ${n} agendamento(s)"><b>${d}</b>${n ? `<i>${n}</i>` : ""}</button>`);
  }
  $("#mcal").innerHTML = `<div class="mch"><button class="btn btn-ghost btn-sm" id="mPrev" aria-label="Mês anterior">‹</button><strong>${MESES[base.getMonth()]} ${base.getFullYear()}</strong><button class="btn btn-ghost btn-sm" id="mNext" aria-label="Próximo mês">›</button></div>
    <div class="mgrid">${["D", "S", "T", "Q", "Q", "S", "S"].map(x => `<small>${x}</small>`).join("")}${cells.join("")}</div>`;
  $("#mPrev").onclick = () => { const d = fromKey(calMes + "-01"); d.setMonth(d.getMonth() - 1); calMes = d.getFullYear() + "-" + pad(d.getMonth() + 1); renderMes(); };
  $("#mNext").onclick = () => { const d = fromKey(calMes + "-01"); d.setMonth(d.getMonth() + 1); calMes = d.getFullYear() + "-" + pad(d.getMonth() + 1); renderMes(); };
  $("#mcal").querySelectorAll("[data-k]").forEach(b => b.onclick = () => { dia = b.dataset.k; renderAgenda(); });
  const act = MES.filter(a => a.status !== "cancelado"), conc = MES.filter(a => a.status === "concluido");
  $("#mstats").innerHTML = `<h4>Mês de ${MESES[base.getMonth()]}</h4>
    <div class="ms"><span>Faturamento previsto</span><b>${money(act.reduce((s, a) => s + Number(a.total), 0))}</b></div>
    <div class="ms"><span>Faturamento concluído</span><b>${money(conc.reduce((s, a) => s + Number(a.total), 0))}</b></div>
    <div class="ms"><span>Agendamentos</span><b>${act.length}</b></div>
    <div class="ms"><span>Atendidos</span><b>${conc.length}</b></div>
    <div class="ms"><span>Faltas</span><b>${MES.filter(a => a.status === "faltou").length}</b></div>
    ${DONO ? profs().map(p => `<div class="ms sub"><span>${esc(p.nome.split(" ")[0])} (concluído)</span><b>${money(conc.filter(a => a.profissional_id === p.id).reduce((s, a) => s + Number(a.total), 0))}</b></div>`).join("") : ""}`;
}

async function renderAgenda() {
  const d = fromKey(dia), h = CFG.horarios[String(d.getDay())];
  $("#adminDate").textContent = WDL[d.getDay()] + ", " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + (Array.isArray(h) ? "" : " · fechado");
  if (!calMes || !dia.startsWith(calMes)) calMes = dia.slice(0, 7);
  renderMes();
  const [a, b] = await Promise.all([
    sb.from("agendamentos").select("*").eq("data", dia).order("inicio"),
    sb.from("bloqueios").select("*").eq("data", dia).order("inicio")
  ]);
  if (a.error) return fail(a.error, "Erro ao carregar a agenda.");
  AG = a.data || []; BL = b.data || [];
  const act = AG.filter(x => x.status !== "cancelado");
  $("#stats").innerHTML = [["Agendamentos", act.length], ["Previsto no dia", money(act.reduce((s, x) => s + Number(x.total), 0))], ["Concluído no dia", money(AG.filter(x => x.status === "concluido").reduce((s, x) => s + Number(x.total), 0))], ["Faltas", AG.filter(x => x.status === "faltou").length]]
    .map(([l, v]) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`).join("");
  $("#cols").innerHTML = profs().map(p => {
    const items = [...AG.filter(x => x.profissional_id === p.id).map(v => ({ k: "a", t: v.inicio, v })), ...BL.filter(x => x.profissional_id === p.id || x.profissional_id === null).map(v => ({ k: "b", t: v.inicio, v }))].sort((x, y) => x.t - y.t);
    return `<div class="col"><h4>${avatar(p)}${esc(p.nome)}</h4>${items.length ? items.map(({ k, v }) => k === "a" ? `
      <div class="appt st-${v.status} ${novos.has(v.id) ? "novo" : ""}">
        <div class="t">${fmtMin(v.inicio)}–${fmtMin(v.inicio + v.duracao)} · ${esc(v.cliente_nome)}</div>
        <div class="s">${esc((v.servicos || []).map(s => s.nome).join(" + "))} · ${money(v.total)}${v.origem === "balcao" ? " · encaixe" : ""}</div>
        ${v.cliente_tel ? `<div class="s">${fmtTel(v.cliente_tel)}</div>` : ""}
        <div class="row">
          <select data-st="${v.id}" aria-label="Situação">${[["confirmado", "Confirmado"], ["concluido", "Concluído"], ["faltou", "Faltou"], ["cancelado", "Cancelado"]].map(([val, l]) => `<option value="${val}" ${v.status === val ? "selected" : ""}>${l}</option>`).join("")}</select>
          ${v.cliente_tel ? `<a target="_blank" rel="noopener" href="${waLink("55" + v.cliente_tel, `Olá ${v.cliente_nome}! Lembrete do seu horário na ${CFG.nome}: ${WDL[d.getDay()].toLowerCase()}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${fmtMin(v.inicio)} com ${p.nome.split(" ")[0]}. Até lá!`)}">Lembrar no WhatsApp</a>` : ""}
          ${DONO ? `<button class="linkbtn" data-move="${v.id}" style="color:var(--ink)">Remarcar</button><button class="linkbtn" data-del="${v.id}">Apagar</button>` : ""}
        </div>
      </div>` : `
      <div class="appt block"><div class="t">${fmtMin(v.inicio)}–${fmtMin(v.fim)} · Bloqueado</div><div class="s">${esc(v.motivo || "Sem motivo")}${v.profissional_id === null ? " · salão todo" : ""}</div>
      ${(DONO || v.profissional_id === EU.id) ? `<div class="row"><button class="linkbtn" data-unb="${v.id}">Liberar horário</button></div>` : ""}</div>`).join("") : `<div class="empty">Agenda livre.</div>`}</div>`;
  }).join("") || `<div class="empty">Nenhum profissional atende pela agenda.</div>`;
  $("#cols").querySelectorAll("[data-st]").forEach(s => s.onchange = async () => { const { error } = await sb.from("agendamentos").update({ status: s.value }).eq("id", s.dataset.st); if (error) fail(error); else { toast("Situação atualizada."); renderAgenda(); } });
  $("#cols").querySelectorAll("[data-unb]").forEach(b => b.onclick = async () => { const { error } = await sb.from("bloqueios").delete().eq("id", b.dataset.unb); if (error) fail(error); else { toast("Horário liberado."); renderAgenda(); } });
  $("#cols").querySelectorAll("[data-del]").forEach(b => b.onclick = () => confirmar("Apagar este agendamento?", "Ele some da agenda e do faturamento. Para manter o histórico, prefira marcar como Cancelado.", "Apagar", async () => { const { error } = await sb.from("agendamentos").delete().eq("id", b.dataset.del); if (error) fail(error); else { toast("Agendamento apagado."); renderAgenda(); } }));
  $("#cols").querySelectorAll("[data-move]").forEach(b => b.onclick = () => remarcar(AG.find(x => x.id === b.dataset.move)));
}
function confirmar(titulo, texto, botao, fn) {
  openModal(`<h3>${esc(titulo)}</h3><p style="margin-top:8px">${esc(texto)}</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="cc">Voltar</button><button class="btn btn-brass" id="ck">${esc(botao)}</button></div>`);
  $("#cc").onclick = closeModal; $("#ck").onclick = async () => { closeModal(); await fn(); };
}
const profOpts = (todos, sel) => (todos ? `<option value="">Salão todo</option>` : "") + profs().map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.nome)}</option>`).join("");

$("#addBlock").onclick = () => {
  openModal(`<h3>Bloquear horário</h3>
    <label for="mb">Quem</label><select id="mb">${profOpts(DONO, DONO ? "" : EU.id)}</select>
    <label for="md">Dia</label><input id="md" type="date" value="${dia}">
    <div class="two"><div><label for="ms">Das</label><input id="ms" type="time" value="12:00" step="900"></div><div><label for="me">Até</label><input id="me" type="time" value="13:00" step="900"></div></div>
    <label for="mm">Motivo (opcional)</label><input id="mm" maxlength="80" placeholder="Almoço, consulta, folga…">
    <div class="err hidden" id="merr"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="mc">Cancelar</button><button class="btn btn-dark" id="mok">Bloquear</button></div>`);
  $("#mc").onclick = closeModal;
  $("#mok").onclick = async () => {
    const s = toMin($("#ms").value), e = toMin($("#me").value);
    if (!(e > s)) { $("#merr").textContent = "O fim precisa ser depois do início."; $("#merr").classList.remove("hidden"); return; }
    const { error } = await sb.from("bloqueios").insert({ data: $("#md").value, profissional_id: $("#mb").value || null, inicio: s, fim: e, motivo: $("#mm").value.trim() || null });
    if (error) return fail(error); closeModal(); toast("Horário bloqueado."); renderAgenda();
  };
};
function formAgendamento(titulo, ag) {
  const ativos = SERV.filter(s => s.ativo);
  const sel = new Set((ag?.servicos || []).map(s => s.id));
  openModal(`<h3>${titulo}</h3>
    <label for="wb">Profissional</label><select id="wb">${profOpts(false, ag?.profissional_id || (DONO ? "" : EU.id))}</select>
    <label for="wsv">Serviços</label><select id="wsv" multiple size="6">${ativos.map(s => `<option value="${s.id}" ${sel.has(s.id) ? "selected" : ""}>${esc(s.nome)} · ${s.duracao} min · ${money(s.preco)}</option>`).join("")}</select>
    <p class="hint" style="font-size:13px;color:#5b6a6d">Segure Ctrl (ou toque no celular) para escolher mais de um.</p>
    <div class="two"><div><label for="wd">Dia</label><input id="wd" type="date" value="${ag?.data || dia}"></div><div><label for="wt">Horário</label><input id="wt" type="time" step="900" value="${ag ? fmtMin(ag.inicio) : "10:00"}"></div></div>
    <div class="two"><div><label for="wn">Nome do cliente</label><input id="wn" maxlength="80" value="${esc(ag?.cliente_nome || "")}"></div><div><label for="wp">WhatsApp (opcional)</label><input id="wp" type="tel" value="${esc(ag?.cliente_tel || "")}"></div></div>
    <div class="err hidden" id="werr"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="wc">Cancelar</button><button class="btn btn-dark" id="wok">Salvar</button></div>`);
  $("#wc").onclick = closeModal;
  return new Promise(res => {
    $("#wok").onclick = async () => {
      const err = m => { $("#werr").textContent = m; $("#werr").classList.remove("hidden"); };
      const ids = [...$("#wsv").selectedOptions].map(o => o.value);
      const name = $("#wn").value.trim(), tel = $("#wp").value.replace(/\D/g, "");
      if (!ids.length) return err("Escolha pelo menos um serviço.");
      if (name.length < 2) return err("Digite o nome do cliente.");
      if (tel && (tel.length < 10 || tel.length > 11)) return err("WhatsApp com DDD, ex.: 11999999999.");
      const itens = ids.map(id => SERV.find(s => s.id === id)).map(s => ({ id: s.id, nome: s.nome, preco: Number(s.preco), duracao: s.duracao }));
      const reg = { profissional_id: $("#wb").value, data: $("#wd").value, inicio: toMin($("#wt").value), duracao: itens.reduce((a, s) => a + s.duracao, 0), servicos: itens, total: itens.reduce((a, s) => a + s.preco, 0), cliente_nome: name, cliente_tel: tel || null };
      const { data: oc } = await sb.rpc("horarios_ocupados", { p_de: reg.data, p_ate: reg.data });
      const choque = (oc || []).filter(o => (o.profissional_id === reg.profissional_id || o.profissional_id === null) && !(ag && !ag._novo && o.inicio === ag.inicio && o.profissional_id === ag.profissional_id && reg.data === ag.data)).some(o => reg.inicio < o.fim && reg.inicio + reg.duracao > o.inicio);
      if (choque && !$("#werr").dataset.ok) { $("#werr").dataset.ok = "1"; return err("Esse horário bate com outro agendamento ou bloqueio. Clique em Salvar de novo para confirmar mesmo assim."); }
      res(reg);
    };
  });
}
$("#addWalkin").onclick = async () => {
  const reg = await formAgendamento("Encaixe manual");
  const { error } = await sb.from("agendamentos").insert({ ...reg, origem: "balcao" });
  if (error) return fail(error); closeModal(); toast("Encaixe adicionado."); dia = reg.data; renderAgenda();
};
async function remarcar(ag) {
  const reg = await formAgendamento("Remarcar ou editar", ag);
  const { error } = await sb.from("agendamentos").update(reg).eq("id", ag.id);
  if (error) return fail(error); closeModal(); toast("Agendamento atualizado."); dia = reg.data; renderAgenda();
}
$("#copyDay").onclick = async () => {
  const d = fromKey(dia);
  let txt = `Agenda ${WDL[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}\n`;
  profs().forEach(p => { const l = AG.filter(x => x.profissional_id === p.id && x.status !== "cancelado"); txt += `\n${p.nome}:\n` + (l.length ? l.map(x => `${fmtMin(x.inicio)} ${x.cliente_nome}: ${(x.servicos || []).map(s => s.nome).join(" + ")}`).join("\n") : "livre") + "\n"; });
  try { await navigator.clipboard.writeText(txt); toast("Agenda copiada. Cole no WhatsApp da equipe."); } catch (e) { toast("Não foi possível copiar neste navegador."); }
};
let audioCtx = null;
function bip() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach(t => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(.0001, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(.3, audioCtx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + t + .15);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + .16); });
  } catch (e) {}
}
document.addEventListener("click", () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {} }, { once: true });
const fila = [];
function popupNovo(a) {
  fila.push(a); if (fila.length > 1 && !$("#modal").classList.contains("hidden")) return; mostrarFila();
}
function mostrarFila() {
  const a = fila[0]; if (!a) return;
  const d = fromKey(a.data), p = EQUIPE.find(x => x.id === a.profissional_id);
  openModal(`<div class="novo-pop"><div class="sino" aria-hidden="true">🔔</div><h3>Novo agendamento</h3>
    <p class="big">${esc(a.cliente_nome)}</p>
    <p>${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às <b>${fmtMin(a.inicio)}</b>${p ? " com " + esc(p.nome) : ""}</p>
    <p class="hint">${esc((a.servicos || []).map(s => s.nome).join(" + "))} · ${money(a.total)}</p>
    ${fila.length > 1 ? `<p class="hint">+${fila.length - 1} outro(s) na fila</p>` : ""}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="pOk">Ok</button><button class="btn btn-brass" id="pVer">Ver na agenda</button></div></div>`);
  const fechar = () => { fila.shift(); closeModal(); if (fila.length) setTimeout(mostrarFila, 200); };
  $("#pOk").onclick = fechar;
  $("#pVer").onclick = () => { dia = a.data; fechar(); abrirAba("agenda"); };
}
function ouvirNovos() {
  sb.channel("agend").on("postgres_changes", { event: "INSERT", schema: "public", table: "agendamentos" }, p => {
    const a = p.new; if (!a) return;
    novos.add(a.id);
    const d = fromKey(a.data);
    bip();
    if (a.origem === "site") popupNovo(a); else toast(`Encaixe adicionado: ${a.cliente_nome}`);
    try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("Novo agendamento · " + CFG.nome, { body: `${a.cliente_nome} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${fmtMin(a.inicio)}`, icon: "fotos/logo.svg" }); } catch (e) {}
    const t = document.title; document.title = "(Novo) " + t.replace(/^\(Novo\) /, ""); setTimeout(() => document.title = t.replace(/^\(Novo\) /, ""), 15000);
    if (!$("#tab-agenda").classList.contains("hidden")) renderAgenda();
    if (!$("#tab-clientes").classList.contains("hidden")) renderClientes();
  }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "agendamentos" }, () => { if (!$("#tab-agenda").classList.contains("hidden")) renderAgenda(); }).subscribe();
  avisoPermissao();
}
function avisoPermissao() {
  const box = $("#notifBar"); if (!box) return;
  if (!("Notification" in window)) { box.classList.add("hidden"); return; }
  if (Notification.permission === "granted") { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.innerHTML = Notification.permission === "denied"
    ? `Os avisos do navegador estão bloqueados. Com o painel aberto, novos agendamentos ainda aparecem na tela com som. Para receber também com a aba minimizada, libere as notificações deste site no cadeado ao lado do endereço.`
    : `<span>Ative os avisos para saber de novos agendamentos mesmo com o painel minimizado.</span><button class="btn btn-brass btn-sm" id="notifOn">Ativar avisos</button>`;
  const b = $("#notifOn"); if (b) b.onclick = async () => { await Notification.requestPermission(); avisoPermissao(); if (Notification.permission === "granted") toast("Avisos ativados neste aparelho."); };
}

/* ===================== clientes ===================== */
let CLI = [];
const chave = a => a.cliente_tel || "nome:" + a.cliente_nome.trim().toLowerCase();
async function renderClientes() {
  const { data, error } = await sb.from("agendamentos").select("id,data,inicio,duracao,status,total,servicos,cliente_nome,cliente_tel,profissional_id,lembrete_em,origem,cliente_id").order("data", { ascending: false }).order("inicio", { ascending: false }).limit(5000);
  if (error) return fail(error, "Erro ao carregar clientes.");
  const hoje = dkey(new Date()), amanha = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return dkey(d); })();
  const mapa = new Map();
  (data || []).forEach(a => {
    const k = chave(a); let c = mapa.get(k);
    if (!c) { c = { k, nome: a.cliente_nome, tel: a.cliente_tel, hist: [], visitas: 0, faltas: 0, gasto: 0, ultimo: null, proximo: null }; mapa.set(k, c); }
    c.hist.push(a);
    if (a.status === "concluido") { c.visitas++; c.gasto += Number(a.total); if (!c.ultimo) c.ultimo = a; }
    if (a.status === "faltou") c.faltas++;
    if (a.status === "confirmado" && a.data >= hoje && (!c.proximo || a.data < c.proximo.data || (a.data === c.proximo.data && a.inicio < c.proximo.inicio))) c.proximo = a;
  });
  CLI = [...mapa.values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const ids = [...new Set((data || []).map(a => a.cliente_id).filter(Boolean))];
  if (ids.length) {
    const { data: cs } = await sb.from("clientes").select("*").in("user_id", ids);
    (cs || []).forEach(c => { const alvo = CLI.find(x => x.hist.some(a => a.cliente_id === c.user_id)); if (alvo) alvo.conta = c; });
  }
  // lembretes de amanhã
  const lemb = (data || []).filter(a => a.data === amanha && a.status === "confirmado" && a.cliente_tel).sort((x, y) => x.inicio - y.inicio);
  $("#lembretes").innerHTML = `<div class="card"><h3>Lembretes para amanhã</h3>${lemb.length ? lemb.map(a => {
    const p = EQUIPE.find(x => x.id === a.profissional_id), d = fromKey(a.data);
    const msg = `Olá ${a.cliente_nome.split(" ")[0]}! Passando para lembrar do seu horário na ${CFG.nome} amanhã, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}, às ${fmtMin(a.inicio)}${p ? " com " + p.nome.split(" ")[0] : ""}. Se não puder vir, avise por aqui. Até lá!`;
    return `<div class="lrow ${a.lembrete_em ? "ok" : ""}"><span><b>${fmtMin(a.inicio)}</b> ${esc(a.cliente_nome)}${p ? " · " + esc(p.nome.split(" ")[0]) : ""}</span>
      ${a.lembrete_em ? `<span class="tag ok">Lembrete enviado</span>` : `<a class="btn btn-dark btn-sm" target="_blank" rel="noopener" data-lemb="${a.id}" href="${waLink("55" + a.cliente_tel, msg)}">Enviar lembrete no WhatsApp</a>`}</div>`;
  }).join("") : `<p class="hint">Nenhum horário confirmado para amanhã.</p>`}</div>`;
  $("#lembretes").querySelectorAll("[data-lemb]").forEach(b => b.addEventListener("click", async () => { await sb.from("agendamentos").update({ lembrete_em: new Date().toISOString() }).eq("id", b.dataset.lemb); setTimeout(renderClientes, 800); }));
  filtrarClientes();
}
const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function filtrarClientes() {
  const q = norm($("#cliBusca").value), qd = q.replace(/\D/g, "");
  const lista = CLI.filter(c => !q || norm(c.nome).includes(q) || (qd && (c.tel || "").includes(qd)));
  const fd = a => { const d = fromKey(a.data); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2); };
  $("#cliCount").textContent = `${lista.length} cliente(s)`;
  $("#cliList").innerHTML = lista.length ? `<div class="clihead"><span>Cliente</span><span>WhatsApp</span><span>Atendimentos</span><span>Último</span><span>Próximo</span><span>Total gasto</span></div>` + lista.map((c, i) => `
    <button class="clirow" data-i="${CLI.indexOf(c)}"><span class="cn">${esc(c.nome)}${c.conta ? ` <span class="tag ok">Conta</span>` : ""}${c.faltas ? ` <span class="tag">${c.faltas} falta(s)</span>` : ""}</span><span>${fmtTel(c.tel) || "—"}</span><span>${c.visitas}</span><span>${c.ultimo ? fd(c.ultimo) : "—"}</span><span>${c.proximo ? `<b>${fd(c.proximo)} ${fmtMin(c.proximo.inicio)}</b>` : "—"}</span><span>${money(c.gasto)}</span></button>`).join("")
    : `<div class="empty">${CLI.length ? "Nenhum cliente encontrado." : "Os clientes aparecem aqui a partir do primeiro agendamento."}</div>`;
  $("#cliList").querySelectorAll("[data-i]").forEach(b => b.onclick = () => fichaCliente(CLI[+b.dataset.i]));
}
$("#cliBusca").addEventListener("input", filtrarClientes);
function fichaCliente(c) {
  const st = { confirmado: "Confirmado", concluido: "Concluído", faltou: "Faltou", cancelado: "Cancelado" };
  openModal(`<h3>${esc(c.nome)}</h3>
    ${c.conta ? `<div class="contabox"><b>Cliente com conta</b> · ${esc(c.conta.nome + " " + c.conta.sobrenome)} · ${esc(c.conta.email || "")}${c.conta.nascimento ? " · aniversário " + c.conta.nascimento.slice(8, 10) + "/" + c.conta.nascimento.slice(5, 7) : ""}${DONO && c.conta.cpf ? " · CPF " + c.conta.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : ""}<br>Lembretes: ${c.conta.aceite_lembretes ? "sim" : "não quer"} · Novidades: ${c.conta.aceite_novidades ? "sim" : "não"}</div>` : ""}
    <p class="hint">${c.tel ? fmtTel(c.tel) + " · " : ""}${c.visitas} atendimento(s) · ${money(c.gasto)} gastos${c.faltas ? " · " + c.faltas + " falta(s)" : ""}</p>
    <div class="hist">${c.hist.map(a => { const d = fromKey(a.data), p = EQUIPE.find(x => x.id === a.profissional_id); return `<div class="hrow2 st-${a.status}"><span>${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${fmtMin(a.inicio)}</span><span>${esc((a.servicos || []).map(s => s.nome).join(" + "))}${p ? " · " + esc(p.nome.split(" ")[0]) : ""}</span><span>${st[a.status]}</span></div>`; }).join("")}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap">
      ${c.tel ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink("55" + c.tel, `Olá ${c.nome.split(" ")[0]}! Aqui é da ${CFG.nome}.`)}">Mensagem no WhatsApp</a>` : ""}
      ${(DONO || EU.atende) ? `<button class="btn btn-brass" id="cliAg">Marcar novo horário</button>` : ""}
      <button class="btn btn-dark" id="cliF">Fechar</button></div>`);
  $("#cliF").onclick = closeModal;
  const ag = $("#cliAg"); if (ag) ag.onclick = async () => {
    closeModal();
    const reg = await formAgendamento("Novo horário para " + c.nome, { cliente_nome: c.nome, cliente_tel: c.tel, data: dkey(new Date()), inicio: 600, servicos: [], profissional_id: DONO ? null : EU.id, _novo: true });
    const { error } = await sb.from("agendamentos").insert({ ...reg, origem: "balcao" });
    if (error) return fail(error); closeModal(); toast("Horário marcado."); dia = reg.data; renderClientes();
  };
}

/* ===================== serviços ===================== */
async function renderServicos() {
  const { data } = await sb.from("servicos").select("*").order("ordem"); SERV = data || [];
  const cats = [...new Set(SERV.map(s => s.categoria))];
  $("#svcList").innerHTML = `<datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>` + cats.map(c => `<div class="svccat">${esc(c)}</div>
    <div class="svchead"><span>Nome</span><span>Categoria</span><span>Minutos</span><span>Preço (R$)</span><span>Observação</span><span></span></div>` +
    SERV.filter(s => s.categoria === c).map(s => `<div class="svcrow ${s.ativo ? "" : "off"}" data-id="${s.id}">
      <input class="nm" data-f="nome" value="${esc(s.nome)}" aria-label="Nome">
      <input data-f="categoria" list="cats" value="${esc(s.categoria)}" aria-label="Categoria">
      <input data-f="duracao" type="number" min="5" step="5" value="${s.duracao}" aria-label="Duração em minutos">
      <input data-f="preco" type="number" min="0" step="1" value="${Number(s.preco)}" aria-label="Preço">
      <input data-f="obs" value="${esc(s.obs || "")}" placeholder="opcional" aria-label="Observação">
      <div class="acts"><label class="sw"><input type="checkbox" data-f="ativo" ${s.ativo ? "checked" : ""}> No site</label>
        <button class="btn btn-dark btn-sm" data-save>Salvar</button><button class="linkbtn" data-delsvc>Apagar</button></div>
    </div>`).join("")).join("");
  $("#svcList").querySelectorAll(".svcrow").forEach(row => {
    row.querySelectorAll("input").forEach(i => i.addEventListener("input", () => row.classList.add("dirty")));
    row.querySelector("[data-save]").onclick = async () => {
      const v = f => row.querySelector(`[data-f=${f}]`);
      const upd = { nome: v("nome").value.trim(), categoria: v("categoria").value.trim() || "Outros", duracao: +v("duracao").value, preco: +v("preco").value, obs: v("obs").value.trim() || null, ativo: v("ativo").checked };
      if (!upd.nome || !(upd.duracao >= 5) || !(upd.preco >= 0)) return toast("Confira nome, duração (mínimo 5) e preço.");
      const { error } = await sb.from("servicos").update(upd).eq("id", row.dataset.id);
      if (error) return fail(error); toast("Serviço salvo."); renderServicos();
    };
    row.querySelector("[data-delsvc]").onclick = () => confirmar("Apagar serviço?", "Se preferir só tirar do site, desmarque “No site”. Agendamentos antigos continuam com o nome e o preço da época.", "Apagar", async () => {
      const { error } = await sb.from("servicos").delete().eq("id", row.dataset.id); if (error) return fail(error); toast("Serviço apagado."); renderServicos();
    });
  });
}
$("#svcNew").onclick = () => {
  const cats = [...new Set(SERV.map(s => s.categoria))];
  openModal(`<h3>Novo serviço</h3>
    <label for="nn">Nome</label><input id="nn" maxlength="120">
    <label for="nc">Categoria</label><input id="nc" list="catsN" value="${esc(cats[0] || "")}"><datalist id="catsN">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="two"><div><label for="nd">Duração (min)</label><input id="nd" type="number" min="5" step="5" value="30"></div><div><label for="np2">Preço (R$)</label><input id="np2" type="number" min="0" step="1" value="40"></div></div>
    <label for="no">Observação (opcional)</label><input id="no" maxlength="120">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="nx0">Cancelar</button><button class="btn btn-brass" id="nok">Adicionar</button></div>`);
  $("#nx0").onclick = closeModal;
  $("#nok").onclick = async () => {
    const reg = { nome: $("#nn").value.trim(), categoria: $("#nc").value.trim() || "Outros", duracao: +$("#nd").value, preco: +$("#np2").value, obs: $("#no").value.trim() || null, ordem: SERV.length };
    if (!reg.nome) return toast("Digite o nome do serviço.");
    const { error } = await sb.from("servicos").insert(reg); if (error) return fail(error);
    closeModal(); toast("Serviço adicionado."); renderServicos();
  };
};

/* ===================== imagens (envio) ===================== */
function reduzir(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error("Não foi possível ler a imagem.")), "image/jpeg", .85);
    }; img.onerror = () => rej(new Error("Arquivo de imagem inválido.")); img.src = URL.createObjectURL(file);
  });
}
async function enviar(file, pasta) {
  const blob = await reduzir(file);
  const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from("imagens").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return { path, url: sb.storage.from("imagens").getPublicUrl(path).data.publicUrl };
}
async function apagarArquivo(path) { if (path) await sb.storage.from("imagens").remove([path]); }

/* ===================== equipe ===================== */
const papelOpts = atual => [["profissional", "Profissional: vê só a própria agenda"], ["dono", "Dono: vê e mexe em tudo"], ...(MASTER || atual === "master" ? [["master", "Master: administração do sistema"]] : [])]
  .map(([v, l]) => `<option value="${v}" ${atual === v ? "selected" : ""}>${l}</option>`).join("");
let CONV = {};
async function renderEquipe() {
  const [{ data }, cv] = await Promise.all([sb.from("equipe").select("*").order("ordem"), sb.from("convites").select("*")]);
  EQUIPE = data || []; CONV = Object.fromEntries((cv.data || []).map(c => [c.equipe_id, c]));
  const fmtExp = d => { const x = new Date(d); return pad(x.getDate()) + "/" + pad(x.getMonth() + 1) + " às " + pad(x.getHours()) + ":" + pad(x.getMinutes()); };
  const conviteBox = p => {
    if (!p.email || p.user_id) return "";
    const c = CONV[p.id], valido = c && new Date(c.expira) > new Date();
    return `<div class="convite">${valido ? `<div>Código de convite: <b class="cod">${esc(c.codigo)}</b></div><small>Vale até ${fmtExp(c.expira)}, só para ${esc(p.email)}</small>
      <div class="cbtns"><button class="btn btn-dark btn-sm" data-copiar>Copiar convite</button><button class="linkbtn2" data-gerar>Gerar outro</button></div>`
      : `<div>${c ? "O código venceu." : "Sem código de convite ainda."}</div><div class="cbtns"><button class="btn btn-brass btn-sm" data-gerar>Gerar código de convite</button></div>`}</div>`;
  };
  $("#eqList").innerHTML = EQUIPE.map(p => `<div class="eqcard ${p.ativo ? "" : "off"}" data-id="${p.id}">
    <div class="eqtop">${avatar(p)}<div><b>${esc(p.nome)}</b><div style="margin-top:4px">${p.papel === "master" ? '<span class="tag master">Master</span>' : p.papel === "dono" ? '<span class="tag own">Dono</span>' : '<span class="tag">Profissional</span>'} ${p.user_id ? '<span class="tag ok">Acesso ativo</span>' : (p.email ? '<span class="tag">Aguardando 1º acesso</span>' : "")}</div></div></div>
    ${conviteBox(p)}
    <label class="btn btn-ghost btn-sm upl" style="margin-top:6px">Trocar foto<input type="file" accept="image/*" data-foto hidden></label>
    <label>Nome</label><input data-f="nome" value="${esc(p.nome)}">
    <label>Descrição no site</label><input data-f="descricao" value="${esc(p.descricao || "")}">
    <label>E-mail de acesso ao painel</label><input data-f="email" type="email" value="${esc(p.email || "")}" placeholder="sem acesso ao painel">
    <label>Tipo de acesso</label><select data-f="papel" ${p.id === EU.id || (p.papel === "master" && !MASTER) ? "disabled" : ""}>${papelOpts(p.papel)}</select>
    <label class="sw" style="margin-top:12px"><input type="checkbox" data-f="atende" ${p.atende ? "checked" : ""}> Atende clientes (aparece no site e na agenda)</label>
    <label class="sw"><input type="checkbox" data-f="ativo" ${p.ativo ? "checked" : ""} ${p.id === EU.id ? "disabled" : ""}> Ativo na equipe</label>
    ${p.papel === "master" && !MASTER ? `<p class="hint" style="font-size:13px;color:#5b6a6d;margin-top:12px">Acesso Master: só o próprio Master altera.</p>` : `<div class="acts"><button class="btn btn-dark btn-sm" data-save>Salvar</button>${p.id !== EU.id ? `<button class="linkbtn" data-del>Remover</button>` : ""}</div>`}
  </div>`).join("");
  $("#eqList").querySelectorAll(".eqcard").forEach(card => {
    const id = card.dataset.id, p = EQUIPE.find(x => x.id === id), v = f => card.querySelector(`[data-f=${f}]`);
    if (!card.querySelector("[data-save]")) return;
    card.querySelector("[data-save]").onclick = async () => {
      const email = v("email").value.trim().toLowerCase() || null;
      const upd = { nome: v("nome").value.trim(), descricao: v("descricao").value.trim() || null, email, atende: v("atende").checked };
      if (id !== EU.id) { upd.papel = v("papel").value; upd.ativo = v("ativo").checked; }
      if (email !== (p.email || null) && p.user_id) upd.user_id = null; // e-mail trocado: acesso precisa ser refeito
      if (!upd.nome) return toast("Digite o nome.");
      const { error } = await sb.from("equipe").update(upd).eq("id", id); if (error) return fail(error);
      toast("Equipe atualizada."); await carregarBase(); renderEquipe();
    };
    card.querySelector("[data-foto]").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { toast("Enviando foto…"); const { url } = await enviar(f, "equipe"); const { error } = await sb.from("equipe").update({ foto_url: url }).eq("id", id); if (error) throw error; toast("Foto atualizada."); await carregarBase(); renderEquipe(); } catch (err) { fail(err, "Erro ao enviar a foto."); }
    };
    const gerar = card.querySelector("[data-gerar]");
    if (gerar) gerar.onclick = async () => { const { error } = await sb.rpc("gerar_convite", { p_equipe: id }); if (error) return fail(error); toast("Código gerado. Mande para a pessoa."); renderEquipe(); };
    const copiar = card.querySelector("[data-copiar]");
    if (copiar) copiar.onclick = async () => {
      const c = CONV[id], link = location.origin + location.pathname;
      const txt = `Olá ${p.nome.split(" ")[0]}! Seu acesso ao painel da ${CFG.nome}:\n1. Abra ${link}\n2. Clique em "Primeiro acesso"\n3. E-mail: ${p.email}\n4. Código de convite: ${c.codigo}\n5. Crie sua senha e confirme pelo link que chega no seu e-mail.\nO código vale até ${fmtExp(c.expira)}.`;
      try { await navigator.clipboard.writeText(txt); toast("Convite copiado. Cole no WhatsApp da pessoa."); } catch (e) { openModal(`<h3>Convite</h3><textarea style="width:100%;height:180px">${esc(txt)}</textarea><div style="text-align:right;margin-top:12px"><button class="btn btn-dark" id="mclose">Fechar</button></div>`); $("#mclose").onclick = closeModal; }
    };
    const del = card.querySelector("[data-del]");
    if (del) del.onclick = () => confirmar(`Remover ${p.nome}?`, "Se essa pessoa tem agendamentos, ela será só desativada para manter o histórico.", "Remover", async () => {
      const { error } = await sb.from("equipe").delete().eq("id", id);
      if (error) { const r = await sb.from("equipe").update({ ativo: false, atende: false }).eq("id", id); if (r.error) return fail(r.error); toast("Pessoa desativada (tem histórico de agendamentos)."); }
      else toast("Pessoa removida.");
      await carregarBase(); renderEquipe();
    });
  });
}
$("#eqNew").onclick = () => {
  openModal(`<h3>Adicionar pessoa</h3>
    <label for="qn">Nome</label><input id="qn" maxlength="80">
    <label for="qd">Descrição no site</label><input id="qd" maxlength="80" placeholder="Ex.: Barbeiro, especialista em degradê">
    <label for="qe">E-mail de acesso ao painel (opcional)</label><input id="qe" type="email">
    <label for="qp">Tipo de acesso</label><select id="qp">${papelOpts("profissional")}</select>
    <label class="sw" style="margin-top:12px"><input type="checkbox" id="qa" checked> Atende clientes</label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn btn-ghost" id="qc">Cancelar</button><button class="btn btn-brass" id="qok">Adicionar</button></div>`);
  $("#qc").onclick = closeModal;
  $("#qok").onclick = async () => {
    const reg = { nome: $("#qn").value.trim(), descricao: $("#qd").value.trim() || null, email: $("#qe").value.trim().toLowerCase() || null, papel: $("#qp").value, atende: $("#qa").checked, ordem: EQUIPE.length };
    if (!reg.nome) return toast("Digite o nome.");
    const { error } = await sb.from("equipe").insert(reg); if (error) return fail(error);
    closeModal(); toast(reg.email ? "Pessoa adicionada. Agora gere o código de convite no cartão dela." : "Pessoa adicionada."); await carregarBase(); renderEquipe();
  };
};

/* ===================== galeria ===================== */
let GALA = [];
async function renderImagens() {
  const { data } = await sb.from("galeria").select("*").order("ordem"); GALA = data || [];
  const trab = GALA.filter(g => g.secao === "trabalhos"), fach = GALA.find(g => g.secao === "fachada");
  $("#galList").innerHTML = trab.map((g, i) => `<div class="gcard" data-id="${g.id}">
    <img src="${esc(g.url)}" alt="">
    <div class="gb"><input data-leg value="${esc(g.legenda || "")}" placeholder="Legenda (ex.: Degradê com barba)" maxlength="80">
      <div class="acts"><div class="ord"><button data-up ${i === 0 ? "disabled" : ""} aria-label="Mover para antes">←</button><button data-down ${i === trab.length - 1 ? "disabled" : ""} aria-label="Mover para depois">→</button></div>
      <button class="linkbtn" data-delimg>Apagar</button></div></div></div>`).join("") || `<div class="empty">Nenhuma foto ainda. Use “Adicionar fotos”.</div>`;
  $("#galList").querySelectorAll(".gcard").forEach((card, i) => {
    const g = trab[i];
    card.querySelector("[data-leg]").onchange = async e => { const { error } = await sb.from("galeria").update({ legenda: e.target.value.trim() || null }).eq("id", g.id); if (error) fail(error); else toast("Legenda salva."); };
    const mover = async d => { const o = trab[i + d]; await Promise.all([sb.from("galeria").update({ ordem: o.ordem }).eq("id", g.id), sb.from("galeria").update({ ordem: g.ordem }).eq("id", o.id)]); renderImagens(); };
    card.querySelector("[data-up]").onclick = () => mover(-1);
    card.querySelector("[data-down]").onclick = () => mover(1);
    card.querySelector("[data-delimg]").onclick = () => confirmar("Apagar esta foto?", "Ela sai do site na hora.", "Apagar", async () => {
      const { error } = await sb.from("galeria").delete().eq("id", g.id); if (error) return fail(error);
      await apagarArquivo(g.path); toast("Foto apagada."); renderImagens();
    });
  });
  $("#fachadaBox").innerHTML = `${fach ? `<img src="${esc(fach.url)}" alt="Fachada">` : `<div class="empty">Sem foto da fachada.</div>`}
    <label class="btn btn-ghost upl">Trocar foto da fachada<input type="file" accept="image/*" id="fachUp" hidden></label>`;
  $("#fachUp").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { toast("Enviando…"); const { url, path } = await enviar(f, "fachada");
      if (fach) { await sb.from("galeria").update({ url, path }).eq("id", fach.id); await apagarArquivo(fach.path); }
      else await sb.from("galeria").insert({ url, path, secao: "fachada", legenda: "Fachada do salão" });
      toast("Fachada atualizada."); renderImagens();
    } catch (err) { fail(err, "Erro ao enviar."); }
  };
}
$("#galUpload").onchange = async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  const prog = $("#galProg"); prog.classList.remove("hidden");
  let maxOrd = Math.max(-1, ...GALA.filter(g => g.secao === "trabalhos").map(g => g.ordem)), ok = 0;
  for (const [i, f] of files.entries()) {
    prog.textContent = `Enviando ${i + 1} de ${files.length}…`;
    try { const { url, path } = await enviar(f, "trabalhos"); const { error } = await sb.from("galeria").insert({ url, path, secao: "trabalhos", ordem: ++maxOrd }); if (error) throw error; ok++; }
    catch (err) { fail(err, "Erro ao enviar " + f.name); }
  }
  prog.textContent = `${ok} foto(s) adicionada(s). Escreva uma legenda em cada uma.`; setTimeout(() => prog.classList.add("hidden"), 4000);
  renderImagens();
};

/* ===================== configurações ===================== */
async function renderConfig() {
  const { data } = await sb.from("config").select("*").eq("id", 1).single(); CFG = data;
  const dias = [1, 2, 3, 4, 5, 6, 0];
  const f = (id, label, val, type = "text") => `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val ?? "")}">`;
  $("#cfgForm").innerHTML = `
    <div class="card"><h3>Horário de funcionamento</h3>
      ${dias.map(d => { const h = CFG.horarios[String(d)]; const on = Array.isArray(h); return `<div class="hrow" data-d="${d}"><b>${WDL[d]}</b><label class="sw"><input type="checkbox" data-open ${on ? "checked" : ""}> Aberto</label><input type="time" data-a value="${on ? h[0] : "10:00"}" ${on ? "" : "disabled"}><input type="time" data-f value="${on ? h[1] : "19:00"}" ${on ? "" : "disabled"}></div>`; }).join("")}
      <div class="three">
        <div>${f("cInt", "Intervalo entre horários (min)", CFG.intervalo, "number")}</div>
        <div>${f("cAnt", "Antecedência mínima (min)", CFG.antecedencia, "number")}</div>
        <div>${f("cDias", "Agenda aberta por (dias)", CFG.dias_abertos, "number")}</div>
      </div>
    </div>
    <div class="card"><h3>Contato e endereço</h3>
      ${f("cWa", "WhatsApp (só números, com 55 e DDD)", CFG.whatsapp)}
      ${f("cWaT", "WhatsApp como aparece no site", CFG.whatsapp_txt)}
      ${f("cTel", "Telefone fixo", CFG.telefone)}
      ${f("cIg", "Instagram (sem @)", CFG.instagram)}
      ${f("cEnd", "Endereço", CFG.endereco)}
      ${f("cMap", "Busca no Google Maps", CFG.maps_query)}
    </div>
    <div class="savebar"><button class="btn btn-brass" id="cfgSave">Salvar alterações</button></div>`;
  $("#cfgForm").querySelectorAll("[data-open]").forEach(c => c.onchange = () => { const r = c.closest(".hrow"); r.querySelector("[data-a]").disabled = !c.checked; r.querySelector("[data-f]").disabled = !c.checked; });
  $("#cfgSave").onclick = async () => {
    const horarios = {};
    let bad = false;
    $("#cfgForm").querySelectorAll(".hrow").forEach(r => { const on = r.querySelector("[data-open]").checked, a = r.querySelector("[data-a]").value, b = r.querySelector("[data-f]").value; if (on && !(toMin(b) > toMin(a))) bad = true; horarios[r.dataset.d] = on ? [a, b] : null; });
    if (bad) return toast("Em algum dia o fechamento está antes da abertura.");
    const upd = { horarios, intervalo: +$("#cInt").value, antecedencia: +$("#cAnt").value, dias_abertos: +$("#cDias").value,
      whatsapp: $("#cWa").value.replace(/\D/g, ""), whatsapp_txt: $("#cWaT").value.trim(), telefone: $("#cTel").value.trim(), instagram: $("#cIg").value.replace(/^@/, "").trim(), endereco: $("#cEnd").value.trim(), maps_query: $("#cMap").value.trim(), updated_at: new Date().toISOString() };
    const { error } = await sb.from("config").update(upd).eq("id", 1); if (error) return fail(error);
    CFG = { ...CFG, ...upd }; toast("Configurações salvas. O site já mostra os novos horários.");
  };
}

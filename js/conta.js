/* Seventh Day: área do cliente (login Google) */
const sb = supabase.createClient(SD_CONFIG.url, SD_CONFIG.key);
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtMin = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const WDL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const money = v => "R$ " + Number(v || 0).toFixed(0);
const fmtTel = t => t && t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : (t || "");
const fmtCpf = c => c ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 3200); }
function openModal(h) { $("#modalBox").innerHTML = h; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
const ver = id => ["carregando", "vEntrar", "vCadastro", "vArea"].forEach(x => $("#" + x).classList.toggle("hidden", x !== id));

/* avatares originais: cor + iniciais */
const AVS = { a1: ["#D3302F", "#fff"], a2: ["#1A1516", "#E0353A"], a3: ["#2F7D5B", "#fff"], a4: ["#C9A45C", "#1A1516"], a5: ["#3A5BA0", "#fff"], a6: ["#7A3B26", "#F2EFEA"] };
const iniciais = (n, s) => (((n || "").trim()[0] || "?") + ((s || "").trim()[0] || "")).toUpperCase();
function avatarSvg(av, n, s) {
  const [bg, fg] = AVS[av] || AVS.a1;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="700" font-size="42" fill="${fg}">${esc(iniciais(n, s))}</text></svg>`;
}

/* CPF */
function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const d = c.split("").map(Number);
  let s = 0; for (let i = 0; i < 9; i++) s += d[i] * (10 - i); let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== d[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += d[i] * (11 - i); r = (s * 10) % 11; if (r === 10) r = 0; return r === d[10];
}
$("#cCpf").addEventListener("input", e => { const v = e.target.value.replace(/\D/g, "").slice(0, 11); e.target.value = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})-?(\d{1,2})$/, "$1-$2"); });

/* estado */
let USER = null, CLI = null, foto = { blob: null, url: null, remover: false }, avEscolhido = "a1";

$("#google").onclick = async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/conta.html", queryParams: { prompt: "select_account" } } });
  if (error) toast(/provider is not enabled/i.test(error.message) ? "O login com Google ainda está sendo configurado pelo salão." : error.message);
};
$("#sair").onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function urlFoto(path) {
  if (!path) return null;
  const { data } = await sb.storage.from("clientes").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ver("vEntrar"); return; }
  if (session.user.app_metadata?.provider !== "google") {
    // sessão do painel da equipe (e-mail e senha): a área do cliente é só para contas Google
    ver("vEntrar");
    $("#google").insertAdjacentHTML("beforebegin", `<p class="hint" style="margin-bottom:12px">Você está conectado ao painel da equipe neste navegador. A área do cliente usa outra conta: <a href="admin.html">voltar ao painel</a> ou saia e entre com Google.</p>`);
    $("#google").onclick = async () => { await sb.auth.signOut(); $("#google").onclick = null; location.reload(); };
    $("#google").lastChild.textContent = "Sair do painel e entrar com Google";
    return;
  }
  USER = session.user; $("#sair").classList.remove("hidden");
  const { data } = await sb.from("clientes").select("*").eq("user_id", USER.id).maybeSingle();
  CLI = data;
  if (!CLI) return abrirCadastro();
  renderArea();
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !USER) iniciar(); });

/* ===== cadastro / edição ===== */
function renderPrev() {
  $("#fotoPrev").innerHTML = foto.url && !foto.remover ? `<img src="${esc(foto.url)}" alt="">` : avatarSvg(avEscolhido, $("#cNome").value, $("#cSob").value);
  $("#fotoTirar").classList.toggle("hidden", !(foto.url && !foto.remover));
  $("#avs").innerHTML = Object.keys(AVS).map(k => `<button class="av ${k === avEscolhido && !(foto.url && !foto.remover) ? "sel" : ""}" data-av="${k}" aria-label="Avatar ${k.slice(1)}">${avatarSvg(k, $("#cNome").value, $("#cSob").value)}</button>`).join("");
  $("#avs").querySelectorAll("[data-av]").forEach(b => b.onclick = () => { avEscolhido = b.dataset.av; foto.remover = true; renderPrev(); });
}
async function abrirCadastro() {
  const edit = !!CLI;
  $("#cadTitulo").textContent = edit ? "Editar meus dados" : "Complete seu cadastro";
  $("#cCancel").classList.toggle("hidden", !edit);
  const gnome = (USER.user_metadata?.full_name || USER.user_metadata?.name || "").trim().split(/\s+/);
  $("#cNome").value = CLI?.nome || gnome[0] || "";
  $("#cSob").value = CLI?.sobrenome || gnome.slice(1).join(" ") || "";
  $("#cWa").value = CLI ? fmtTel(CLI.whatsapp) : "";
  $("#cNasc").value = CLI?.nascimento || "";
  $("#cCpf").value = CLI ? fmtCpf(CLI.cpf) : "";
  $("#cLemb").checked = CLI ? CLI.aceite_lembretes : true;
  $("#cNov").checked = CLI ? CLI.aceite_novidades : false;
  $("#cPriv").checked = !!CLI;
  avEscolhido = CLI?.avatar || "a1";
  foto = { blob: null, url: await urlFoto(CLI?.foto_path), remover: false };
  renderPrev(); ver("vCadastro");
}
["#cNome", "#cSob"].forEach(s => $(s).addEventListener("input", renderPrev));
$("#fotoUp").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { const blob = await reduzir(f, 600); foto = { blob, url: URL.createObjectURL(blob), remover: false }; renderPrev(); }
  catch (err) { toast(err.message); }
};
$("#fotoTirar").onclick = () => { foto.remover = true; renderPrev(); };
$("#cCancel").onclick = () => renderArea();
function reduzir(file, max) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const lado = Math.min(img.width, img.height), k = Math.min(1, max / lado), c = document.createElement("canvas");
      c.width = c.height = Math.round(lado * k);
      c.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error("Não foi possível ler a imagem.")), "image/jpeg", .85);
    }; img.onerror = () => rej(new Error("Arquivo de imagem inválido.")); img.src = URL.createObjectURL(file);
  });
}
$("#cSalvar").onclick = async () => {
  const err = m => { $("#cErr").textContent = m; $("#cErr").classList.remove("hidden"); };
  $("#cErr").classList.add("hidden");
  const nome = $("#cNome").value.trim(), sobrenome = $("#cSob").value.trim(), wa = $("#cWa").value.replace(/\D/g, ""), cpf = $("#cCpf").value.replace(/\D/g, ""), nasc = $("#cNasc").value || null;
  if (nome.length < 2) return err("Digite seu nome.");
  if (sobrenome.length < 2) return err("Digite seu sobrenome.");
  if (wa.length < 10 || wa.length > 11) return err("Digite o WhatsApp com DDD, ex.: (11) 99999-9999.");
  if (cpf && !cpfValido(cpf)) return err("Esse CPF não é válido. Confira os números ou deixe em branco.");
  if (nasc) { const d = new Date(nasc), h = new Date(); const idade = h.getFullYear() - d.getFullYear() - (h < new Date(h.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0); if (idade < 18) return err("A conta é para maiores de 18 anos. Para menores, o responsável agenda em nome dele."); if (idade > 120) return err("Confira a data de nascimento."); }
  if (!$("#cPriv").checked) return err("Para criar a conta, aceite a Política de Privacidade.");
  const b = $("#cSalvar"); b.disabled = true; b.textContent = "Salvando…";
  try {
    let foto_path = CLI?.foto_path || null;
    if (foto.blob) {
      const path = `${USER.id}/foto.jpg`;
      const { error } = await sb.storage.from("clientes").upload(path, foto.blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error; foto_path = path;
    } else if (foto.remover && foto_path) { await sb.storage.from("clientes").remove([foto_path]); foto_path = null; }
    const reg = { user_id: USER.id, nome, sobrenome, whatsapp: wa, email: USER.email, cpf: cpf || null, nascimento: nasc, foto_path, avatar: avEscolhido, aceite_lembretes: $("#cLemb").checked, aceite_novidades: $("#cNov").checked, atualizado: new Date().toISOString() };
    if (!CLI) reg.aceite_privacidade = new Date().toISOString();
    const { data, error } = CLI ? await sb.from("clientes").update(reg).eq("user_id", USER.id).select().single() : await sb.from("clientes").insert(reg).select().single();
    if (error) throw error;
    CLI = data; toast(foto_path || !foto.blob ? "Cadastro salvo." : "Cadastro salvo.");
    try { localStorage.setItem("seventhday_cliente", JSON.stringify({ name: nome + " " + sobrenome, phone: wa })); } catch (e) {}
    renderArea();
  } catch (e) { err(e.message || "Não foi possível salvar. Tente de novo."); }
  b.disabled = false; b.textContent = "Salvar cadastro";
};

/* ===== área ===== */
async function renderArea() {
  ver("vArea");
  const url = await urlFoto(CLI.foto_path);
  $("#olaFoto").innerHTML = url ? `<img src="${esc(url)}" alt="">` : avatarSvg(CLI.avatar, CLI.nome, CLI.sobrenome);
  $("#olaNome").textContent = `Olá, ${CLI.nome}!`;
  $("#olaInfo").textContent = USER.email;
  const nascTxt = CLI.nascimento ? (() => { const d = fromKey(CLI.nascimento); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); })() : "Não informado";
  $("#dados").innerHTML = `<dl class="dl">
    <dt>Nome</dt><dd>${esc(CLI.nome + " " + CLI.sobrenome)}</dd>
    <dt>WhatsApp</dt><dd>${fmtTel(CLI.whatsapp)}</dd>
    <dt>E-mail</dt><dd>${esc(CLI.email || USER.email)}</dd>
    <dt>Nascimento</dt><dd>${nascTxt}</dd>
    <dt>CPF</dt><dd>${CLI.cpf ? "***." + CLI.cpf.slice(3, 6) + ".***-" + CLI.cpf.slice(9) : "Não informado"}</dd>
    <dt>Lembretes</dt><dd>${CLI.aceite_lembretes ? "Ligados" : "Desligados"}</dd>
    <dt>Novidades</dt><dd>${CLI.aceite_novidades ? "Ligadas" : "Desligadas"}</dd></dl>`;
  const { data } = await sb.from("agendamentos").select("id,data,inicio,duracao,status,total,servicos,profissional_id").eq("cliente_id", USER.id).order("data", { ascending: false }).order("inicio", { ascending: false });
  const { data: eq } = await sb.from("equipe").select("id,nome");
  const pro = id => (eq || []).find(x => x.id === id)?.nome?.split(" ")[0] || "";
  const agora = new Date(), hojeMin = agora.getHours() * 60 + agora.getMinutes();
  const hojeK = agora.getFullYear() + "-" + pad(agora.getMonth() + 1) + "-" + pad(agora.getDate());
  const futuro = a => a.data > hojeK || (a.data === hojeK && a.inicio >= hojeMin);
  const prox = (data || []).filter(a => a.status === "confirmado" && futuro(a)).reverse();
  const hist = (data || []).filter(a => !(a.status === "confirmado" && futuro(a)));
  const { data: avs } = await sb.from("avaliacoes").select("agendamento_id,nota,comentario,pode_publicar");
  const AV = {}; (avs || []).forEach(x => AV[x.agendamento_id] = x);
  const limite = new Date(agora); limite.setDate(limite.getDate() - 60);
  const limK = limite.getFullYear() + "-" + pad(limite.getMonth() + 1) + "-" + pad(limite.getDate());
  const podeAvaliar = a => (a.status === "concluido" || a.status === "confirmado") && !futuro(a) && a.data >= limK;
  const estrelas = n => `<span class="stars" aria-label="${n} de 5 estrelas">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
  const acaoAval = a => AV[a.id] ? `<button class="avok" data-aval="${a.id}" title="Editar avaliação">${estrelas(AV[a.id].nota)}</button>` : podeAvaliar(a) ? `<button class="btn btn-ghost btn-sm" data-aval="${a.id}">Avaliar</button>` : "";
  const linha = (a, cancelar) => { const d = fromKey(a.data); return `<div class="ag"><div><b>${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${fmtMin(a.inicio)}</b><div class="hint">${esc((a.servicos || []).map(s => s.nome).join(" + "))}${pro(a.profissional_id) ? " com " + esc(pro(a.profissional_id)) : ""} · ${money(a.total)}</div></div>${cancelar ? `<button class="linkbtn2" data-cancel="${a.id}">Cancelar</button>` : `<span class="st st-${a.status}">${({ concluido: "Atendido", faltou: "Faltou", cancelado: "Cancelado", confirmado: "Confirmado" })[a.status === "confirmado" && !futuro(a) ? "concluido" : a.status]}</span>${acaoAval(a)}`}</div>`; };
  $("#proximos").innerHTML = prox.length ? prox.map(a => linha(a, true)).join("") : `<p class="hint">Nenhum horário marcado. <a href="index.html#agendar">Agendar agora</a></p>`;
  $("#historico").innerHTML = hist.length ? hist.map(a => linha(a, false)).join("") : `<p class="hint">Seus atendimentos aparecem aqui.</p>`;
  const ultimo = hist.find(a => podeAvaliar(a) && !AV[a.id] && a.data >= (() => { const d = new Date(agora); d.setDate(d.getDate() - 14); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); })());
  const ban = $("#avBanner");
  if (ultimo) {
    const d = fromKey(ultimo.data);
    ban.innerHTML = `<div><b>Como foi seu último atendimento?</b><div class="hint">${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}: ${esc((ultimo.servicos || []).map(s => s.nome).join(" + "))}${pro(ultimo.profissional_id) ? " com " + esc(pro(ultimo.profissional_id)) : ""}</div></div>
      <div class="rate" role="group" aria-label="Dar nota">${[1, 2, 3, 4, 5].map(n => `<button data-bn="${n}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}</div>`;
    ban.classList.remove("hidden");
    ban.querySelectorAll("[data-bn]").forEach(b => b.onclick = () => abrirAvaliacao(ultimo, null, +b.dataset.bn, pro));
  } else ban.classList.add("hidden");
  document.querySelectorAll("[data-aval]").forEach(b => b.onclick = () => abrirAvaliacao((data || []).find(a => a.id === b.dataset.aval), AV[b.dataset.aval], null, pro));
  $("#proximos").querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => {
    openModal(`<h3>Cancelar este horário?</h3><p style="margin-top:8px">O horário fica livre para outra pessoa.</p><div class="cacts"><button class="btn btn-ghost" id="mN">Voltar</button><button class="btn btn-brass" id="mS">Cancelar horário</button></div>`);
    $("#mN").onclick = closeModal;
    $("#mS").onclick = async () => { const { error } = await sb.rpc("cancelar_meu_agendamento", { p_id: b.dataset.cancel }); closeModal(); if (error) return toast(error.message); toast("Horário cancelado."); renderArea(); };
  });
}
function abrirAvaliacao(a, atual, notaIni, pro) {
  if (!a) return;
  const d = fromKey(a.data); let nota = notaIni || atual?.nota || 0;
  openModal(`<h3>Avaliar atendimento</h3>
    <p class="hint">${WDL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${esc((a.servicos || []).map(s => s.nome).join(" + "))}${pro(a.profissional_id) ? " com " + esc(pro(a.profissional_id)) : ""}</p>
    <div class="rate big" role="radiogroup" aria-label="Nota de 1 a 5">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" data-n="${n}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}</div>
    <p class="hint small" id="rTxt"></p>
    <label for="rCom" style="margin-top:12px">Comentário (opcional)</label>
    <textarea id="rCom" maxlength="500" rows="4" placeholder="O que você achou do corte, do atendimento, do ambiente?">${esc(atual?.comentario || "")}</textarea>
    <label class="chk"><input type="checkbox" id="rPub" ${atual?.pode_publicar ? "checked" : ""}> Pode mostrar meu comentário no site, com meu primeiro nome</label>
    <div class="cacts"><button class="btn btn-ghost" id="rN">Voltar</button><button class="btn btn-brass" id="rS">Enviar avaliação</button></div>`);
  const txt = ["", "Ruim", "Abaixo do esperado", "Ok", "Bom", "Excelente"];
  const pinta = () => { $("#modalBox").querySelectorAll("[data-n]").forEach(b => { const on = +b.dataset.n <= nota; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(+b.dataset.n === nota)); }); $("#rTxt").textContent = nota ? txt[nota] : "Toque nas estrelas para dar a nota."; };
  $("#modalBox").querySelectorAll("[data-n]").forEach(b => b.onclick = () => { nota = +b.dataset.n; pinta(); });
  pinta();
  $("#rN").onclick = closeModal;
  $("#rS").onclick = async () => {
    if (!nota) return toast("Escolha de 1 a 5 estrelas.");
    $("#rS").disabled = true;
    const { error } = await sb.rpc("avaliar_atendimento", { p_id: a.id, p_nota: nota, p_comentario: $("#rCom").value, p_publicar: $("#rPub").checked });
    $("#rS").disabled = false;
    if (error) return toast(error.message);
    closeModal(); toast("Obrigado pela avaliação!"); renderArea();
  };
}
$("#editar").onclick = abrirCadastro;
$("#excluir").onclick = () => {
  openModal(`<h3>Excluir sua conta?</h3><p style="margin-top:8px">Isso apaga seu cadastro, foto e preferências e não pode ser desfeito. Horários futuros continuam marcados; cancele antes se não for comparecer.</p><label for="confx" style="margin-top:12px">Digite EXCLUIR para confirmar</label><input id="confx" autocomplete="off"><div class="cacts"><button class="btn btn-ghost" id="xN">Voltar</button><button class="btn btn-brass" id="xS">Excluir conta</button></div>`);
  $("#xN").onclick = closeModal;
  $("#xS").onclick = async () => {
    if ($("#confx").value.trim().toUpperCase() !== "EXCLUIR") return toast("Digite EXCLUIR para confirmar.");
    const { error } = await sb.rpc("excluir_minha_conta"); if (error) return toast(error.message);
    try { localStorage.removeItem("seventhday_cliente"); } catch (e) {}
    await sb.auth.signOut(); closeModal(); toast("Conta excluída."); setTimeout(() => location.href = "index.html", 1200);
  };
};

iniciar().catch(e => { console.error(e); ver("vEntrar"); });

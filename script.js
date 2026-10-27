import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== 1. Configuração do Firebase =====
// Mantenha aqui a SUA configuração (a mesma que já está funcionando)
const firebaseConfig = {
  apiKey: "AIzaSyD-UdIJucT8pC6s2f7ssyQL3IJhTmg_7V4",
  authDomain: "nuvem2-tavernaro.firebaseapp.com",
  projectId: "nuvem2-tavernaro",
  storageBucket: "nuvem2-tavernaro.firebasestorage.app",
  messagingSenderId: "326853343183",
  appId: "1:326853343183:web:de79759740c8a70d5344ba"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const NOME_COLECAO = "apiNomes";
const colecao = collection(db, NOME_COLECAO);

// ===== Referências aos elementos =====
const form = document.getElementById("form-nome");
const input = document.getElementById("input-nome");
const btnSalvar = document.getElementById("btn-salvar");
const btnCancelar = document.getElementById("btn-cancelar");
const formTitulo = document.getElementById("form-titulo");
const mensagem = document.getElementById("mensagem");
const lista = document.getElementById("lista");
const vazio = document.getElementById("vazio");
const dadosAtuais = document.getElementById("dados-atuais");
// Alteração: contador de registros na barra superior
const contador = document.getElementById("contador");

let idEditando = null;

// ===== 2. Consulta às APIs externas =====
// Alteração: envia o país (Brasil) e usa só o primeiro nome na consulta
// Alteração: faz a requisição e já trata erros (limite atingido, status HTTP ruim)
async function buscarJSON(url) {
  const resposta = await fetch(url);
  const dados = await resposta.json();

  if (!resposta.ok || dados.error) {
    throw new Error(dados.error || `Erro HTTP ${resposta.status}`);
  }
  return dados;
}

// Alteração: tenta com o país (BR); se a API não tiver dado, tenta sem o filtro
async function buscarComFallback(api, nome, campo) {
  const comPais = await buscarJSON(`${api}?name=${nome}&country_id=BR`);
  if (comPais[campo] != null) return comPais;
  return buscarJSON(`${api}?name=${nome}`);
}

// ===== 2. Consulta às APIs externas =====
async function consultarAPIs(nomeCompleto) {
  // Alteração: usa só o primeiro nome e já codifica para a URL
  const nome = encodeURIComponent(nomeCompleto.trim().split(" ")[0]);

  const [dadosIdade, dadosGenero] = await Promise.all([
    buscarComFallback("https://api.agify.io/", nome, "age"),
    buscarComFallback("https://api.genderize.io/", nome, "gender")
  ]);

  return {
    idadeMedia: dadosIdade.age ?? null,
    genero: dadosGenero.gender ?? null,
    probabilidadeGenero: dadosGenero.probability ?? null
  };
}

// ===== 3. CREATE e UPDATE =====
form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const nome = input.value.trim();
  if (!nome) return;

  // Alteração: mensagens agora informam o tipo (info, sucesso, erro) para o estilo
  mostrarMensagem("Consultando APIs...", "info");
  btnSalvar.disabled = true;

  try {
    const estatisticas = await consultarAPIs(nome);

    if (idEditando) {
      await updateDoc(doc(db, NOME_COLECAO, idEditando), { nome, ...estatisticas });
      mostrarMensagem("Registro atualizado.", "sucesso");
      sairModoEdicao();
    } else {
      await addDoc(colecao, { nome, ...estatisticas, criadoEm: serverTimestamp() });
      mostrarMensagem("Nome salvo com sucesso.", "sucesso");
      form.reset();
    }

    mostrarNomeAtual(nome, estatisticas);
    } catch (erro) {
    console.error(erro);
    // Alteração: mostra o motivo real (ex.: limite da API) em vez de mensagem genérica
    mostrarMensagem(`Não foi possível concluir: ${erro.message}`, "erro");
  } finally {
    btnSalvar.disabled = false;
  }
});

// ===== 4. READ (histórico em tempo real) =====
const consulta = query(colecao, orderBy("criadoEm", "desc"));

onSnapshot(consulta, (snapshot) => {
  lista.innerHTML = "";
  // Alteração: atualiza o contador da barra superior
  contador.textContent = snapshot.size;
  vazio.classList.toggle("hidden", !snapshot.empty);

  snapshot.forEach((documento) => {
    lista.appendChild(criarItem(documento.id, documento.data()));
  });
}, (erro) => {
  console.error(erro);
  mostrarMensagem("Não foi possível carregar o histórico.", "erro");
});

// Monta um item do histórico (com avatar, texto e ações)
function criarItem(id, dados) {
  const li = document.createElement("li");
  li.className = "item";

  // Alteração: avatar com a inicial, colorido pelo gênero
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.dataset.genero = dados.genero ?? "unknown";
  avatar.textContent = dados.nome.charAt(0).toUpperCase();

  const info = document.createElement("div");
  info.className = "item-info";

  const titulo = document.createElement("strong");
  titulo.textContent = dados.nome;

  const detalhe = document.createElement("small");
  detalhe.textContent = resumoItem(dados);

  info.append(titulo, detalhe);

  const acoes = document.createElement("div");
  acoes.className = "acoes";

  const btnEditar = document.createElement("button");
  btnEditar.className = "btn-ghost";
  btnEditar.textContent = "Editar";
  btnEditar.addEventListener("click", () => entrarModoEdicao(id, dados));

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-ghost btn-ghost-danger";
  btnExcluir.textContent = "Excluir";
  btnExcluir.addEventListener("click", () => excluir(id, dados.nome));

  acoes.append(btnEditar, btnExcluir);
  li.append(avatar, info, acoes);
  return li;
}

// Alteração: resumo curto usado no histórico (ex.: "55 anos · Masculino · 100%")
function resumoItem(dados) {
  const idade = dados.idadeMedia != null ? `${dados.idadeMedia} anos` : "idade indefinida";
  const pct = dados.probabilidadeGenero != null
    ? ` · ${Math.round(dados.probabilidadeGenero * 100)}%`
    : "";
  return `${idade} · ${traduzirGenero(dados.genero)}${pct}`;
}

function traduzirGenero(genero) {
  if (genero === "male") return "Masculino";
  if (genero === "female") return "Feminino";
  return "Indefinido";
}

// ===== 5. Nome atual e modo edição =====

// Alteração: nome atual com dois blocos de estatística e barra de probabilidade
function mostrarNomeAtual(nome, dados) {
  const temIdade = dados.idadeMedia != null;
  const temGenero = dados.probabilidadeGenero != null;
  const pct = temGenero ? Math.round(dados.probabilidadeGenero * 100) : 0;

  dadosAtuais.innerHTML = "";

  const titulo = document.createElement("h3");
  titulo.className = "resultado-nome";
  titulo.textContent = nome;

  const grade = document.createElement("div");
  grade.className = "stats";

  const statIdade = criarStat("Idade média", temIdade ? `${dados.idadeMedia} anos` : "—");

  const statGenero = criarStat("Gênero provável", traduzirGenero(dados.genero), "texto");
  statGenero.dataset.genero = dados.genero ?? "unknown";

  const barra = document.createElement("div");
  barra.className = "barra";
  const preenchimento = document.createElement("div");
  preenchimento.className = "barra-fill";
  preenchimento.style.width = `${pct}%`; // largura proporcional à probabilidade
  barra.append(preenchimento);

  const nota = document.createElement("small");
  nota.className = "stat-nota";
  nota.textContent = temGenero ? `${pct}% de probabilidade` : "Dados insuficientes";

  statGenero.append(barra, nota);
  grade.append(statIdade, statGenero);
  dadosAtuais.append(titulo, grade);
}

// Alteração: função auxiliar para criar um bloco de estatística
function criarStat(rotulo, valor, classeValor = "") {
  const bloco = document.createElement("div");
  bloco.className = "stat";

  const r = document.createElement("span");
  r.className = "stat-rotulo";
  r.textContent = rotulo;

  const v = document.createElement("span");
  v.className = `stat-valor ${classeValor}`.trim();
  v.textContent = valor;

  bloco.append(r, v);
  return bloco;
}

function entrarModoEdicao(id, dados) {
  idEditando = id;
  input.value = dados.nome;
  formTitulo.textContent = "Editar nome";
  btnSalvar.textContent = "Atualizar";
  btnCancelar.classList.remove("hidden");
  mostrarNomeAtual(dados.nome, dados);
  mostrarMensagem("Editando registro. Clique em Atualizar para salvar.", "info");
  input.focus();
}

function sairModoEdicao() {
  idEditando = null;
  form.reset();
  formTitulo.textContent = "Cadastrar nome";
  btnSalvar.textContent = "Pesquisar e salvar";
  btnCancelar.classList.add("hidden");
}

btnCancelar.addEventListener("click", sairModoEdicao);

// ===== 6. DELETE =====
async function excluir(id, nome) {
  if (!confirm(`Deseja excluir "${nome}"?`)) return;

  try {
    await deleteDoc(doc(db, NOME_COLECAO, id));
    // Alteração: se o registro excluído estava em edição, sai do modo edição
    if (idEditando === id) sairModoEdicao();
    mostrarMensagem("Registro excluído.", "sucesso");
  } catch (erro) {
    console.error(erro);
    mostrarMensagem("Não foi possível excluir o registro.", "erro");
  }
}

// ===== Utilitário =====
// Alteração: aceita o tipo da mensagem (info, sucesso ou erro)
function mostrarMensagem(texto, tipo = "info") {
  mensagem.textContent = texto;
  mensagem.dataset.tipo = tipo;
}

// ===== 7. Alternância de tema claro/escuro =====
// Alteração: lógica do botão de tema (o tema inicial já é aplicado no <head>)
const btnTema = document.getElementById("btn-tema");

btnTema.addEventListener("click", () => {
  const html = document.documentElement;
  const novoTema = html.dataset.theme === "dark" ? "light" : "dark";
  html.dataset.theme = novoTema;

  // Alteração: persistência — guarda a escolha do usuário para as próximas visitas
  try {
    localStorage.setItem("tema", novoTema);
  } catch (e) {
    // Se o armazenamento estiver bloqueado, o tema vale só para esta visita
  }
});
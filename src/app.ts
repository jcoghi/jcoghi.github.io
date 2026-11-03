const POR_PAGINA = 100;

// Carta pronta para uso no site
interface Carta {
  id: string;
  numero: string;
  codigo: string;
  nomePT: string;
  nomeEN: string;
  tipo: TipoCarta;
  raridade: string;
  preco: number | null;      // preço em uso: o digitado à mão, se houver, ou o do arquivo
  precoBanco: number | null; // preço de dados/cartas.js
  manual: boolean;           // preço digitado à mão neste navegador
  busca: string; // nomes, número, código e raridade normalizados, para a busca
}

const estado = {
  cartas: [] as Carta[],
  registros: new Map<string, Registro>(),
  porId: new Map<string, Carta>(),
  filtradas: [] as Carta[],
  limite: POR_PAGINA,
  servidor: false, // aberto pelo servidor local (npm run site): preços editados vão para dados/cartas.js
};

function $<T extends HTMLElement>(seletor: string): T {
  const elemento = document.querySelector<T>(seletor);
  if (!elemento) throw new Error(`Elemento ${seletor} não encontrado no HTML`);
  return elemento;
}

const el = {
  busca: $<HTMLInputElement>('#busca'),
  tipo: $<HTMLSelectElement>('#filtro-tipo'),
  soPreco: $<HTMLInputElement>('#filtro-preco'),
  soPedido: $<HTMLInputElement>('#filtro-pedido'),
  resultados: $<HTMLDivElement>('#resultados'),
  contagem: $<HTMLParagraphElement>('#contagem'),
  mais: $<HTMLButtonElement>('#mostrar-mais'),
  status: $<HTMLParagraphElement>('#status'),
  pedidoLista: $<HTMLUListElement>('#pedido-lista'),
  pedidoTotal: $<HTMLElement>('#pedido-total'),
  pedidoItens: $<HTMLParagraphElement>('#pedido-itens'),
  pedidoAviso: $<HTMLParagraphElement>('#pedido-aviso'),
  zerar: $<HTMLButtonElement>('#btn-zerar'),
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const ordemNome = new Intl.Collator('pt-BR');
const ordemCodigo = new Intl.Collator('pt-BR', { numeric: true });
// Versões de uma mesma carta: Regular, Reverse Foil e Foil
const ORDEM_TIPO: Record<TipoCarta, number> = { 'Regular': 0, 'Reverse Foil': 1, 'Foil': 2 };
const ordemCarta = (a: Carta, b: Carta) => ordemCodigo.compare(a.numero, b.numero) || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo];

// ---------- utilitários ----------

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapar(texto: unknown): string {
  return String(texto).replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

// Aceita 12.5, "12,50", "12.50", "1.234,56" e "R$ 10"
function lerPreco(texto: unknown): number | null {
  let t = String(texto).replace(/[^\d,.-]/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "1.500" = mil e quinhentos
  const valor = Number(t);
  return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) / 100 : null;
}

function registro(id: string): Registro {
  return estado.registros.get(id) || { chave: id, qtd: 0 };
}

function mostrarStatus(texto: string, tipo = ''): void {
  el.status.textContent = texto;
  el.status.className = 'status ' + tipo;
}

function prepararCarta(carta: CartaBanco): Carta {
  const preco = carta.preco == null || carta.preco === '' ? null : lerPreco(carta.preco);
  if (carta.preco != null && carta.preco !== '' && preco == null) {
    console.warn(`Preço inválido no banco para ${carta.id}:`, carta.preco);
  }
  return {
    id: carta.id,
    numero: carta.numero,
    codigo: carta.codigo,
    nomePT: carta.nomePT,
    nomeEN: carta.nomeEN,
    tipo: carta.tipo,
    raridade: carta.raridade || '',
    preco,
    precoBanco: preco,
    manual: false,
    busca: normalizar(`${carta.nomePT} ${carta.nomeEN} ${carta.numero} ${carta.codigo} ${carta.raridade || ''}`),
  };
}

// Linha abaixo do nome: nome em inglês (quando diferente do português) e raridade
function nomeSecundario(c: Carta): string {
  const ingles = c.nomeEN && c.nomeEN !== c.nomePT ? c.nomeEN : '';
  return [ingles, c.raridade].filter(Boolean).join(' · ');
}

// ---------- persistência ----------

async function salvarQuantidade(id: string, qtd: number): Promise<void> {
  if (!qtd) {
    estado.registros.delete(id);
    await DB.remover(id);
  } else {
    const novo = { chave: id, qtd };
    estado.registros.set(id, novo);
    await DB.salvar(novo);
  }
}

// Preço digitado à mão vale no lugar do preço do arquivo;
// null (ou o mesmo preço do arquivo) volta a usar o preço do arquivo
async function salvarPreco(c: Carta, preco: number | null): Promise<void> {
  if (preco == null || preco === c.precoBanco) {
    c.preco = c.precoBanco;
    c.manual = false;
    await DB.removerPreco(c.id);
  } else {
    c.preco = preco;
    c.manual = true;
    await DB.salvarPreco({ chave: c.id, preco });
  }
}

// Servidor local (scripts/servidor.ts); no GitHub Pages ou abrindo o index.html direto, não existe
async function detectarServidor(): Promise<boolean> {
  try {
    return (await fetch('api/status', { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

// Grava o preço na carta, em dados/cartas.js (null = sem preço)
async function gravarPrecoNoArquivo(c: Carta, preco: number | null): Promise<void> {
  const resposta = await fetch('api/preco', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: c.id, preco }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || `erro ${resposta.status} do servidor`);
  c.precoBanco = preco;
  if (window.BANCO_CARTAS) window.BANCO_CARTAS.atualizadoEm = dados.atualizadoEm;
  await salvarPreco(c, null); // o preço da carta passa a valer: descarta o guardado só no navegador
}

// Cartas e preços vêm do arquivo dados/cartas.js (gerado por scripts/importar-liga.ts);
// as quantidades e os preços digitados à mão ficam no IndexedDB do navegador.
async function carregarDoBanco(): Promise<void> {
  const banco = window.BANCO_CARTAS;
  if (!banco || !Array.isArray(banco.cartas)) {
    throw new Error('arquivo dados/cartas.js não encontrado, com erro de digitação ou no formato antigo. Rode: npm run importar');
  }
  estado.cartas = banco.cartas.map(prepararCarta).sort(ordemCarta);
  estado.porId = new Map(estado.cartas.map((c) => [c.id, c]));

  // Quantidades de cartas que não existem mais no banco são descartadas
  const registros = await DB.todos();
  estado.registros = new Map();
  for (const r of registros) {
    if (r.qtd && estado.porId.has(r.chave)) estado.registros.set(r.chave, { chave: r.chave, qtd: r.qtd });
    else await DB.remover(r.chave);
  }

  // Preços digitados à mão de cartas que não existem mais, ou que o arquivo já traz com o mesmo valor, são descartados
  for (const p of await DB.precosManuais()) {
    const c = estado.porId.get(p.chave);
    if (c && p.preco !== c.precoBanco) { c.preco = p.preco; c.manual = true; }
    else await DB.removerPreco(p.chave);
  }
  mostrarInfoBanco(banco);
}

function mostrarInfoBanco(banco: BancoCartas): void {
  const data = new Date(banco.atualizadoEm).toLocaleString('pt-BR');
  const comPreco = estado.cartas.filter((c) => c.preco != null).length;
  const manuais = estado.cartas.filter((c) => c.manual).length;
  mostrarStatus(`Coleção ${banco.colecao.toUpperCase()} · ${estado.cartas.length} entradas (${comPreco} com preço) · atualizado em ${data}`
    + (manuais ? ` · ${manuais} preço(s) digitado(s) à mão` : '')
    + (estado.servidor ? ' · preços editados são gravados em dados/cartas.js' : ''));
}

// ---------- busca e listagem ----------

function filtrar(): void {
  const termos = normalizar(el.busca.value).split(/\s+/).filter(Boolean);
  const tipo = el.tipo.value;
  const soPreco = el.soPreco.checked;
  const soPedido = el.soPedido.checked;

  estado.filtradas = estado.cartas.filter((c) => {
    if (tipo && c.tipo !== tipo) return false;
    if (soPreco && c.preco == null) return false;
    if (soPedido && !registro(c.id).qtd) return false;
    return termos.every((t) => c.busca.includes(t));
  });
  estado.limite = POR_PAGINA;
  renderizarResultados();
}

// Preço com o botão ✎ (editar) e, quando foi digitado à mão, ↺ (voltar ao preço do arquivo)
function htmlPreco(c: Carta): string {
  const banco = c.precoBanco == null ? 'sem preço' : moeda.format(c.precoBanco);
  return `
    ${c.manual ? `<button type="button" class="restaurar-preco" title="Voltar ao preço do banco (${banco})" aria-label="Voltar ao preço do banco">↺</button>` : ''}
    <span class="preco${c.preco == null ? ' falta' : ''}${c.manual ? ' manual' : ''}"${c.manual ? ` title="Preço digitado à mão · no banco: ${banco}"` : ''}>${c.preco == null ? 'sem preço' : moeda.format(c.preco)}</span>
    <button type="button" class="editar-preco" title="Editar preço" aria-label="Editar preço">✎</button>`;
}

function htmlCarta(c: Carta): string {
  const r = registro(c.id);
  const secundario = nomeSecundario(c);
  return `
    <article class="carta${r.qtd ? ' no-pedido' : ''}" data-id="${escapar(c.id)}">
      <span class="numero" title="${escapar(c.codigo)}">Nº ${escapar(c.numero)}</span>
      <div class="nomes">
        <strong>${escapar(c.nomePT)}</strong>
        ${secundario ? `<small>${escapar(secundario)}</small>` : ''}
      </div>
      <span class="tipo tipo-${c.tipo.toLowerCase().replace(/ /g, '-')}">${c.tipo}</span>
      <div class="preco-celula">${htmlPreco(c)}</div>
      <div class="qtd">
        <button type="button" class="menos" aria-label="Diminuir">−</button>
        <input type="text" inputmode="numeric" class="quantidade" value="${r.qtd || ''}" placeholder="0" aria-label="Quantidade">
        <button type="button" class="mais" aria-label="Aumentar">+</button>
      </div>
    </article>`;
}

function renderizarResultados(): void {
  const visiveis = estado.filtradas.slice(0, estado.limite);
  el.resultados.innerHTML = visiveis.map(htmlCarta).join('');
  const total = estado.filtradas.length;
  el.contagem.textContent = total
    ? `Mostrando ${visiveis.length} de ${total} entradas`
    : (estado.cartas.length ? 'Nenhuma carta encontrada.' : '');
  el.mais.hidden = visiveis.length >= total;
}

// ---------- pedido ----------

function renderizarPedido(): void {
  const itens: { r: Registro; c: Carta }[] = [];
  for (const r of estado.registros.values()) {
    const c = estado.porId.get(r.chave);
    if (r.qtd && c) itens.push({ r, c });
  }
  itens.sort((a, b) => ordemCarta(a.c, b.c));

  let total = 0;
  let semPreco = 0;
  let unidades = 0;
  el.pedidoLista.innerHTML = itens.map(({ r, c }) => {
    unidades += r.qtd;
    if (c.preco == null) semPreco++;
    const subtotal = (c.preco || 0) * r.qtd;
    total += subtotal;
    return `
      <li data-id="${escapar(c.id)}">
        <div class="item-nome">${escapar(c.nomePT)} <small>Nº ${escapar(c.numero)} · ${c.tipo === 'Reverse Foil' ? c.tipo : c.raridade ? escapar(c.raridade) : c.tipo}</small></div>
        <div class="item-valores">
          ${r.qtd} × ${c.preco == null ? '<span class="falta">sem preço</span>'
            : c.manual ? `<span class="manual" title="Preço digitado à mão">${moeda.format(c.preco)}</span>` : moeda.format(c.preco)}
          <strong>${moeda.format(subtotal)}</strong>
          <button type="button" class="remover" title="Remover do pedido" aria-label="Remover">×</button>
        </div>
      </li>`;
  }).join('') || '<li class="vazio">Nenhuma carta no pedido.</li>';

  el.pedidoTotal.textContent = moeda.format(Math.round(total * 100) / 100);
  el.pedidoItens.textContent = `${itens.length} carta(s) · ${unidades} unidade(s)`;
  el.pedidoAviso.hidden = semPreco === 0;
  el.pedidoAviso.textContent = `Atenção: ${semPreco} carta(s) no pedido sem preço cadastrado.`;
  el.zerar.disabled = itens.length === 0;
}

async function definirQuantidade(id: string, valor: number | string, artigo?: HTMLElement): Promise<void> {
  const qtd = Math.max(0, Math.floor(Number(valor) || 0));
  await salvarQuantidade(id, qtd);
  if (artigo) {
    artigo.classList.toggle('no-pedido', qtd > 0);
    // Não reescreve o campo enquanto o usuário digita nele (evita sobrescrever dígitos novos)
    const input = artigo.querySelector<HTMLInputElement>('.quantidade');
    if (input && document.activeElement !== input) input.value = qtd ? String(qtd) : '';
  }
  renderizarPedido();
}

// ---------- edição de preço ----------

function celulaPreco(artigo: HTMLElement): HTMLElement {
  return artigo.querySelector<HTMLElement>('.preco-celula')!;
}

// Novo preço da carta: gravado em dados/cartas.js (null = sem preço) ou, sem o servidor local,
// guardado só no navegador (null = volta ao preço do arquivo)
async function definirPreco(artigo: HTMLElement, preco: number | null, noArquivo: boolean): Promise<void> {
  const c = estado.porId.get(artigo.dataset.id!);
  if (!c) return;
  try {
    if (noArquivo) await gravarPrecoNoArquivo(c, preco);
    else await salvarPreco(c, preco);
  } catch (erro) {
    console.error(erro);
    celulaPreco(artigo).innerHTML = htmlPreco(c);
    mostrarStatus(`Erro ao gravar o preço de ${c.nomePT} (Nº ${c.numero}): ${(erro as Error).message}`, 'erro');
    return;
  }
  celulaPreco(artigo).innerHTML = htmlPreco(c);
  renderizarPedido();
  if (window.BANCO_CARTAS) mostrarInfoBanco(window.BANCO_CARTAS);
}

// Troca o preço da linha por um campo para digitar o novo valor
function abrirEdicaoPreco(artigo: HTMLElement): void {
  const c = estado.porId.get(artigo.dataset.id!);
  if (!c) return;
  const valor = c.preco == null ? '' : c.preco.toFixed(2).replace('.', ',');
  const ajuda = estado.servidor
    ? 'Enter grava na carta (dados/cartas.js) · Esc cancela · vazio = sem preço'
    : 'Enter salva neste navegador · Esc cancela · vazio volta ao preço do banco';
  celulaPreco(artigo).innerHTML = `
    <input type="text" inputmode="decimal" class="preco-input" value="${valor}" placeholder="0,00"
      aria-label="Novo preço" title="${ajuda}">`;
  const input = celulaPreco(artigo).querySelector<HTMLInputElement>('.preco-input')!;
  input.focus();
  input.select();
}

// Fecha o campo de preço. Salvando, vazio = sem preço (ou volta ao preço do arquivo) e um valor inválido
// mantém o campo aberto (retorna false); sem salvar (Esc), descarta o que foi digitado.
function fecharEdicaoPreco(input: HTMLInputElement, salvar: boolean): boolean {
  const artigo = input.closest<HTMLElement>('.carta');
  const c = artigo && estado.porId.get(artigo.dataset.id!);
  if (!artigo || !c || input.dataset.fechado) return true;
  const texto = input.value.trim();
  const preco = texto ? lerPreco(texto) : null;
  if (salvar && texto && preco == null) {
    input.classList.add('invalido');
    return false;
  }
  // Trocar o HTML com o campo em foco dispara focusout no Chrome: marca para não fechar duas vezes
  input.dataset.fechado = '1';
  if (salvar) definirPreco(artigo, preco, estado.servidor);
  else celulaPreco(artigo).innerHTML = htmlPreco(c);
  return true;
}

// ---------- eventos ----------

// Linha da carta (<article>) que contém o alvo do evento
function cartaDoEvento(e: Event): HTMLElement | null {
  return (e.target as HTMLElement).closest<HTMLElement>('.carta');
}

let temporizadorBusca: number | undefined;
el.busca.addEventListener('input', () => {
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(filtrar, 150);
});
// Enter na busca: vai direto para a quantidade da primeira carta
el.busca.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(temporizadorBusca);
  filtrar();
  const primeiro = el.resultados.querySelector<HTMLInputElement>('.quantidade');
  if (primeiro) { primeiro.focus(); primeiro.select(); }
});
[el.tipo, el.soPreco, el.soPedido].forEach((x) => x.addEventListener('change', filtrar));

el.mais.addEventListener('click', () => {
  estado.limite += POR_PAGINA;
  renderizarResultados();
});

el.resultados.addEventListener('click', (e) => {
  const alvo = e.target as HTMLElement;
  const artigo = cartaDoEvento(e);
  if (!artigo || !alvo.matches('.mais, .menos')) return;
  const id = artigo.dataset.id!;
  const delta = alvo.matches('.mais') ? 1 : -1;
  definirQuantidade(id, registro(id).qtd + delta, artigo);
});

el.resultados.addEventListener('input', (e) => {
  const alvo = e.target as HTMLInputElement;
  const artigo = cartaDoEvento(e);
  if (!artigo || !alvo.matches('.quantidade')) return;
  definirQuantidade(artigo.dataset.id!, alvo.value, artigo);
});

// Ao sair do campo de quantidade, mostra o valor que realmente foi salvo
el.resultados.addEventListener('change', (e) => {
  const alvo = e.target as HTMLInputElement;
  const artigo = cartaDoEvento(e);
  if (!artigo || !alvo.matches('.quantidade')) return;
  const qtd = registro(artigo.dataset.id!).qtd;
  alvo.value = qtd ? String(qtd) : '';
});

// Enter na quantidade: confirma e volta para a busca
el.resultados.addEventListener('keydown', (e) => {
  const alvo = e.target as HTMLElement;
  if (e.key !== 'Enter' || !alvo.matches('.quantidade')) return;
  e.preventDefault();
  alvo.dispatchEvent(new Event('change', { bubbles: true }));
  el.busca.focus();
  el.busca.select();
});

// Botões ✎ (editar preço) e ↺ (voltar ao preço do arquivo)
el.resultados.addEventListener('click', (e) => {
  const alvo = e.target as HTMLElement;
  const artigo = cartaDoEvento(e);
  if (!artigo) return;
  if (alvo.matches('.editar-preco')) abrirEdicaoPreco(artigo);
  else if (alvo.matches('.restaurar-preco')) definirPreco(artigo, null, false);
});

// No campo de preço: Enter salva e volta para a busca; Esc cancela
el.resultados.addEventListener('keydown', (e) => {
  const alvo = e.target as HTMLInputElement;
  if (!alvo.matches('.preco-input')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (fecharEdicaoPreco(alvo, true)) { el.busca.focus(); el.busca.select(); }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const artigo = cartaDoEvento(e);
    fecharEdicaoPreco(alvo, false);
    artigo?.querySelector<HTMLButtonElement>('.editar-preco')?.focus();
  }
});

// Ao sair do campo de preço, salva (ou descarta, se o valor for inválido)
el.resultados.addEventListener('focusout', (e) => {
  const alvo = e.target as HTMLInputElement;
  if (alvo.matches('.preco-input') && !fecharEdicaoPreco(alvo, true)) fecharEdicaoPreco(alvo, false);
});

el.pedidoLista.addEventListener('click', (e) => {
  const alvo = e.target as HTMLElement;
  if (!alvo.matches('.remover')) return;
  const id = alvo.closest<HTMLElement>('li')!.dataset.id!;
  const artigo = [...el.resultados.querySelectorAll<HTMLElement>('.carta')].find((a) => a.dataset.id === id);
  definirQuantidade(id, 0, artigo);
});

el.zerar.addEventListener('click', async () => {
  if (!confirm('Zerar a quantidade de todas as cartas do pedido?')) return;
  const ids = [...estado.registros.values()].filter((r) => r.qtd).map((r) => r.chave);
  for (const id of ids) await salvarQuantidade(id, 0);
  filtrar();
  renderizarPedido();
});

// ---------- início ----------

(async function iniciar() {
  try {
    estado.servidor = await detectarServidor();
    await carregarDoBanco();
    filtrar();
    renderizarPedido();
  } catch (erro) {
    console.error(erro);
    mostrarStatus(`Erro ao abrir o banco: ${(erro as Error).message}`, 'erro');
  }
  el.busca.focus();
})();

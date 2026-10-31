// Gera o banco de cartas (dados/cartas.js) a partir do "cardsjson" da LigaPokémon.
// Uso: npm run importar -- <arquivo> [prefixo]
//      ex.: npm run importar -- dados/liga-dlr.html dlr
//
// <arquivo> pode ser:
//   - a página da Liga salva pelo navegador (Ctrl+S, "somente HTML"): o cardsjson é extraído dela;
//   - um .json com o array cardsjson.
// (A Liga bloqueia GET feito por script, por isso a página precisa ser salva pelo navegador.)
//
// Cada carta da Liga vira duas entradas (Regular e Foil), exceto raridades que só existem em Foil.
// As duas versões usam o menor preço da Liga (precoMenor).
import fs from 'node:fs';
import path from 'node:path';

type TipoCarta = 'Regular' | 'Foil';

interface CartaBanco {
  id: string;
  numero: string;
  codigo: string;
  nomePT: string;
  nomeEN: string;
  tipo: TipoCarta;
  preco: number | string | null;
}

interface BancoCartas {
  atualizadoEm: string;
  colecao: string;
  cartas: CartaBanco[];
}

// Campos usados do cardsjson da Liga
interface CartaLiga {
  sN: string | number;   // número da carta na coleção
  nEN?: string;          // nome em inglês (pode vir com "(#090/103)")
  nPT?: string;          // nome em português
  iR: number;            // id da raridade
  precoMenor?: string | number;
  precoMaior?: string | number;
}

// Rara Dupla (20) e Rara Secreta/IR/SIR (17, 18): só existem em Foil
const RARIDADES_SO_FOIL = [17, 18, 20];
const ARQUIVO_BANCO = path.join(import.meta.dirname, '..', 'dados', 'cartas.js');
const [arquivo, prefixo = 'dlr'] = process.argv.slice(2);

// Aceita 0.48, "0.48", "0,48", "R$ 1.234,56"
function lerPreco(valor: string | number | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;
  let t = String(valor ?? '').replace(/[^\d,.]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Encontra "cardsjson = [ ... ]" no HTML e devolve o texto do array (respeitando strings)
function extrairCardsjson(html: string): string {
  const inicio = html.search(/cardsjson\s*=\s*\[/);
  if (inicio < 0) throw new Error('não encontrei "cardsjson" no arquivo. Salve a página da coleção na Liga (Ctrl+S).');
  let i = html.indexOf('[', inicio);
  const comeco = i;
  let nivel = 0;
  let aspas: string | null = null;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (aspas) {
      if (ch === '\\') i++;
      else if (ch === aspas) aspas = null;
    } else if (ch === '"' || ch === "'") aspas = ch;
    else if (ch === '[') nivel++;
    else if (ch === ']' && --nivel === 0) return html.slice(comeco, i + 1);
  }
  throw new Error('o cardsjson no arquivo está incompleto');
}

function lerCardsjson(caminho: string): CartaLiga[] {
  const texto = fs.readFileSync(caminho, 'utf8');
  const json = texto.trimStart().startsWith('[') ? texto : extrairCardsjson(texto);
  try {
    return JSON.parse(json);
  } catch (erro) {
    throw new Error(`o cardsjson não é um JSON válido (${(erro as Error).message})`);
  }
}

// Transforma os itens da Liga em entradas separadas (Regular e Foil)
function formatar(c: CartaLiga): CartaBanco[] {
  const numero = String(c.sN).padStart(3, '0');
  const baseId = `${prefixo}-${numero}`;
  const nomeEN = c.nEN ? c.nEN.replace(/\s*\(#.*\)/, '').trim() : '';
  const nomePT = c.nPT && c.nPT.trim() !== '' ? c.nPT.trim() : nomeEN;
  const entrada = (sufixo: string, tipo: TipoCarta, preco: number | null): CartaBanco =>
    ({ id: `${baseId}-${sufixo}`, numero, codigo: baseId, nomePT, nomeEN, tipo, preco });

  if (RARIDADES_SO_FOIL.includes(Number(c.iR))) {
    return [entrada('foil', 'Foil', lerPreco(c.precoMenor))];
  }
  // Cartas comuns, incomuns e raras regulares geram 2 registros, ambos com o menor preço
  const menor = lerPreco(c.precoMenor);
  return [
    entrada('reg', 'Regular', menor ?? 0.15),
    entrada('foil', 'Foil', menor ?? 0.25),
  ];
}

function gerarArquivo(banco: BancoCartas): string {
  return [
    `// Banco de cartas Pokémon - importado da LigaPokémon por scripts/importar-liga.ts`,
    '// Para ajustar um preço, edite o campo "preco": 12.5 ou "12,50" (null = sem preço).',
    '// Atenção: importar de novo substitui todos os preços pelos da Liga.',
    'window.BANCO_CARTAS = {',
    `  "atualizadoEm": ${JSON.stringify(banco.atualizadoEm)},`,
    `  "colecao": ${JSON.stringify(banco.colecao)},`,
    '  "cartas": [',
    banco.cartas.map((c) => '    ' + JSON.stringify(c)).join(',\n'),
    '  ]',
    '};',
    '',
  ].join('\n');
}

try {
  if (!arquivo) throw new Error('uso: npm run importar -- <arquivo .html ou .json> [prefixo]');
  const cardsjson = lerCardsjson(arquivo);
  if (!Array.isArray(cardsjson) || !cardsjson.length) throw new Error('cardsjson vazio; banco atual mantido');

  const cartas = cardsjson.flatMap(formatar);
  const ids = new Set<string>();
  for (const c of cartas) {
    if (ids.has(c.id)) throw new Error(`id repetido: ${c.id}; banco atual mantido`);
    ids.add(c.id);
  }
  cartas.sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }) || (a.tipo === 'Regular' ? -1 : 1));

  fs.writeFileSync(ARQUIVO_BANCO, gerarArquivo({ atualizadoEm: new Date().toISOString(), colecao: prefixo, cartas }));
  const semPreco = cartas.filter((c) => c.preco == null).length;
  console.log(`${cardsjson.length} cartas da Liga -> ${cartas.length} entradas gravadas em ${ARQUIVO_BANCO}`);
  if (semPreco) console.warn(`Atenção: ${semPreco} entrada(s) Foil sem preço na Liga.`);
} catch (erro) {
  console.error('Erro:', (erro as Error).message);
  process.exitCode = 1;
}

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
import { gravarBanco, lerPreco, type CartaBanco, type TipoCarta } from './banco.ts';

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
const [arquivo, prefixo = 'dlr'] = process.argv.slice(2);

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

try {
  if (!arquivo) throw new Error('uso: npm run importar -- <arquivo .html ou .json> [prefixo]');
  const cardsjson = lerCardsjson(arquivo);
  if (!Array.isArray(cardsjson) || !cardsjson.length) throw new Error('cardsjson vazio; banco atual mantido');

  console.log(`${cardsjson.length} cartas da Liga`);
  gravarBanco(cardsjson.flatMap(formatar), prefixo, 'LigaPokémon (scripts/importar-liga.ts)');
} catch (erro) {
  console.error('Erro:', (erro as Error).message);
  process.exitCode = 1;
}

// Partes comuns aos importadores: formato do banco, leitura de preços e gravação de dados/cartas.js.
import fs from 'node:fs';
import path from 'node:path';

export type TipoCarta = 'Regular' | 'Foil';

export interface CartaBanco {
  id: string;
  numero: string;
  codigo: string;
  nomePT: string;
  nomeEN: string;
  tipo: TipoCarta;
  raridade?: string;
  preco: number | string | null;
}

export const ARQUIVO_BANCO = path.join(import.meta.dirname, '..', 'dados', 'cartas.js');

// Aceita 0.48, "0.48", "0,48", "R$ 1.234,56"; devolve null se não houver preço
export function lerPreco(valor: string | number | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;
  let t = String(valor ?? '').replace(/[^\d,.]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Valida, ordena (número, depois Regular antes de Foil) e grava o banco
export function gravarBanco(cartas: CartaBanco[], colecao: string, origem: string): void {
  const ids = new Set<string>();
  for (const c of cartas) {
    if (ids.has(c.id)) throw new Error(`id repetido: ${c.id}; banco atual mantido`);
    ids.add(c.id);
  }
  cartas.sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }) || (a.tipo === 'Regular' ? -1 : 1));

  const conteudo = [
    `// Banco de cartas Pokémon - importado de ${origem}`,
    '// Para ajustar um preço, edite o campo "preco": 12.5 ou "12,50" (null = sem preço).',
    '// Atenção: importar de novo substitui todos os preços.',
    'window.BANCO_CARTAS = {',
    `  "atualizadoEm": ${JSON.stringify(new Date().toISOString())},`,
    `  "colecao": ${JSON.stringify(colecao)},`,
    '  "cartas": [',
    cartas.map((c) => '    ' + JSON.stringify(c)).join(',\n'),
    '  ]',
    '};',
    '',
  ].join('\n');
  fs.writeFileSync(ARQUIVO_BANCO, conteudo);

  const semPreco = cartas.filter((c) => c.preco == null).length;
  console.log(`${cartas.length} entradas gravadas em ${ARQUIVO_BANCO}`);
  if (semPreco) console.warn(`Atenção: ${semPreco} entrada(s) sem preço.`);
}

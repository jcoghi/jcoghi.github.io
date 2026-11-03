// Gera o banco de cartas (dados/cartas.js) a partir de uma tabela colada (ex.: Deck Certo).
// Uso: npm run importar-tabela -- <arquivo.txt> [prefixo]
//      ex.: npm run importar-tabela -- dados/deck-certo-dlr.txt dlr
//
// Formato esperado (pode vir tudo grudado numa linha só, como sai ao copiar a tabela):
//   001/103HeracrossRegularR$ 0,44
//   011/103Mega Golisopod exFoil (Rara Dupla)R$ 5,69
//   008/103ShayminRegularSem cotação
//   001/103HeracrossReverse FoilR$ 0,14
//
// Cada carta gera uma entrada com o acabamento informado. "Sem cotação" = sem preço.
import fs from 'node:fs';
import { gravarBanco, lerPreco, type CartaBanco, type TipoCarta } from './banco.ts';

// número/total, nome, tipo (Regular | Reverse Foil | Foil (raridade)), valor (R$ x | Sem cotação).
// A fronteira da próxima numeração evita que "Sem cotação" consuma a carta seguinte.
const ITEM = /(\d{3})\/\d{3}(.+?)(Regular|Reverse Foil|Foil(?: \(([^)]*)\))?)(R\$ ?\d{1,3}(?:\.\d{3})*,\d{2}|Sem cotação)(?=\d{3}\/\d{3}|\r?\n|$)/g;

// Sufixo do id de cada versão: dlr-001-reg, dlr-001-rev, dlr-011-foil
const SUFIXO: Record<TipoCarta, string> = { 'Regular': 'reg', 'Reverse Foil': 'rev', 'Foil': 'foil' };

const [arquivo, prefixo = 'dlr'] = process.argv.slice(2);

try {
  if (!arquivo) throw new Error('uso: npm run importar-tabela -- <arquivo.txt> [prefixo]');
  const texto = fs.readFileSync(arquivo, 'utf8');

  const cartas: CartaBanco[] = [];
  let itens = 0;
  for (const [, numero, nomeBruto, tipoTexto, raridade, valor] of texto.matchAll(ITEM)) {
    itens++;
    const codigo = `${prefixo}-${numero}`;
    const nomePT = nomeBruto.trim();
    const preco = lerPreco(valor);
    const tipo: TipoCarta = tipoTexto === 'Regular' || tipoTexto === 'Reverse Foil' ? tipoTexto : 'Foil';
    cartas.push({
      id: `${codigo}-${SUFIXO[tipo]}`, numero, codigo, nomePT, nomeEN: '', tipo,
      ...(raridade ? { raridade } : {}), preco,
    });
  }
  if (!itens) throw new Error('nenhuma carta reconhecida no arquivo; banco atual mantido');

  // Confere se não ficou nenhum número para trás (ex.: linha num formato diferente)
  const numeros = [...new Set(cartas.map((c) => Number(c.numero)))].sort((a, b) => a - b);
  const faltando = [];
  for (let n = 1; n <= numeros[numeros.length - 1]; n++) if (!numeros.includes(n)) faltando.push(n);
  if (faltando.length) console.warn(`Atenção: números ausentes na tabela: ${faltando.join(', ')}`);

  console.log(`${itens} cartas na tabela`);
  gravarBanco(cartas, prefixo, `${arquivo.replace(/\\/g, '/')} (scripts/importar-tabela.ts)`);
} catch (erro) {
  console.error('Erro:', (erro as Error).message);
  process.exitCode = 1;
}

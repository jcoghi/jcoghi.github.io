// Tipos compartilhados entre o site (src/) e o importador (scripts/).

type TipoCarta = 'Regular' | 'Reverse Foil' | 'Foil';

// Carta como fica gravada em dados/cartas.js (uma entrada por versão: Regular, Reverse Foil ou Foil)
interface CartaBanco {
  id: string;      // ex.: "dlr-090-reg" / "dlr-090-rev" / "dlr-090-foil"
  numero: string;  // número da carta na coleção, ex.: "090"
  codigo: string;  // ex.: "dlr-090" (igual nas duas versões)
  nomePT: string;
  nomeEN: string;
  tipo: TipoCarta;
  raridade?: string; // ex.: "Rara Dupla", "Ilustração Rara" (quando informada)
  // 12.5 ou "12,50"; null = sem preço
  preco: number | string | null;
}

interface BancoCartas {
  atualizadoEm: string;
  colecao: string;
  cartas: CartaBanco[];
}

// Quantidade de uma carta no pedido (guardada no IndexedDB; chave = id da carta)
interface Registro {
  chave: string;
  qtd: number;
}

// Preço digitado à mão no site (guardado no IndexedDB; chave = id da carta).
// Vale só no navegador onde foi digitado, no lugar do preço de dados/cartas.js.
interface PrecoManual {
  chave: string;
  preco: number;
}

interface Window {
  BANCO_CARTAS?: BancoCartas;
}

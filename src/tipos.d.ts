// Tipos compartilhados entre o site (src/) e o importador (scripts/).

type TipoCarta = 'Regular' | 'Foil';

// Carta como fica gravada em dados/cartas.js (uma entrada por versão: Regular ou Foil)
interface CartaBanco {
  id: string;      // ex.: "dlr-090-reg" / "dlr-090-foil"
  codigo: string;  // ex.: "dlr-090" (igual nas duas versões)
  nomePT: string;
  nomeEN: string;
  tipo: TipoCarta;
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

interface Window {
  BANCO_CARTAS?: BancoCartas;
}

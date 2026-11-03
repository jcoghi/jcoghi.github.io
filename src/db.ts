// Banco local (IndexedDB) do navegador.
// - "registros": quantidade de cada carta no pedido (chave, qtd)
// - "precos": preço digitado à mão no site, que vale no lugar do preço do arquivo (chave, preco)
// - "cartas" e "meta": não usados mais (as cartas vêm de dados/cartas.js), mantidos por compatibilidade
const DB = (() => {
  const NOME = 'banco-cartas-pokemon';
  const VERSAO = 2;
  let conexao: IDBDatabase | null = null;

  type Store = 'registros' | 'precos';

  function abrir(): Promise<IDBDatabase> {
    if (conexao) return Promise.resolve(conexao);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of ['cartas', 'registros', 'meta', 'precos']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'chave' });
        }
      };
      req.onsuccess = () => { conexao = req.result; resolve(conexao); };
      req.onerror = () => reject(req.error);
      // Uma aba aberta com a versão anterior do site impede a atualização do banco
      req.onblocked = () => reject(new Error('o site está aberto em outra aba com uma versão antiga; feche as outras abas e recarregue a página'));
    });
  }

  async function transacao<T>(
    store: Store,
    modo: IDBTransactionMode,
    acao: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, modo);
      const req = acao(tx.objectStore(store));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    // Quantidades do pedido
    async todos(): Promise<Registro[]> {
      return (await transacao<Registro[]>('registros', 'readonly', (s) => s.getAll())) ?? [];
    },
    async salvar(registro: Registro): Promise<void> {
      await transacao('registros', 'readwrite', (s) => { s.put(registro); });
    },
    async remover(chave: string): Promise<void> {
      await transacao('registros', 'readwrite', (s) => { s.delete(chave); });
    },
    // Preços digitados à mão
    async precosManuais(): Promise<PrecoManual[]> {
      return (await transacao<PrecoManual[]>('precos', 'readonly', (s) => s.getAll())) ?? [];
    },
    async salvarPreco(preco: PrecoManual): Promise<void> {
      await transacao('precos', 'readwrite', (s) => { s.put(preco); });
    },
    async removerPreco(chave: string): Promise<void> {
      await transacao('precos', 'readwrite', (s) => { s.delete(chave); });
    },
  };
})();

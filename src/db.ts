// Banco local (IndexedDB) do navegador com as quantidades do pedido.
// - "registros": quantidade de cada carta (chave, qtd)
// - "cartas" e "meta": não usados mais (as cartas vêm de dados/cartas.js), mantidos por compatibilidade
const DB = (() => {
  const NOME = 'banco-cartas-pokemon';
  const VERSAO = 1;
  let conexao: IDBDatabase | null = null;

  function abrir(): Promise<IDBDatabase> {
    if (conexao) return Promise.resolve(conexao);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of ['cartas', 'registros', 'meta']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'chave' });
        }
      };
      req.onsuccess = () => { conexao = req.result; resolve(conexao); };
      req.onerror = () => reject(req.error);
    });
  }

  async function transacao<T>(
    modo: IDBTransactionMode,
    acao: (store: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('registros', modo);
      const req = acao(tx.objectStore('registros'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    async todos(): Promise<Registro[]> {
      return (await transacao<Registro[]>('readonly', (s) => s.getAll())) ?? [];
    },
    async salvar(registro: Registro): Promise<void> {
      await transacao('readwrite', (s) => { s.put(registro); });
    },
    async remover(chave: string): Promise<void> {
      await transacao('readwrite', (s) => { s.delete(chave); });
    },
  };
})();

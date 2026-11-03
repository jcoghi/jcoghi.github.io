// Servidor local do site: abre o banco de cartas no navegador e grava em dados/cartas.js
// os preços editados no site (botão ✎).
// Uso: npm run site   (depois abra http://localhost:8080; outra porta: PORTA=3000 npm run site)
//
// Só atende o próprio computador (127.0.0.1). No GitHub Pages ou abrindo o index.html direto
// não há servidor, e o site guarda o preço editado só no navegador.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ARQUIVO_BANCO, type CartaBanco } from './banco.ts';

const RAIZ = path.join(import.meta.dirname, '..');
const PORTA = Number(process.env.PORTA) || 8080;
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class ErroPedido extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

// Troca o preço de uma entrada direto na linha dela (uma carta por linha) e a data de atualização;
// o resto do arquivo fica como está
function gravarPreco(id: string, preco: number | null): { carta: CartaBanco; atualizadoEm: string } {
  const texto = fs.readFileSync(ARQUIVO_BANCO, 'utf8');
  const fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
  const linhas = texto.split(/\r?\n/);

  const i = linhas.findIndex((l) => l.trimStart().startsWith(`{"id":${JSON.stringify(id)},`));
  if (i < 0) throw new ErroPedido(404, `carta ${id} não encontrada em dados/cartas.js`);
  const virgula = linhas[i].trimEnd().endsWith(',') ? ',' : '';
  const carta = JSON.parse(linhas[i].trim().replace(/,$/, '')) as CartaBanco;
  carta.preco = preco;
  linhas[i] = '    ' + JSON.stringify(carta) + virgula;

  const atualizadoEm = new Date().toISOString();
  const j = linhas.findIndex((l) => l.trimStart().startsWith('"atualizadoEm"'));
  if (j >= 0) linhas[j] = `  "atualizadoEm": ${JSON.stringify(atualizadoEm)},`;

  fs.writeFileSync(ARQUIVO_BANCO, linhas.join(fimDeLinha));
  return { carta, atualizadoEm };
}

function lerCorpo(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.setEncoding('utf8');
    req.on('data', (parte: string) => {
      corpo += parte;
      if (corpo.length > 10_000) reject(new ErroPedido(413, 'pedido grande demais'));
    });
    req.on('end', () => resolve(corpo));
    req.on('error', reject);
  });
}

function responderJson(res: http.ServerResponse, status: number, dados: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(dados));
}

// PUT /api/preco  { "id": "dlr-033-foil", "preco": 39.9 }   (preco null = sem preço)
async function atualizarPreco(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let dados: { id?: unknown; preco?: unknown };
  try {
    dados = JSON.parse(await lerCorpo(req));
  } catch (erro) {
    if (erro instanceof ErroPedido) throw erro;
    throw new ErroPedido(400, 'JSON inválido');
  }
  const { id, preco } = dados;
  if (typeof id !== 'string' || !id) throw new ErroPedido(400, 'id da carta faltando');
  if (preco !== null && (typeof preco !== 'number' || !Number.isFinite(preco) || preco < 0)) {
    throw new ErroPedido(400, 'preço inválido');
  }
  const resultado = gravarPreco(id, preco === null ? null : Math.round(preco * 100) / 100);
  const valor = resultado.carta.preco == null ? 'sem preço' : `R$ ${Number(resultado.carta.preco).toFixed(2).replace('.', ',')}`;
  console.log(`${new Date().toLocaleTimeString('pt-BR')}  ${id} (${resultado.carta.nomePT}) -> ${valor}`);
  responderJson(res, 200, resultado);
}

function servirArquivo(caminhoUrl: string, res: http.ServerResponse): void {
  const arquivo = path.join(RAIZ, caminhoUrl === '/' ? 'index.html' : caminhoUrl);
  if (!arquivo.startsWith(RAIZ + path.sep)) throw new ErroPedido(403, 'fora da pasta do site');
  fs.readFile(arquivo, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('não encontrado');
      return;
    }
    // Sem cache: dados/cartas.js muda a cada preço gravado
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(conteudo);
  });
}

const servidor = http.createServer(async (req, res) => {
  try {
    const caminho = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if (caminho === '/api/status') responderJson(res, 200, { ok: true });
    else if (caminho === '/api/preco' && req.method === 'PUT') await atualizarPreco(req, res);
    else if (caminho.startsWith('/api/')) throw new ErroPedido(404, 'rota não encontrada');
    else servirArquivo(caminho, res);
  } catch (erro) {
    const status = erro instanceof ErroPedido ? erro.status : 500;
    if (status === 500) console.error(erro);
    responderJson(res, status, { erro: (erro as Error).message });
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Banco de cartas em http://localhost:${PORTA}  (Ctrl+C para parar)`);
  console.log('Preços editados no site são gravados em dados/cartas.js.');
});

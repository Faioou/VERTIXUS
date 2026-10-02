const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'perguntas.json');
const EXPRESSIONS_FILE = path.join(ROOT, 'data', 'expressoes.json');
const IMAGE_DIR = path.join(ROOT, 'imagens');
const PORT = process.env.PORT || 3000;

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function safeReadJSON() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeJSON(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function safeReadExpressions() {
  try { return JSON.parse(fs.readFileSync(EXPRESSIONS_FILE, 'utf8')); }
  catch { return []; }
}
function writeExpressions(data) {
  fs.writeFileSync(EXPRESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function sanitizeFilename(name='imagem.png') {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '-');
}
function staticFile(reqPath, res) {
  let rel = decodeURIComponent(reqPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  const ext = path.extname(file).toLowerCase();
  const types = {
    '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'
  };
  res.writeHead(200, {'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
}
function collectJSON(req) {
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data', c => {
      data += c;
      if (data.length > 12 * 1024 * 1024) req.destroy();
    });
    req.on('end', ()=>{ try { resolve(JSON.parse(data||'{}')); } catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req,res)=>{
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/api/questions') {
    if (req.method === 'GET') return send(res,200,safeReadJSON());
    if (req.method === 'PUT') {
      try {
        const body = await collectJSON(req);
        if (!Array.isArray(body)) return send(res,400,{error:'É esperado um array de perguntas.'});
        writeJSON(body);
        return send(res,200,{ok:true,count:body.length});
      } catch(e) { return send(res,400,{error:'JSON inválido.'}); }
    }
    return send(res,405,{error:'Método não permitido.'});
  }


  if (u.pathname === '/api/expressions') {
    if (req.method === 'GET') return send(res,200,safeReadExpressions());
    if (req.method === 'PUT') {
      try {
        const body = await collectJSON(req);
        if (!Array.isArray(body)) return send(res,400,{error:'É esperado um array de expressões.'});
        writeExpressions(body);
        return send(res,200,{ok:true,count:body.length});
      } catch(e) { return send(res,400,{error:'JSON inválido.'}); }
    }
    return send(res,405,{error:'Método não permitido.'});
  }

  if (u.pathname === '/api/upload-image' && req.method === 'POST') {
    try {
      const body = await collectJSON(req);
      if (!body.dataUrl || !body.filename) return send(res,400,{error:'Imagem inválida.'});
      const m = body.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) return send(res,400,{error:'Formato de imagem inválido.'});
      fs.mkdirSync(IMAGE_DIR,{recursive:true});
      const filename = `${Date.now()}-${sanitizeFilename(body.filename)}`;
      fs.writeFileSync(path.join(IMAGE_DIR, filename), Buffer.from(m[2], 'base64'));
      return send(res,200,{ok:true,path:`imagens/${filename}`});
    } catch(e) { return send(res,400,{error:'Falha ao guardar a imagem.'}); }
  }

  staticFile(u.pathname,res);
});

server.listen(PORT, ()=> {
  console.log(`Código da Estrada PT: http://localhost:${PORT}`);
  console.log('Modo administrador ativo. Perguntas: data/perguntas.json | Expressões: data/expressoes.json');
});

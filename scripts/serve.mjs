import './build.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
const root=new URL('../dist/',import.meta.url); const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{let p=decodeURIComponent((req.url||'/').split('?')[0]); if(p==='/')p='/index.html'; p=normalize(p).replace(/^\.\.(\/|\\|$)/,''); let file=new URL('.'+p,root); let s=await stat(file); if(s.isDirectory())file=new URL('index.html',file); const data=await readFile(file);res.writeHead(200,{'content-type':types[extname(file.pathname)]||'application/octet-stream'});res.end(data)}catch{const data=await readFile(new URL('index.html',root));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(data)}}).listen(port,()=>console.log(`http://localhost:${port}`));

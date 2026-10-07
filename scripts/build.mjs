import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for (const file of ['index.html','styles.css','manifest.webmanifest','assets']) {
  await cp(new URL(file,root),new URL(file,dist),{recursive:true});
}
await cp(new URL('src/app.js',root),new URL('app.js',dist));
const url=process.env.SUPABASE_URL||'https://bzhsnoqlbhjaaheugpku.supabase.co';
const key=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_tabhDS6lYWGXk6jlTPF0Ig_FwPA6gUH';
if (!!url !== !!key) throw Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntos.');
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw Error('SUPABASE_URL inválida.');
if (key && !(key.startsWith('sb_publishable_') || key.startsWith('eyJ'))) throw Error('Use apenas chave pública/publishable no frontend.');
await writeFile(new URL('public-config.js',dist),`export const config = ${JSON.stringify({url,key})};\n`);
await writeFile(new URL('.nojekyll',dist),'');
console.log(`Droga Vida Entregas pronto em dist/. Supabase: ${url?'configurado':'modo demonstração'}`);

import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import worker from '../server/index.js';
test('Consulta pública dispensa login, mas conexão e alterações exigem autorização',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('server/schema.sql','utf8'));sqlite.exec(fs.readFileSync('server/migrations/002-diagnostics.sql','utf8'));
 const DB={prepare(sql){const stmt=sqlite.prepare(sql);const wrap=args=>({first:async()=>stmt.get(...args)||null,run:async()=>stmt.run(...args),all:async()=>({results:stmt.all(...args)})});return{...wrap([]),bind:(...args)=>wrap(args)};}};
 const owner='a'.repeat(64);const digest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
 sqlite.prepare('INSERT INTO diagnostic_keys VALUES(?,?)').run('owner',await digest(owner));
 const call=(path,data,headers={})=>worker.fetch(new Request('https://nfse-conecta.pages.dev/api/diagnostics/'+path,{method:data?'POST':'GET',headers:{origin:'https://nfse-conecta.pages.dev','content-type':'application/json',...headers},body:data?JSON.stringify(data):undefined}),{DB});
 assert.equal((await call('list')).status,200);assert.equal((await call('connect',{})).status,401);assert.equal((await(await call('access')).json()).admin,false);assert.equal((await call('login',{key:owner},{origin:'https://example.com'})).status,403);
 const login=await call('login',{key:owner});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);const cookie=login.headers.get('set-cookie').split(';')[0];
 const access=await(await call('connect',{}, {cookie})).json();const authorization='Bearer '+access.token;
 const report={stage:'people',reason:'missing-field',version:'0.7.0',missing:['DataCompetencia'],added:0,removed:1,requiredAdded:0,fingerprint:'b'.repeat(64)};
 assert.equal((await call('report',{...report,cnpj:'1'.repeat(14)},{authorization})).status,400);assert.equal((await call('report',report)).status,401);
 assert.equal((await call('report',report,{authorization})).status,200);assert.equal((await call('report',report,{authorization})).status,200);
 assert.equal((await call('list',undefined,{authorization})).status,200);assert.equal((await call('status',{id:'b'.repeat(64),status:'fixed'},{authorization})).status,401);
 const listing=await(await call('list',undefined,{cookie})).json();assert.equal(listing.reports.length,1);assert.equal(listing.reports[0].count,2);
 await call('status',{id:listing.reports[0].id,status:'reviewing'},{cookie});assert.equal((await(await call('list',undefined,{cookie})).json()).reports[0].status,'reviewing');
 await call('logout',{}, {cookie});assert.equal((await call('list',undefined,{cookie})).status,200);assert.equal((await call('connect',{}, {cookie})).status,401);
});

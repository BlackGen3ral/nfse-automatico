const hex=/^[a-f0-9]{64}$/;
const stages=['people','service','values'];
export const knownFields=['DataCompetencia','btnAvancar','ServicoPrestado_Descricao','ServicoPrestado_CodigoTributacaoNacional','ServicoPrestado_CodigoNBS','ServicoPrestado_CodigoIndOp','Valores_ValorServico','ValorTributos_CodigoSituacaoTributaria','ValorTributos_CodigoClassificacaoTributaria'];
export function validDiagnostic(d){
 return d && Object.keys(d).every(k=>['stage','reason','version','missing','added','removed','requiredAdded','fingerprint'].includes(k)) && stages.includes(d.stage) && ['layout-change','missing-field','step-error'].includes(d.reason) && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(d.version) && hex.test(d.fingerprint) && Array.isArray(d.missing) && d.missing.length<=knownFields.length && d.missing.every(k=>knownFields.includes(k)) && ['added','removed','requiredAdded'].every(k=>Number.isInteger(d[k])&&d[k]>=0&&d[k]<=500);
}
export async function diagnostics(request,env,{body,hash,token,json,limited,ApiError}){
 const path=new URL(request.url).pathname,db=env.DB;
 const fail=(status,message)=>{throw new ApiError(status,message);};
 const sameOrigin=()=>{if(!['https://nfse-conecta.pages.dev','https://nfse-conecta.arthurgabrielfera.workers.dev'].includes(request.headers.get('origin')))fail(403,'Origem inválida.');};
 const session=async()=>{
  const key=request.headers.get('cookie')?.match(/(?:^|; )nfse_diag=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!key || !await db.prepare('SELECT hash FROM diagnostic_sessions WHERE hash=? AND expires>?').bind(await hash(key),Date.now()).first())fail(401,'Entre no painel para continuar.');
 };
 if(path==='/api/diagnostics/login'&&request.method==='POST'){
  sameOrigin();await limited(request,db);const input=await body(request);
  if(!hex.test(input.key||'')||!await db.prepare("SELECT hash FROM diagnostic_keys WHERE kind='owner' AND hash=?").bind(await hash(input.key)).first())fail(401,'Chave de acesso inválida.');
  const key=token();await db.prepare('DELETE FROM diagnostic_sessions WHERE expires<?').bind(Date.now()).run();
  await db.prepare('INSERT INTO diagnostic_sessions(hash,expires) VALUES(?,?)').bind(await hash(key),Date.now()+7*86400000).run();
  const response=json({ok:true});response.headers.set('set-cookie','nfse_diag='+key+'; HttpOnly; Secure; SameSite=Strict; Path=/api/diagnostics; Max-Age=604800');return response;
 }
 if(path==='/api/diagnostics/report'&&request.method==='POST'){
  const bearer=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!bearer||!await db.prepare("SELECT hash FROM diagnostic_keys WHERE kind LIKE 'reporter:%' AND hash=?").bind(await hash(bearer)).first())fail(401,'Conecte a extensão ao painel novamente.');
  await limited(request,db);const d=await body(request);if(!validDiagnostic(d))fail(400,'Diagnóstico fora do formato permitido. Nenhum dado foi guardado.');
  const id=await hash(JSON.stringify(d));
  await db.prepare("INSERT INTO diagnostics(id,payload,created,last_seen,count,status) VALUES(?,?,?,?,1,'new') ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,count=count+1").bind(id,JSON.stringify(d),Date.now(),Date.now()).run();
  await db.prepare('DELETE FROM diagnostics WHERE last_seen<?').bind(Date.now()-90*86400000).run();return json({ok:true});
 }
 await session();
 if(path==='/api/diagnostics/list'&&request.method==='GET'){
  const result=await db.prepare('SELECT * FROM diagnostics ORDER BY last_seen DESC LIMIT 100').all();return json({reports:result.results});
 }
 if(request.method==='POST')sameOrigin();
 if(path==='/api/diagnostics/connect'&&request.method==='POST'){
  const key=token(),id=crypto.randomUUID();await db.prepare('INSERT INTO diagnostic_keys(kind,hash) VALUES(?,?)').bind('reporter:'+id,await hash(key)).run();return json({token:key});
 }
 if(path==='/api/diagnostics/status'&&request.method==='POST'){
  const input=await body(request);if(!hex.test(input.id||'')||!['new','reviewing','fixed'].includes(input.status))fail(400,'Estado inválido.');
  await db.prepare('UPDATE diagnostics SET status=? WHERE id=?').bind(input.status,input.id).run();return json({ok:true});
 }
 if(path==='/api/diagnostics/logout'&&request.method==='POST'){
  const key=request.headers.get('cookie')?.match(/nfse_diag=([a-f0-9]{64})/)?.[1];await db.prepare('DELETE FROM diagnostic_sessions WHERE hash=?').bind(await hash(key)).run();const response=json({ok:true});response.headers.set('set-cookie','nfse_diag=; HttpOnly; Secure; SameSite=Strict; Path=/api/diagnostics; Max-Age=0');return response;
 }
 fail(404,'Endereço não encontrado.');
}

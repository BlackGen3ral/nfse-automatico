export async function power(request,db,device,pc,{body,json,ApiError}){
 const path=new URL(request.url).pathname,now=Date.now();
 if(!['/api/power','/api/power/shutdown','/api/power/cancel','/api/pc/power','/api/pc/power/ack','/api/pc/power/commit'].includes(path))return null;
 await db.prepare("UPDATE power_commands SET state='error',message='O comando expirou sem concluir.' WHERE expires<? AND state IN('queued','scheduled')").bind(now).run();
 if(!pc&&path==='/api/power'&&request.method==='GET'){
  const command=await db.prepare('SELECT id,state,deadline,expires,message FROM power_commands WHERE device_id=? ORDER BY created DESC LIMIT 1').bind(device.id).first();
  return json({ready:!!device.power_ready,command,serverNow:now});
 }
 if(!pc&&path==='/api/power/shutdown'&&request.method==='POST'){
  const input=await body(request);if(!/^[a-f0-9-]{36}$/.test(input.id||''))throw new ApiError(400,'Comando inválido.');
  const old=await db.prepare('SELECT device_id FROM power_commands WHERE id=?').bind(input.id).first();if(old){if(old.device_id!==device.id)throw new ApiError(409,'Comando inválido.');return json({id:input.id});}
  if(!device.power_ready)throw new ApiError(409,'Atualize o app do PC para 1.7.0 e mantenha-o aberto.');
  if(now-device.last_seen>=20000)throw new ApiError(409,'O PC precisa estar conectado para receber o desligamento.');
  try{await db.prepare("INSERT INTO power_commands(id,device_id,state,created,expires,message) VALUES(?,?,'queued',?,?,'Aguardando o PC confirmar o desligamento.')").bind(input.id,device.id,now,now+120000).run();}catch{throw new ApiError(409,'Conclua ou pare as notas antes de desligar. Confira também se já existe um desligamento em andamento.');}
  return json({id:input.id},201);
 }
 if(!pc&&path==='/api/power/cancel'&&request.method==='POST'){
  const input=await body(request);const result=await db.prepare("UPDATE power_commands SET state='cancelled',message='Desligamento cancelado.' WHERE id=? AND device_id=? AND state IN('queued','scheduled','cancelled') RETURNING id").bind(input.id||'',device.id).first();
  if(!result)throw new ApiError(409,'Não foi possível cancelar: o comando já terminou ou foi enviado ao Windows.');return json({ok:true});
 }
 if(pc&&path==='/api/pc/power'&&request.method==='POST'){
  await body(request);await db.prepare('UPDATE devices SET power_ready=1 WHERE id=? AND power_ready=0').bind(device.id).run();
  const command=await db.prepare('SELECT id,state,deadline,expires FROM power_commands WHERE device_id=? ORDER BY created DESC LIMIT 1').bind(device.id).first();return json({command,remainingMs:command?.deadline?Math.max(0,command.deadline-now):null});
 }
 if(pc&&path==='/api/pc/power/ack'&&request.method==='POST'){
  const input=await body(request);if(!['scheduled','error'].includes(input.state))throw new ApiError(400,'Estado inválido.');
  const due=now;
  await db.prepare("UPDATE power_commands SET state=?,deadline=COALESCE(deadline,?),message=? WHERE id=? AND device_id=? AND expires>? AND (state IN('queued','scheduled') OR (state='executed' AND ?='error'))").bind(input.state,due,input.state==='scheduled'?'Desligamento imediato confirmado pelo PC.':'O app do PC recusou o desligamento. Confira se há notas em andamento ou se ele reiniciou.',input.id,device.id,now,input.state).run();
  return json({ok:true});
 }
 if(pc&&path==='/api/pc/power/commit'&&request.method==='POST'){
  const input=await body(request);const result=await db.prepare("UPDATE power_commands SET state='executed',message='Pedido enviado ao Windows. Aguarde o PC desconectar; um aplicativo aberto pode impedir o desligamento.' WHERE id=? AND device_id=? AND state='scheduled' AND deadline<=? AND expires>? AND NOT EXISTS(SELECT 1 FROM jobs WHERE device_id=? AND state IN('queued','claimed','running')) RETURNING id").bind(input.id,device.id,now,now,device.id).first();
  return json({allowed:!!result});
 }
 throw new ApiError(404,'Comando de energia não encontrado.');
}

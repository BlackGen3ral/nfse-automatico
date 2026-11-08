export function validateWakeConfig(input) {
  if (input?.enabled === false) return {enabled:false,autoStart:input.autoStart===true};
  if (input?.enabled !== true || typeof input.autoStart !== 'boolean' ||
      !/^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/i.test(input.mac||'') ||
      (/^(?:00:){5}00$/i.test(input.mac)||(parseInt(input.mac.slice(0,2),16)&1)!==0)) throw new Error('Configuração de rede inválida.');
  const ip=String(input.broadcast||'').split('.').map(Number);
  if (ip.length!==4 || ip.some(n=>!Number.isInteger(n)||n<0||n>255) ||
      !(ip[0]===10 || ip[0]===172&&ip[1]>=16&&ip[1]<=31 || ip[0]===192&&ip[1]===168)) throw new Error('Endereço de rede local inválido.');
  return {enabled:true,autoStart:input.autoStart,mac:input.mac.toUpperCase(),broadcast:ip.join('.'),adapter:String(input.adapter||'Ethernet').slice(0,100)};
}
export function canWaitForPc(device) {
  try {const config=JSON.parse(device.wake_config||'null');return config?.enabled===true&&config.autoStart===true;}catch{return false;}
}

export function validatePin(value) {
 if(typeof value!=='string'||!/^\d{4}$/.test(value))throw new Error('El PIN debe tener exactamente cuatro números.');
 return value;
}
export function normalizeUsername(value){
 const username=String(value||'').trim().toLowerCase();
 if(!/^[a-z0-9_]{2,32}$/.test(username))throw new Error('Escribe tu nombre de usuario.');
 return username;
}
export function activationFromHash(hash){
 const p=new URLSearchParams(hash.replace(/^#/,''));
 const token=p.get('activate');
 if(!token)return null;
 if(!/^[a-f0-9]{64}$/.test(token))throw new Error('El enlace de activación no es válido.');
 return {token,username:normalizeUsername(p.get('user'))};
}

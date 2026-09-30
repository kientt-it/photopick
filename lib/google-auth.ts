import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { env } from "cloudflare:workers";

export const GOOGLE_SESSION_COOKIE = "photopick_google_session";
export const GOOGLE_STATE_COOKIE = "photopick_google_oauth_state";

export type GoogleSession = { sub:string; email:string; name:string; exp:number };

function toBase64Url(bytes:Uint8Array) {
  let binary="";
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
}

function fromBase64Url(value:string) {
  const base64=value.replaceAll("-","+").replaceAll("_","/");
  const binary=atob(base64+"=".repeat((4-base64.length%4)%4));
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

async function signature(value:string) {
  const secret=env.AUTH_SESSION_SECRET;
  if(!secret) throw new Error("Thiếu AUTH_SESSION_SECRET để xác thực phiên Google.");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));
}

export async function createGoogleSessionToken(session:GoogleSession) {
  const payload=toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  return `${payload}.${await signature(payload)}`;
}

export async function readGoogleSession(jar:ReadonlyRequestCookies):Promise<GoogleSession|null> {
  const value=jar.get(GOOGLE_SESSION_COOKIE)?.value;
  if(!value) return null;
  const [payload,supplied,...rest]=value.split(".");
  if(!payload||!supplied||rest.length) return null;
  const expected=await signature(payload).catch(()=>"");
  const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(expected);
  if(a.length!==b.length) return null;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff!==0)return null;
  try {
    const session=JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as GoogleSession;
    if(!session.sub||!session.email||!session.name||!Number.isFinite(session.exp)||session.exp<Date.now()/1000) return null;
    return session;
  } catch { return null; }
}

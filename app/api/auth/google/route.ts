import { env } from "cloudflare:workers";
import { NextRequest,NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE } from "@/lib/google-auth";

function randomState(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");}
function safeReturnTo(value:string){return value.startsWith("/")&&!value.startsWith("//")?value:"/albums";}

export async function GET(request:NextRequest){
  if(!env.GOOGLE_OAUTH_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET||!env.AUTH_SESSION_SECRET){
    const target=new URL("/albums",request.url);target.searchParams.set("authError","google-not-configured");
    return NextResponse.redirect(target);
  }
  const nonce=randomState();
  const returnTo=safeReturnTo(request.nextUrl.searchParams.get("return_to")??"/albums");
  const state=btoa(encodeURIComponent(JSON.stringify({nonce,returnTo}))).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
  const callback=new URL("/api/auth/google/callback",request.url).toString();
  const target=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search=new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,redirect_uri:callback,response_type:"code",scope:"openid email profile",state,prompt:"select_account"}).toString();
  const response=NextResponse.redirect(target);
  response.cookies.set(GOOGLE_STATE_COOKIE,nonce,{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/api/auth/google/callback",maxAge:600});
  return response;
}

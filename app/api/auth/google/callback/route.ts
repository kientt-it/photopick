import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { NextRequest,NextResponse } from "next/server";
import { createGoogleSessionToken,GOOGLE_SESSION_COOKIE,GOOGLE_STATE_COOKIE } from "@/lib/google-auth";

type TokenResponse={access_token?:string;error?:string};
type GoogleProfile={sub?:string;email?:string;email_verified?:boolean;name?:string};

function safeReturnTo(value:string){return value.startsWith("/")&&!value.startsWith("//")?value:"/albums";}
function clearState(response:NextResponse,secure:boolean){response.cookies.set(GOOGLE_STATE_COOKIE,"",{httpOnly:true,secure,sameSite:"lax",path:"/api/auth/google/callback",maxAge:0});}

export async function GET(request:NextRequest){
  const secure=request.nextUrl.protocol==="https:";
  const query=request.nextUrl.searchParams;
  const jar=await cookies();
  const suppliedState=query.get("state")??"";
  let state:{nonce:string;returnTo:string}|null=null;
  try{const padded=suppliedState.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-suppliedState.length%4)%4);state=JSON.parse(decodeURIComponent(atob(padded))) as {nonce:string;returnTo:string};}catch{}
  const target=new URL("/albums",request.url);
  const fail=(reason:string)=>{target.searchParams.set("authError",reason);const response=NextResponse.redirect(target);clearState(response,secure);return response;};
  if(query.has("error"))return fail("google-cancelled");
  if(!state?.nonce||state.nonce!==jar.get(GOOGLE_STATE_COOKIE)?.value)return fail("invalid-oauth-state");
  if(!query.get("code")||!env.GOOGLE_OAUTH_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET||!env.AUTH_SESSION_SECRET)return fail("google-not-configured");
  try{
    const callback=new URL("/api/auth/google/callback",request.url).toString();
    const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:query.get("code")!,client_id:env.GOOGLE_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,redirect_uri:callback,grant_type:"authorization_code"})});
    const token=await tokenResponse.json() as TokenResponse;
    if(!tokenResponse.ok||!token.access_token) return fail("google-token-error");
    const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${token.access_token}`}});
    const profile=await profileResponse.json() as GoogleProfile;
    if(!profileResponse.ok||!profile.sub||!profile.email||!profile.email_verified)return fail("google-profile-error");
    const value=await createGoogleSessionToken({sub:profile.sub,email:profile.email.toLowerCase(),name:profile.name??profile.email,exp:Math.floor(Date.now()/1000)+60*60*24*30});
    const response=NextResponse.redirect(new URL(safeReturnTo(state.returnTo),request.url));
    response.cookies.set(GOOGLE_SESSION_COOKIE,value,{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:60*60*24*30});
    clearState(response,secure);
    return response;
  }catch(error){console.error("Google sign-in failed",error);return fail("google-sign-in-failed");}
}

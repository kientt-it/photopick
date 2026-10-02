import { NextRequest,NextResponse } from "next/server";
import { GOOGLE_SESSION_COOKIE,GOOGLE_STATE_COOKIE } from "@/lib/google-auth";

function safeReturnTo(value:string|null){return value?.startsWith("/")&&!value.startsWith("//")?value:"/albums";}

export async function POST(request:NextRequest){
  const form=await request.formData().catch(()=>null);
  const target=safeReturnTo(form?.get("return_to")?.toString()??null);
  const secure=request.nextUrl.protocol==="https:";
  const response=NextResponse.redirect(new URL(target,request.url),303);
  response.cookies.set(GOOGLE_SESSION_COOKIE,"",{httpOnly:true,secure,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(GOOGLE_STATE_COOKIE,"",{httpOnly:true,secure,sameSite:"lax",path:"/api/auth/google/callback",maxAge:0});
  return response;
}

import { env } from "cloudflare:workers";
import { ApiError } from "./server";

type DriveFile = { id:string; name:string; mimeType:string; modifiedTime?:string; thumbnailLink?:string; webViewLink?:string };
let cachedToken: { value:string; expires:number } | null = null;

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function serviceToken() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) return null;
  if (cachedToken && cachedToken.expires > Date.now()+60000) return cachedToken.value;
  const issued = Math.floor(Date.now()/1000);
  const claim = {iss:env.GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:issued,exp:issued+3600};
  const unsigned = `${encode({alg:"RS256",typ:"JWT"})}.${encode(claim)}`;
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const bytes = Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8",bytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
  if (!response.ok) throw new ApiError(502,"Không thể xác thực với Google Drive.");
  const result = await response.json() as {access_token:string;expires_in:number};
  cachedToken = {value:result.access_token,expires:Date.now()+result.expires_in*1000};
  return result.access_token;
}

async function credentials() {
  const token = await serviceToken();
  if (token) return {headers:{Authorization:`Bearer ${token}`},key:null as string|null};
  if (env.DRIVE_API_KEY) return {headers:{} as Record<string,string>,key:env.DRIVE_API_KEY};
  throw new ApiError(422,"Chưa cấu hình quyền truy cập Google Drive trên máy chủ.");
}

export function folderIdFromUrl(value: string) {
  const match = value.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/);
  if (!match) throw new ApiError(400,"Link thư mục Google Drive không hợp lệ.");
  return match[1];
}

export async function listDriveImages(folderId:string): Promise<DriveFile[]> {
  const auth = await credentials();
  const all:DriveFile[]=[];
  let pageToken:string|undefined;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q",`'${folderId}' in parents and trashed = false`);
    url.searchParams.set("fields","nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink,webViewLink)");
    url.searchParams.set("pageSize","1000");
    url.searchParams.set("supportsAllDrives","true");
    url.searchParams.set("includeItemsFromAllDrives","true");
    if (pageToken) url.searchParams.set("pageToken",pageToken);
    if (auth.key) url.searchParams.set("key",auth.key);
    const response = await fetch(url,{headers:auth.headers});
    if (!response.ok) throw new ApiError(502,`Google Drive không thể tải thư mục (${response.status}). Kiểm tra quyền chia sẻ và cấu hình kết nối.`);
    const page = await response.json() as {nextPageToken?:string;files:DriveFile[]};
    all.push(...page.files.filter(file=>["image/jpeg","image/png","image/webp"].includes(file.mimeType) && /\.(jpe?g|png|webp)$/i.test(file.name)));
    pageToken=page.nextPageToken;
  } while(pageToken);
  return all;
}

export async function fetchDriveImage(fileId:string) {
  const auth=await credentials();
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt","media");
  if(auth.key) url.searchParams.set("key",auth.key);
  return fetch(url,{headers:auth.headers});
}

function highResolutionThumbnail(link:string,width:number) {
  // Drive commonly returns a small `s220`/`w220-h220` derivative. Request a
  // sized derivative so each screen gets enough pixels without downloading a
  // 1200px image on a small phone.
  if (/=s\d+/i.test(link)) return link.replace(/=s\d+/i,`=s${width}`);
  if (/=w\d+-h\d+/i.test(link)) return link.replace(/=w\d+-h\d+/i,`=w${width}-h${width}`);
  return link;
}

export async function fetchDriveThumbnail(fileId:string,storedLink:string|null,width=1200) {
  const auth=await credentials();
  if(storedLink){const cached=await fetch(highResolutionThumbnail(storedLink,width),{headers:auth.headers});if(cached.ok)return {response:cached,link:storedLink};}
  const metadataUrl=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metadataUrl.searchParams.set("fields","thumbnailLink");
  if(auth.key) metadataUrl.searchParams.set("key",auth.key);
  const metadataResponse=await fetch(metadataUrl,{headers:auth.headers});
  if(metadataResponse.ok){const metadata=await metadataResponse.json() as {thumbnailLink?:string};if(metadata.thumbnailLink){const fresh=await fetch(highResolutionThumbnail(metadata.thumbnailLink,width),{headers:auth.headers});if(fresh.ok)return {response:fresh,link:metadata.thumbnailLink};}}
  return {response:await fetchDriveImage(fileId),link:storedLink};
}

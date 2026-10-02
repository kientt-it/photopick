import type {Album,AlbumData,DiscoveryPhoto,Result,User} from "@/types";

async function request<T>(path:string, options?:RequestInit):Promise<T>{
  const response=await fetch(`/api/${path}`,{...options,headers:{"Content-Type":"application/json",...options?.headers},cache:"no-store"});
  if(!response.ok){let message="Không thể hoàn tất thao tác. Vui lòng thử lại.";try{const body=await response.json() as {error?:string};message=body.error??message;}catch{}throw new Error(message);}
  return response.json() as Promise<T>;
}
const post=<T>(path:string,value:unknown)=>request<T>(path,{method:"POST",body:JSON.stringify(value)});
export const api={
  bootstrap:()=>request<{user:User|null;albums:Album[];featuredImages:DiscoveryPhoto[];stats:Record<string,number>|null}>("bootstrap"),
  album:(id:string,filter:string,search:string,offset:number)=>request<AlbumData>(`album/${encodeURIComponent(id)}?filter=${encodeURIComponent(filter)}&search=${encodeURIComponent(search)}&offset=${offset}`),
  photo:(id:string)=>request<{photo:Photo;albumId:string;albumName:string}>(`photo/${encodeURIComponent(id)}`),
  albumConfig:(id:string)=>request<{album:Album}>(`albums/${encodeURIComponent(id)}`),
  selection:(value:{albumId:string;imageId:string;selected?:boolean;note?:string})=>post<{selected:boolean;note:string;selectedAt:string|null;selectedCount:number;sessionStatus:string}>("selection",value),
  submit:(albumId:string)=>post<{submittedAt:string;selectedCount:number}>("submit",{albumId}),
  reselect:(albumId:string)=>post<{status:string}>("reselect",{albumId}),
  saveAlbum:(value:Partial<Album>)=>post<{id:string}>("albums",value),
  sync:(id:string)=>post<{added:number;updated:number;unchanged:number;removed:number;lastSyncAt:string}>(`albums/${encodeURIComponent(id)}/sync`,{}),
  results:(albumId?:string)=>request<{results:Result[]}>(`results${albumId?`?albumId=${encodeURIComponent(albumId)}`:""}`),
  result:(id:string)=>request<{session:Result;images:import("@/types").Photo[]}>(`results/${encodeURIComponent(id)}`),
  users:()=>request<{users:(User&{completedCount:number})[]}>("users"),
  settings:()=>request<{driveConfigured:boolean;method:string;googleAuthConfigured:boolean}>("settings"),
};

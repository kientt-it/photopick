import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, audit, canEdit, currentUser, db, getAlbum, getOrCreateSession, now, requireAdmin, uid } from "@/lib/server";
import { fetchDriveImage, fetchDriveThumbnail, folderIdFromUrl, listDriveImages } from "@/lib/drive";
import { createXlsx } from "@/lib/xlsx";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{path:string[]}> };
const json = (data:unknown,status=200) => NextResponse.json(data,{status});
const albumInput = z.object({
  id:z.string().optional(), name:z.string().trim().min(2).max(120),description:z.string().max(1000).default(""),
  driveFolderUrl:z.string().trim().default(""),minSelection:z.number().int().min(0).max(10000).default(0),
  maxSelection:z.number().int().min(1).max(10000).nullable().default(null),allowNote:z.boolean().default(true),
  allowEditAfterSubmit:z.boolean().default(false),startDate:z.string().nullable().default(null),endDate:z.string().nullable().default(null),
  status:z.enum(["DRAFT","ACTIVE","INACTIVE","ARCHIVED"]).default("DRAFT"),
}).refine(v=>v.maxSelection===null || v.maxSelection>=v.minSelection,{message:"Số ảnh tối đa phải lớn hơn hoặc bằng số tối thiểu."})
  .refine(v=>!v.startDate || !v.endDate || v.startDate<=v.endDate,{message:"Ngày kết thúc phải sau ngày bắt đầu."});

async function handle(request:NextRequest, context:Context) {
  const {path}=await context.params;
  const section=path[0];
  const user=await currentUser();
  const database=db();
  const url=new URL(request.url);
  if(request.method==="GET" && section==="bootstrap") {
    const albums=await database.prepare("SELECT a.id,a.name,a.description,a.status,a.drive_folder_url AS driveFolderUrl,a.min_selection AS minSelection,a.max_selection AS maxSelection,a.last_sync_at AS lastSyncAt,COUNT(i.id) AS imageCount FROM albums a LEFT JOIN images i ON i.album_id=a.id AND i.status='ACTIVE' GROUP BY a.id ORDER BY a.created_at DESC").all();
    const visible=user.role==="ADMIN"?albums.results:albums.results.filter((a:Record<string,unknown>)=>a.status==="ACTIVE");
    const stats=user.role==="ADMIN"?await database.prepare("SELECT (SELECT COUNT(*) FROM albums) AS totalAlbums,(SELECT COUNT(*) FROM albums WHERE status='ACTIVE') AS activeAlbums,(SELECT COUNT(*) FROM images WHERE status='ACTIVE') AS totalImages,(SELECT COUNT(*) FROM image_selections WHERE selected=1) AS totalSelected,(SELECT COUNT(*) FROM selection_sessions WHERE status='SUBMITTED') AS completeUsers,(SELECT COUNT(*) FROM selection_sessions WHERE status='DRAFT') AS pendingUsers").first():null;
    return json({user,albums:visible,stats});
  }
  if(request.method==="GET" && section==="album" && path[1]) {
    const album=await getAlbum(path[1]);
    if(album.status!=="ACTIVE" && user.role!=="ADMIN") throw new ApiError(403,"Album hiện không mở để xem.");
    const session=await getOrCreateSession(path[1],user.id);
    const filter=url.searchParams.get("filter")??"all";
    const search=(url.searchParams.get("search")??"").slice(0,100);
    const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get("offset")??0)||0));
    let where="i.album_id = ? AND i.status = 'ACTIVE'";
    const args:(string|number|null)[]=[path[1]];
    if(search){where+=" AND i.file_name LIKE ?";args.push(`%${search}%`);}
    if(filter==="selected"){where+=" AND EXISTS (SELECT 1 FROM image_selections s WHERE s.image_id=i.id AND s.session_id=? AND s.selected=1)";args.push(String(session.id));}
    if(filter==="unselected"){where+=" AND NOT EXISTS (SELECT 1 FROM image_selections s WHERE s.image_id=i.id AND s.session_id=? AND s.selected=1)";args.push(String(session.id));}
    if(filter==="noted"){where+=" AND EXISTS (SELECT 1 FROM image_selections s WHERE s.image_id=i.id AND s.session_id=? AND LENGTH(TRIM(s.note))>0)";args.push(String(session.id));}
    const total=await database.prepare(`SELECT COUNT(*) AS count FROM images i WHERE ${where}`).bind(...args).first<{count:number}>();
    const images=await database.prepare(`SELECT i.id,i.file_name AS fileName,i.mime_type AS mimeType,i.thumbnail_url AS thumbnailUrl,i.preview_url AS previewUrl,i.drive_url AS driveUrl,s.selected,s.note,s.selected_at AS selectedAt FROM images i LEFT JOIN image_selections s ON s.image_id=i.id AND s.session_id=? WHERE ${where} ORDER BY i.file_name LIMIT 30 OFFSET ?`).bind(session.id,...args,offset).all();
    const selectedCount=await database.prepare("SELECT COUNT(*) AS count FROM image_selections WHERE session_id=? AND selected=1").bind(session.id).first<{count:number}>();
    const allCount=await database.prepare("SELECT COUNT(*) AS count FROM images WHERE album_id=? AND status='ACTIVE'").bind(path[1]).first<{count:number}>();
    return json({album,session,images:images.results,total:total?.count??0,allCount:allCount?.count??0,selectedCount:selectedCount?.count??0,hasMore:offset+images.results.length<(total?.count??0)});
  }
  if(request.method==="GET" && section==="albums" && path[1] && !path[2]) {
    requireAdmin(user);
    return json({album:await getAlbum(path[1])});
  }
  if(request.method==="POST" && section==="albums" && !path[1]) {
    requireAdmin(user);
    const input=albumInput.parse(await request.json());
    const folderId=input.driveFolderUrl?folderIdFromUrl(input.driveFolderUrl):null;
    const stamp=now();const id=input.id??uid();
    if(input.id) {
      const existing=await getAlbum(id);
      if(existing.status==="ARCHIVED") throw new ApiError(409,"Không thể sửa album đã lưu trữ.");
      await database.prepare("UPDATE albums SET name=?,description=?,drive_folder_id=?,drive_folder_url=?,min_selection=?,max_selection=?,allow_note=?,allow_edit_after_submit=?,start_date=?,end_date=?,status=?,updated_at=? WHERE id=?")
        .bind(input.name,input.description,folderId,input.driveFolderUrl||null,input.minSelection,input.maxSelection,Number(input.allowNote),Number(input.allowEditAfterSubmit),input.startDate||null,input.endDate||null,input.status,stamp,id).run();
      await audit(user.id,id,"ALBUM_UPDATED",{name:input.name,status:input.status});
    } else {
      await database.prepare("INSERT INTO albums (id,name,description,drive_folder_id,drive_folder_url,min_selection,max_selection,allow_note,allow_edit_after_submit,start_date,end_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,input.name,input.description,folderId,input.driveFolderUrl||null,input.minSelection,input.maxSelection,Number(input.allowNote),Number(input.allowEditAfterSubmit),input.startDate||null,input.endDate||null,input.status,stamp,stamp).run();
      await audit(user.id,id,"ALBUM_CREATED",{name:input.name});
    }
    return json({id});
  }
  if(request.method==="POST" && section==="albums" && path[2]==="sync") {
    requireAdmin(user);
    const album=await getAlbum(path[1]);
    if(!album.driveFolderId) throw new ApiError(422,"Hãy nhập link thư mục Google Drive trước khi đồng bộ.");
    const files=await listDriveImages(String(album.driveFolderId));
    const previous=await database.prepare("SELECT id,drive_file_id AS driveFileId,source_modified_at AS sourceModifiedAt,status FROM images WHERE album_id=? AND drive_file_id IS NOT NULL").bind(path[1]).all<{id:string;driveFileId:string;sourceModifiedAt:string|null;status:string}>();
    const byDrive=new Map(previous.results.map(item=>[item.driveFileId,item]));
    const seen=new Set(files.map(file=>file.id));
    let added=0,updated=0,unchanged=0,removed=0;
    const stamp=now();
    for(const file of files){
      const old=byDrive.get(file.id);
      const thumb=`/api/image/${file.id}?size=thumb`;
      const full=`/api/image/${file.id}`;
      const driveUrl=file.webViewLink??`https://drive.google.com/file/d/${file.id}/view`;
      if(!old){
        await database.prepare("INSERT INTO images (id,album_id,drive_file_id,file_name,mime_type,thumbnail_url,drive_thumbnail_link,preview_url,drive_url,source_modified_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(uid(),path[1],file.id,file.name,file.mimeType,thumb,file.thumbnailLink??null,full,driveUrl,file.modifiedTime??null,"ACTIVE",stamp,stamp).run();added++;
      }else if(old.sourceModifiedAt!==file.modifiedTime || old.status!=="ACTIVE"){
        await database.prepare("UPDATE images SET file_name=?,mime_type=?,thumbnail_url=?,drive_thumbnail_link=?,preview_url=?,drive_url=?,source_modified_at=?,status='ACTIVE',updated_at=? WHERE id=?")
          .bind(file.name,file.mimeType,thumb,file.thumbnailLink??null,full,driveUrl,file.modifiedTime??null,stamp,old.id).run();updated++;
      }else unchanged++;
    }
    for(const old of previous.results){if(!seen.has(old.driveFileId)&&old.status!=="MISSING"){
      await database.prepare("UPDATE images SET status='MISSING',updated_at=? WHERE id=?").bind(stamp,old.id).run();removed++;
    }}
    await database.prepare("UPDATE albums SET last_sync_at=?,updated_at=? WHERE id=?").bind(stamp,stamp,path[1]).run();
    await audit(user.id,path[1],"DRIVE_SYNC",{added,updated,unchanged,removed});
    return json({added,updated,unchanged,removed,lastSyncAt:stamp});
  }
  if(request.method==="POST" && section==="selection") {
    const input=z.object({albumId:z.string(),imageId:z.string(),selected:z.boolean().optional(),note:z.string().max(2000).optional()}).parse(await request.json());
    if(input.selected===undefined && input.note===undefined) throw new ApiError(400,"Không có thay đổi để lưu.");
    const album=await getAlbum(input.albumId);
    const session=await getOrCreateSession(input.albumId,user.id);
    canEdit(album,session);
    const image=await database.prepare("SELECT id FROM images WHERE id=? AND album_id=? AND status='ACTIVE'").bind(input.imageId,input.albumId).first();
    if(!image) throw new ApiError(404,"Không tìm thấy ảnh trong album.");
    if(input.note!==undefined && !album.allowNote) throw new ApiError(409,"Album này không cho phép ghi chú.");
    const existing=await database.prepare("SELECT selected,note,selected_at AS selectedAt FROM image_selections WHERE session_id=? AND image_id=?").bind(session.id,input.imageId).first<{selected:number;note:string;selectedAt:string|null}>();
    if(input.selected===true && !existing?.selected && album.maxSelection!==null){
      const count=await database.prepare("SELECT COUNT(*) AS count FROM image_selections WHERE session_id=? AND selected=1").bind(session.id).first<{count:number}>();
      if((count?.count??0)>=Number(album.maxSelection)) throw new ApiError(409,`Bạn chỉ được chọn tối đa ${album.maxSelection} ảnh.`);
    }
    const selected=input.selected===undefined?Boolean(existing?.selected):input.selected;
    const note=input.note===undefined?existing?.note??"":input.note.trim();
    const selectedAt=selected?(existing?.selectedAt??now()):null;
    await database.prepare("INSERT INTO image_selections (id,session_id,image_id,selected,note,selected_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id,image_id) DO UPDATE SET selected=excluded.selected,note=excluded.note,selected_at=excluded.selected_at,updated_at=excluded.updated_at")
      .bind(uid(),session.id,input.imageId,Number(selected),note,selectedAt,now()).run();
    await database.prepare("UPDATE selection_sessions SET status='DRAFT',submitted_at=NULL,updated_at=? WHERE id=?").bind(now(),session.id).run();
    await audit(user.id,input.albumId,input.note!==undefined?"NOTE_SAVED":"SELECTION_CHANGED",{imageId:input.imageId,selected});
    const count=await database.prepare("SELECT COUNT(*) AS count FROM image_selections WHERE session_id=? AND selected=1").bind(session.id).first<{count:number}>();
    return json({selected,note,selectedAt,selectedCount:count?.count??0,sessionStatus:"DRAFT"});
  }
  if(request.method==="POST" && section==="submit") {
    const {albumId}=z.object({albumId:z.string()}).parse(await request.json());
    const album=await getAlbum(albumId);
    const session=await getOrCreateSession(albumId,user.id);
    canEdit(album,session);
    const count=await database.prepare("SELECT COUNT(*) AS count FROM image_selections WHERE session_id=? AND selected=1").bind(session.id).first<{count:number}>();
    const selectedCount=count?.count??0;
    if(selectedCount<Number(album.minSelection)) throw new ApiError(409,`Bạn cần chọn ít nhất ${album.minSelection} ảnh.`);
    if(album.maxSelection!==null && selectedCount>Number(album.maxSelection)) throw new ApiError(409,`Bạn chỉ được chọn tối đa ${album.maxSelection} ảnh.`);
    const stamp=now();
    await database.prepare("UPDATE selection_sessions SET status='SUBMITTED',submitted_at=?,updated_at=? WHERE id=?").bind(stamp,stamp,session.id).run();
    await audit(user.id,albumId,"SELECTION_SUBMITTED",{selectedCount});
    return json({submittedAt:stamp,selectedCount});
  }
  if(request.method==="GET" && section==="results" && !path[1]) {
    requireAdmin(user);
    const albumId=url.searchParams.get("albumId");
    const result=await database.prepare("SELECT s.id,s.status,s.submitted_at AS submittedAt,s.updated_at AS updatedAt,u.name AS userName,u.email,a.name AS albumName,a.id AS albumId,(SELECT COUNT(*) FROM image_selections x WHERE x.session_id=s.id AND x.selected=1) AS selectedCount,(SELECT COUNT(*) FROM images i WHERE i.album_id=s.album_id AND i.status='ACTIVE') AS totalImages FROM selection_sessions s JOIN users u ON u.id=s.user_id JOIN albums a ON a.id=s.album_id WHERE (? IS NULL OR a.id=?) ORDER BY s.updated_at DESC").bind(albumId,albumId).all();
    return json({results:result.results});
  }
  if(request.method==="GET" && section==="results" && path[1]) {
    requireAdmin(user);
    const session=await database.prepare("SELECT s.id,s.status,s.submitted_at AS submittedAt,u.name AS userName,u.email,a.name AS albumName,a.id AS albumId FROM selection_sessions s JOIN users u ON u.id=s.user_id JOIN albums a ON a.id=s.album_id WHERE s.id=?").bind(path[1]).first();
    if(!session) throw new ApiError(404,"Không tìm thấy kết quả.");
    const images=await database.prepare("SELECT i.id,i.file_name AS fileName,i.thumbnail_url AS thumbnailUrl,i.preview_url AS previewUrl,i.drive_url AS driveUrl,x.note,x.selected_at AS selectedAt FROM image_selections x JOIN images i ON i.id=x.image_id WHERE x.session_id=? AND x.selected=1 ORDER BY x.selected_at").bind(path[1]).all();
    return json({session,images:images.results});
  }
  if(request.method==="GET" && section==="users") {
    requireAdmin(user);
    const users=await database.prepare("SELECT u.id,u.name,u.email,u.role,(SELECT COUNT(*) FROM selection_sessions s WHERE s.user_id=u.id AND s.status='SUBMITTED') AS completedCount FROM users u ORDER BY u.created_at DESC").all();
    return json({users:users.results});
  }
  if(request.method==="GET" && section==="settings") {
    requireAdmin(user);
    const {env}=await import("cloudflare:workers");
    const method=env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_PRIVATE_KEY?"Tài khoản dịch vụ":env.DRIVE_API_KEY?"API key":"Chưa có";
    return json({driveConfigured:method!=="Chưa có",method});
  }
  if(request.method==="GET" && section==="export") {
    requireAdmin(user);
    const albumId=url.searchParams.get("albumId");
    const rows=await database.prepare("SELECT a.name AS album,u.name AS user,i.drive_file_id AS fileId,i.file_name AS fileName,i.drive_url AS driveUrl,x.note,x.selected_at AS selectedAt,s.submitted_at AS submittedAt FROM image_selections x JOIN selection_sessions s ON s.id=x.session_id JOIN albums a ON a.id=s.album_id JOIN users u ON u.id=s.user_id JOIN images i ON i.id=x.image_id WHERE x.selected=1 AND (? IS NULL OR a.id=?) ORDER BY a.name,u.name,i.file_name").bind(albumId,albumId).all<Record<string,unknown>>();
    const columns=["Album","User","File ID","Tên file","Google Drive URL","Ghi chú","Thời gian chọn","Thời gian xác nhận"];
    const content=createXlsx(columns,rows.results.map(row=>[row.album,row.user,row.fileId,row.fileName,row.driveUrl,row.note,row.selectedAt,row.submittedAt]));
    return new NextResponse(new Uint8Array(content).buffer,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename=chon-anh-ket-qua.xlsx"}});
  }
  if(request.method==="GET" && section==="image" && path[1]) {
    const image=await database.prepare("SELECT i.id,i.drive_file_id AS driveFileId,i.drive_thumbnail_link AS driveThumbnailLink,i.mime_type AS mimeType,a.status AS albumStatus FROM images i JOIN albums a ON a.id=i.album_id WHERE i.drive_file_id=? AND i.status='ACTIVE'").bind(path[1]).first<{id:string;driveFileId:string;driveThumbnailLink:string|null;mimeType:string;albumStatus:string}>();
    if(!image || (image.albumStatus!=="ACTIVE" && user.role!=="ADMIN")) throw new ApiError(404,"Không tìm thấy ảnh.");
    const thumbnail=url.searchParams.get("size")==="thumb";
    const fetched=thumbnail?await fetchDriveThumbnail(path[1],image.driveThumbnailLink):{response:await fetchDriveImage(path[1]),link:image.driveThumbnailLink};
    if(thumbnail&&fetched.link!==image.driveThumbnailLink) await database.prepare("UPDATE images SET drive_thumbnail_link=? WHERE id=?").bind(fetched.link,image.id).run();
    const response=fetched.response;
    if(!response.ok || !response.body) throw new ApiError(502,"Không tải được ảnh từ Google Drive.");
    return new NextResponse(response.body,{headers:{"Content-Type":response.headers.get("content-type")??image.mimeType,"Cache-Control":"private, max-age=3600"}});
  }
  throw new ApiError(404,"Không tìm thấy chức năng.");
}

async function respond(request:NextRequest,context:Context){
  try{return await handle(request,context);}catch(error){
    if(error instanceof z.ZodError) return json({error:error.issues[0]?.message??"Dữ liệu không hợp lệ."},400);
    if(error instanceof ApiError) return json({error:error.message},error.status);
    console.error(error);
    return json({error:"Đã xảy ra lỗi. Vui lòng thử lại."},500);
  }
}
export const GET=respond;
export const POST=respond;

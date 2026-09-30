import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { cookies } from "next/headers";
import { readGoogleSession } from "@/lib/google-auth";

export type AppUser = { id: string; email: string; name: string; role: "ADMIN" | "USER" };
export const db = () => {
  if (!env.DB) throw new Error("Cơ sở dữ liệu chưa sẵn sàng.");
  return env.DB;
};
let schemaCheck:Promise<void>|null=null;
export async function ensureCurrentSchema(database=db()) {
  if(!schemaCheck) schemaCheck=(async()=>{
    const columns=await database.prepare("PRAGMA table_info(albums)").all<{name:string}>();
    if(!columns.results.some(column=>column.name==="visibility")) {
      try{await database.prepare("ALTER TABLE albums ADD COLUMN visibility TEXT NOT NULL DEFAULT 'PRIVATE'").run();}
      catch(error){const refreshed=await database.prepare("PRAGMA table_info(albums)").all<{name:string}>();if(!refreshed.results.some(column=>column.name==="visibility"))throw error;}
    }
  })().catch(error=>{schemaCheck=null;throw error;});
  await schemaCheck;
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function currentUserOptional(): Promise<AppUser | null> {
  const google = await readGoogleSession(await cookies());
  const chatgpt = google ? null : await getChatGPTUser();
  const signedIn = google ? { userId: `google:${google.sub}`, email: google.email, displayName: google.name } : chatgpt;
  if (!signedIn) return null;
  const database = db();
  let user = await database.prepare("SELECT id, email, name, role FROM users WHERE id = ? OR lower(email) = lower(?) LIMIT 1").bind(signedIn.userId,signedIn.email).first<AppUser>();
  if (!user) {
    const {env}=await import("cloudflare:workers");
    const adminEmails=(env.ADMIN_EMAILS??"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(signedIn.email.toLowerCase()) ? "ADMIN" : "USER";
    await database.prepare("INSERT OR IGNORE INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)")
      .bind(signedIn.userId,signedIn.email.toLowerCase(),signedIn.displayName,role,now()).run();
    user = await database.prepare("SELECT id, email, name, role FROM users WHERE id = ? OR lower(email) = lower(?) LIMIT 1").bind(signedIn.userId,signedIn.email).first<AppUser>();
  }
  if (!user) throw new ApiError(500, "Không thể tạo tài khoản.");
  return user;
}

export async function currentUser(): Promise<AppUser> {
  const user=await currentUserOptional();
  if(!user) throw new ApiError(401,"Đăng nhập bằng Google để tiếp tục.");
  return user;
}

export function requireAdmin(user: AppUser | null): asserts user is AppUser {
  if (user?.role !== "ADMIN") throw new ApiError(user?403:401, user?"Bạn không có quyền quản trị.":"Đăng nhập bằng Google để tiếp tục.");
}

export async function audit(actorId: string, albumId: string | null, action: string, details: object = {}) {
  await db().prepare("INSERT INTO audit_events (id,actor_id,album_id,action,details,created_at) VALUES (?,?,?,?,?,?)")
    .bind(uid(),actorId,albumId,action,JSON.stringify(details),now()).run();
}

export async function getAlbum(id: string) {
  const album = await db().prepare("SELECT a.id,a.name,a.description,a.drive_folder_id AS driveFolderId,a.drive_folder_url AS driveFolderUrl,a.min_selection AS minSelection,a.max_selection AS maxSelection,a.allow_note AS allowNote,a.allow_edit_after_submit AS allowEditAfterSubmit,a.visibility,a.start_date AS startDate,a.end_date AS endDate,a.status,a.last_sync_at AS lastSyncAt,(SELECT i.thumbnail_url FROM images i WHERE i.album_id=a.id AND i.status='ACTIVE' ORDER BY i.created_at,i.file_name LIMIT 1) AS coverUrl FROM albums a WHERE a.id = ?")
    .bind(id).first<Record<string,unknown>>();
  if (!album) throw new ApiError(404,"Không tìm thấy album.");
  const normalized: Record<string, unknown> = {
    ...album,
    allowNote: Number(album.allowNote) === 1,
    allowEditAfterSubmit: Number(album.allowEditAfterSubmit) === 1,
    isPublic: album.visibility === "PUBLIC",
  };
  return normalized;
}

export function canEdit(album: Record<string,unknown>, session: Record<string,unknown> | null) {
  if (session?.status === "SUBMITTED" && !album.allowEditAfterSubmit) throw new ApiError(409,"Album đã được xác nhận và không cho phép chỉnh sửa.");
  if (album.status !== "ACTIVE") throw new ApiError(409,"Album hiện không nhận lựa chọn.");
  const day = now().slice(0,10);
  if (album.startDate && String(album.startDate) > day) throw new ApiError(409,"Album chưa đến ngày bắt đầu.");
  if (album.endDate && String(album.endDate) < day) throw new ApiError(409,"Album đã hết hạn lựa chọn.");
}

export async function getOrCreateSession(albumId: string, userId: string) {
  const database = db();
  let session = await database.prepare("SELECT id,status,submitted_at AS submittedAt FROM selection_sessions WHERE album_id = ? AND user_id = ?").bind(albumId,userId).first<Record<string,unknown>>();
  if (!session) {
    const stamp = now();
    await database.prepare("INSERT OR IGNORE INTO selection_sessions (id,album_id,user_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(uid(),albumId,userId,"DRAFT",stamp,stamp).run();
    session = await database.prepare("SELECT id,status,submitted_at AS submittedAt FROM selection_sessions WHERE album_id = ? AND user_id = ?").bind(albumId,userId).first<Record<string,unknown>>();
  }
  if (!session) throw new ApiError(500,"Không thể tạo phiên chọn ảnh.");
  return session;
}

export function requireUser(user: AppUser | null): AppUser {
  if(!user) throw new ApiError(401,"Đăng nhập bằng Google để chọn ảnh và gửi lựa chọn.");
  return user;
}

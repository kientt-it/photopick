import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export type AppUser = { id: string; email: string; name: string; role: "ADMIN" | "USER" };
export const db = () => {
  if (!env.DB) throw new Error("Cơ sở dữ liệu chưa sẵn sàng.");
  return env.DB;
};
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function currentUser(): Promise<AppUser> {
  const signedIn = await getChatGPTUser();
  if (!signedIn) throw new ApiError(401, "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
  const database = db();
  let user = await database.prepare("SELECT id, email, name, role FROM users WHERE id = ?").bind(signedIn.userId).first<AppUser>();
  if (!user) {
    const existing = await database.prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>();
    const role = existing?.count === 0 ? "ADMIN" : "USER";
    await database.prepare("INSERT OR IGNORE INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)")
      .bind(signedIn.userId,signedIn.email,signedIn.displayName,role,now()).run();
    user = await database.prepare("SELECT id, email, name, role FROM users WHERE id = ?").bind(signedIn.userId).first<AppUser>();
  }
  if (!user) throw new ApiError(500, "Không thể tạo tài khoản.");
  return user;
}

export function requireAdmin(user: AppUser) {
  if (user.role !== "ADMIN") throw new ApiError(403, "Bạn không có quyền quản trị.");
}

export async function audit(actorId: string, albumId: string | null, action: string, details: object = {}) {
  await db().prepare("INSERT INTO audit_events (id,actor_id,album_id,action,details,created_at) VALUES (?,?,?,?,?,?)")
    .bind(uid(),actorId,albumId,action,JSON.stringify(details),now()).run();
}

export async function getAlbum(id: string) {
  const album = await db().prepare("SELECT id,name,description,drive_folder_id AS driveFolderId,drive_folder_url AS driveFolderUrl,min_selection AS minSelection,max_selection AS maxSelection,allow_note AS allowNote,allow_edit_after_submit AS allowEditAfterSubmit,start_date AS startDate,end_date AS endDate,status,last_sync_at AS lastSyncAt FROM albums WHERE id = ?")
    .bind(id).first<Record<string,unknown>>();
  if (!album) throw new ApiError(404,"Không tìm thấy album.");
  const normalized: Record<string, unknown> = {
    ...album,
    allowNote: Number(album.allowNote) === 1,
    allowEditAfterSubmit: Number(album.allowEditAfterSubmit) === 1,
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

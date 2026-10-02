"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Expand, ImageOff, Maximize2, Minus, Plus, Search, Share2, StickyNote, X } from "lucide-react";
import { api } from "@/services/api";
import type {AlbumData,Photo} from "@/types";

function PhotoImage({src,alt}:{src:string;alt:string}) {
  const [broken,setBroken]=useState(false);
  return broken?<div className="image-fallback"><ImageOff size={24}/><span>Không tải được ảnh</span></div>:<img src={src} alt={alt} loading="lazy" onError={()=>setBroken(true)}/>;
}

function Preview({photo,photos,albumId,albumName,onClose,onNavigate,onToggle,onSaveNote,allowNote,locked,canSelect}:{photo:Photo;photos:Photo[];albumId:string;albumName:string;onClose:()=>void;onNavigate:(photo:Photo)=>void;onToggle:(photo:Photo)=>void;onSaveNote:(photo:Photo,note:string)=>Promise<void>;allowNote:boolean;locked:boolean;canSelect:boolean}) {
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [dragging,setDragging]=useState(false);
  const [note,setNote]=useState(photo.note??"");
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const stage=useRef<HTMLDivElement>(null);
  const image=useRef<HTMLImageElement>(null);
  const drag=useRef<{pointerId:number;startX:number;startY:number;panX:number;panY:number}|null>(null);
  const close=useRef<HTMLButtonElement>(null);
  const index=photos.findIndex(item=>item.id===photo.id);
  const prev=useCallback(()=>{if(index>0)onNavigate(photos[index-1]);},[index,onNavigate,photos]);
  const next=useCallback(()=>{if(index<photos.length-1)onNavigate(photos[index+1]);},[index,onNavigate,photos]);
  useEffect(()=>{close.current?.focus();},[]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape")onClose();
      if(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if(event.key==="ArrowLeft"){event.preventDefault();prev();}
      if(event.key==="ArrowRight"){event.preventDefault();next();}
      if(event.code==="Space"){event.preventDefault();if(!locked)onToggle(photo);}
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[onClose,prev,next,onToggle,photo,locked]);
  const clampPan=(x:number,y:number,scale=zoom)=>{
    const bounds=stage.current,photoImage=image.current;
    if(!bounds||!photoImage||scale<=1)return {x:0,y:0};
    const maxX=Math.max(0,(photoImage.clientWidth*scale-bounds.clientWidth)/2);
    const maxY=Math.max(0,(photoImage.clientHeight*scale-bounds.clientHeight)/2);
    return {x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
  };
  const changeZoom=(value:number)=>{const scale=Math.max(.5,Math.min(3,value));setZoom(scale);setPan(current=>clampPan(current.x,current.y,scale));};
  const startDrag=(event:React.PointerEvent<HTMLImageElement>)=>{if(zoom<=1)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,panX:pan.x,panY:pan.y};setDragging(true);};
  const moveDrag=(event:React.PointerEvent<HTMLImageElement>)=>{const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;setPan(clampPan(current.panX+event.clientX-current.startX,current.panY+event.clientY-current.startY));};
  const stopDrag=(event:React.PointerEvent<HTMLImageElement>)=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=null;setDragging(false);};
  const save=async()=>{setSaving(true);setMessage("");try{await onSaveNote(photo,note);setMessage("Đã lưu ghi chú.");}catch(error){setMessage(error instanceof Error?error.message:"Không lưu được ghi chú.");}finally{setSaving(false);}};
  const share=async()=>{const url=new URL(`/albums/${albumId}?photo=${encodeURIComponent(photo.id)}`,window.location.origin).toString();setMessage("");try{if(navigator.share){await navigator.share({title:albumName,text:`Xem ảnh trong bộ sưu tập ${albumName}`,url});return;}await navigator.clipboard.writeText(url);setMessage("Đã sao chép liên kết ảnh.");}catch(error){if(error instanceof Error&&error.name==="AbortError")return;try{await navigator.clipboard.writeText(url);setMessage("Đã sao chép liên kết ảnh.");}catch{setMessage("Không thể sao chép liên kết trên thiết bị này.");}}};
  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="lightbox" role="dialog" aria-modal="true" aria-label={`Xem ảnh ${photo.fileName}`}>
    <div className="lightbox-top"><div><strong>{albumName}</strong><span>{index+1} / {photos.length}</span></div><button ref={close} className="icon-btn" onClick={onClose} aria-label="Đóng ảnh"><X size={21}/></button></div>
    <div className="lightbox-body"><div className="lightbox-visual"><div className="lightbox-tools"><button onClick={()=>changeZoom(zoom-.25)} aria-label="Thu nhỏ"><Minus size={18}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>changeZoom(zoom+.25)} aria-label="Phóng to"><Plus size={18}/></button><button onClick={()=>changeZoom(1)} aria-label="Vừa màn hình"><Maximize2 size={18}/></button><button onClick={()=>stage.current?.requestFullscreen?.()} aria-label="Toàn màn hình"><Expand size={18}/></button></div><div className="lightbox-stage" ref={stage} onWheel={event=>{event.preventDefault();changeZoom(zoom+(event.deltaY<0?.15:-.15));}}><button className="stage-arrow left" onClick={prev} disabled={index===0} aria-label="Ảnh trước"><ChevronLeft/></button><img ref={image} className={`preview-image ${zoom>1?"zoomed":""}${dragging?" dragging":""}`} src={photo.previewUrl} alt={photo.fileName} draggable={false} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}} style={{transform:`translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`}}/><button className="stage-arrow right" onClick={next} disabled={index===photos.length-1} aria-label="Ảnh sau"><ChevronRight/></button></div></div>
    <aside className="lightbox-side"><p className="eyebrow">CHI TIẾT ẢNH</p><h2>Ảnh {index+1} trong bộ sưu tập</h2><p className="subtle">{albumName}</p><p className="file-name-detail"><span>Tên tệp</span><strong>{photo.fileName}</strong></p><p className="subtle">Nguồn: {photo.driveUrl?"Google Drive":"Album ảnh"}</p>{photo.driveUrl&&<a href={photo.driveUrl} target="_blank" rel="noreferrer" className="plain-link">Mở trên Google Drive ↗</a>}<button className="secondary-btn share-photo" onClick={share}><Share2 size={16}/> Chia sẻ ảnh</button>{message&&<p className="hint" role="status">{message}</p>}<button className={`wide-select ${photo.selected?"chosen":""}`} onClick={()=>onToggle(photo)} disabled={locked}>{!canSelect?"Đăng nhập để chọn ảnh":photo.selected?<><Check size={19}/> Đã chọn · Bỏ chọn</>:<><Check size={19}/> Chọn ảnh này</>}</button>{locked&&<p className="hint">Lựa chọn đã gửi. Hãy chọn lại để chỉnh sửa.</p>}
      {allowNote&&<div className="note-field"><label htmlFor="photo-note">Ghi chú cho ảnh</label><textarea id="photo-note" value={note} onChange={event=>setNote(event.target.value)} maxLength={2000} placeholder="Ví dụ: Cần crop phần bên trái..." disabled={locked}/><button className="secondary-btn" onClick={save} disabled={saving||locked||(canSelect&&note===(photo.note??""))}>{saving?"Đang lưu...":canSelect?"Lưu ghi chú":"Đăng nhập để ghi chú"}</button>{message&&<p role="status" className="hint">{message}</p>}</div>}
      <p className="keyboard-tip">← → chuyển ảnh · Space chọn ảnh · Kéo ảnh khi zoom · Esc đóng</p></aside></div>
  </section></div>;
}

export function PhotoWorkspace({albumId,selectedView=false}:{albumId:string;selectedView?:boolean}) {
  const searchParams=useSearchParams();
  const requestedPhotoId=searchParams.get("photo");
  const [data,setData]=useState<AlbumData|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState("");
  const [flash,setFlash]=useState("");
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState(selectedView?"selected":"all");
  const [previewId,setPreviewId]=useState<string|null>(null);
  const resolvedSharedPhoto=useRef<string|null>(null);
  const [confirm,setConfirm]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [reselecting,setReselecting]=useState(false);
  const locked=Boolean(data?.session.status==="SUBMITTED"&&!data.album.allowEditAfterSubmit);
  const submittedToastShown=useRef(false);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{if(!flash)return;const timer=setTimeout(()=>setFlash(""),4500);return()=>clearTimeout(timer);},[flash]);
  useEffect(()=>{if(data?.session.status==="SUBMITTED"&&data.session.submittedAt&&!submittedToastShown.current){submittedToastShown.current=true;setFlash(`Đã xác nhận lựa chọn vào ${new Date(data.session.submittedAt).toLocaleString("vi-VN")}.`);}},[data?.session.status,data?.session.submittedAt]);
  const refresh=useCallback(async()=>{setLoading(true);setError("");try{setData(await api.album(albumId,filter,query,0));}catch(error){setError(error instanceof Error?error.message:"Không tải được album.");}finally{setLoading(false);}},[albumId,filter,query]);
  useEffect(()=>{void refresh();},[refresh]);
  // This effect resolves a photo permalink only after both the URL and album data are available.
  useEffect(()=>{if(!requestedPhotoId||!data||loading||resolvedSharedPhoto.current===requestedPhotoId)return;resolvedSharedPhoto.current=requestedPhotoId;let active=true;const timer=window.setTimeout(()=>{const existing=data.images.find(item=>item.id===requestedPhotoId);const load=existing?Promise.resolve({photo:existing,albumId,albumName:data.album.name}):api.photo(requestedPhotoId);load.then(result=>{if(!active||result.albumId!==albumId)return;if(!existing)setData(current=>current?{...current,images:[result.photo,...current.images]}:current);setPreviewId(result.photo.id);}).catch(()=>{});},0);return()=>{active=false;window.clearTimeout(timer);};},[requestedPhotoId,data,loading,albumId]);
  const syncPhotoUrl=(id:string|null)=>{const url=new URL(window.location.href);if(id)url.searchParams.set("photo",id);else url.searchParams.delete("photo");window.history.replaceState(window.history.state,"",url);};
  const openPhoto=(id:string)=>{setPreviewId(id);syncPhotoUrl(id);};
  const loadMore=async()=>{if(!data||loadingMore)return;setLoadingMore(true);try{const next=await api.album(albumId,filter,query,data.images.length);setData({...next,images:[...data.images,...next.images]});}catch(error){setFlash(error instanceof Error?error.message:"Không tải thêm được ảnh.");}finally{setLoadingMore(false);}};
  const updatePhoto=(id:string,patch:Partial<Photo>,count?:number)=>setData(current=>current?{...current,selectedCount:count??current.selectedCount,images:current.images.map(item=>item.id===id?{...item,...patch}:item)}:current);
  const toggle=useCallback(async(photo:Photo)=>{if(!data)return;if(!data.canSelect){window.location.assign(`/api/auth/google?return_to=${encodeURIComponent(window.location.pathname)}`);return;}if(locked)return;setFlash("");const target=!Boolean(photo.selected);updatePhoto(photo.id,{selected:target},data.selectedCount+(target?1:-1));try{const result=await api.selection({albumId,imageId:photo.id,selected:target});updatePhoto(photo.id,{selected:result.selected,selectedAt:result.selectedAt},result.selectedCount);setData(current=>current?{...current,session:{...current.session,status:"DRAFT"},...(filter==="selected"&&!result.selected?{images:current.images.filter(item=>item.id!==photo.id),total:Math.max(0,current.total-1)}:{}),...(filter==="unselected"&&result.selected?{images:current.images.filter(item=>item.id!==photo.id),total:Math.max(0,current.total-1)}:{})}:current);if(filter==="selected"&&!result.selected)setPreviewId(null);}catch(error){updatePhoto(photo.id,{selected:photo.selected},data.selectedCount);setFlash(error instanceof Error?error.message:"Không lưu được lựa chọn.");}},[albumId,data,filter,locked]);
  const saveNote=async(photo:Photo,note:string)=>{if(!data?.canSelect){window.location.assign(`/api/auth/google?return_to=${encodeURIComponent(window.location.pathname)}`);throw new Error("Đang chuyển đến đăng nhập Google.");}const result=await api.selection({albumId,imageId:photo.id,note});updatePhoto(photo.id,{note:result.note});};
  const submit=async()=>{if(!data)return;setSubmitting(true);setFlash("");try{const result=await api.submit(albumId);setData({...data,session:{...data.session,status:"SUBMITTED",submittedAt:result.submittedAt}});setConfirm(false);setFlash(`Đã xác nhận lựa chọn vào ${new Date(result.submittedAt).toLocaleString("vi-VN")}.`);}catch(error){setFlash(error instanceof Error?error.message:"Không xác nhận được lựa chọn.");setConfirm(false);}finally{setSubmitting(false);}};
  const reselect=async()=>{setReselecting(true);setFlash("");try{await api.reselect(albumId);setData(current=>current?{...current,session:{...current.session,status:"DRAFT",submittedAt:null}}:current);setFlash("Bạn có thể chọn lại ảnh rồi gửi lại danh sách.");}catch(error){setFlash(error instanceof Error?error.message:"Không mở lại được lựa chọn.");}finally{setReselecting(false);}};
  const photo=data?.images.find(item=>item.id===previewId)??null;
  return <div className="content-page"><div className="breadcrumb"><Link href="/albums">Album ảnh</Link><ChevronRight size={14}/><span>{data?.album.name??"Đang tải"}</span></div>
    {loading?<div className="loading-panel"><div className="skeleton title"/><div className="skeleton bar"/><div className="skeleton-grid">{Array.from({length:8},(_,i)=><div className="skeleton card" key={i}/>)}</div></div>:error?<div className="state-panel"><ImageOff size={30}/><h2>Không thể tải danh sách ảnh</h2><p>{error}</p>{error.includes("Đăng nhập")?<a className="primary-btn" href={`/api/auth/google?return_to=${encodeURIComponent(`/albums/${albumId}`)}`}>Đăng nhập Google</a>:<button className="primary-btn" onClick={refresh}>Vui lòng thử lại</button>}</div>:data&&<>
      <div className="page-heading"><div>{selectedView&&<a className="back-link" href={`/albums/${albumId}`}><ArrowLeft size={16}/> Quay lại chỉnh sửa</a>}<p className="eyebrow">{selectedView?"ẢNH ĐÃ CHỌN":"ALBUM ĐANG DUYỆT"}</p><h1>{selectedView?"Ảnh đã chọn":data.album.name}</h1><p className="lead">{selectedView?`Bạn đã chọn ${data.selectedCount} ảnh trong ${data.album.name}.`:data.album.description}</p></div><div className="album-stat"><strong>{String(data.selectedCount).padStart(2,"0")} <span>/ {data.allCount}</span></strong><small>ảnh đã chọn</small></div></div>
      {flash&&<div className="toast-message" role="status">{flash}<button onClick={()=>setFlash("")} aria-label="Đóng thông báo"><X size={15}/></button></div>}
      <div className="toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm theo tên ảnh..." aria-label="Tìm ảnh"/></label>{selectedView?<a className="secondary-btn" href={`/albums/${albumId}`}>Quay lại album</a>:<a className="secondary-btn" href={`/albums/${albumId}/selected`}>Xem ảnh đã chọn <span className="count-pill">{data.selectedCount}</span></a>}{!data.canSelect?<a className="primary-btn" href={`/api/auth/google?return_to=${encodeURIComponent(typeof window!=="undefined"?window.location.pathname:`/albums/${albumId}`)}`}>Đăng nhập để chọn</a>:locked?<button className="primary-btn" onClick={reselect} disabled={reselecting}>{reselecting?"Đang mở lại...":"Chọn lại ảnh"}</button>:<button className="primary-btn" onClick={()=>setConfirm(true)} disabled={data.selectedCount===0}>Gửi lựa chọn</button>}</div>
      {!selectedView&&<div className="filter-tabs" role="tablist" aria-label="Lọc ảnh">{[["all","Tất cả"],["unselected","Chưa chọn"],["selected","Đã chọn"],["noted","Có ghi chú"]].map(([value,label])=><button key={value} role="tab" aria-selected={filter===value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}{value==="all"&&<span>{data.allCount}</span>}</button>)}</div>}
      <div className="gallery-heading"><h2>Danh sách ảnh <span>{data.total} ảnh</span></h2><span>Hiển thị {data.images.length} trên {data.total} ảnh</span></div>
      {data.images.length===0?<div className="state-panel compact"><ImageOff size={28}/><h2>{selectedView?"Bạn chưa chọn ảnh nào":"Không có ảnh phù hợp"}</h2><p>{selectedView?"Quay lại album để chọn ảnh yêu thích.":"Thử từ khóa hoặc bộ lọc khác."}</p></div>:<><div className="gallery-grid">{data.images.map(item=><article className={`photo-card ${item.selected?"is-selected":""}`} key={item.id}><div className="photo-frame"><button className="photo-open" onClick={()=>openPhoto(item.id)} aria-label={`Xem lớn ${item.fileName}`}><PhotoImage src={item.thumbnailUrl} alt={item.fileName}/></button><label className="photo-check"><input type="checkbox" checked={Boolean(item.selected)} onChange={()=>toggle(item)} disabled={locked} aria-label={`Chọn ${item.fileName}`}/><span><Check size={14}/></span></label></div><div className="photo-details"><div><strong title={item.fileName}>{item.fileName}</strong><span className={item.selected?"selected-label":"unselected-label"}>{item.selected?"✓ Đã chọn":"Chưa chọn"}</span></div>{item.note&&<span className="note-badge" title="Có ghi chú"><StickyNote size={16}/></span>}</div><div className="card-actions"><button onClick={()=>openPhoto(item.id)}>Xem ảnh</button><button onClick={()=>toggle(item)} disabled={locked}>{item.selected?"Bỏ chọn":"Chọn ảnh"}</button></div></article>)}</div>{data.hasMore&&<div className="load-more"><button className="secondary-btn" onClick={loadMore} disabled={loadingMore}>{loadingMore?"Đang tải...":"Tải thêm ảnh"}</button></div>}</>}
    </>}
    {photo&&data&&<Preview key={photo.id} photo={photo} photos={data.images} albumId={albumId} albumName={data.album.name} onClose={()=>{setPreviewId(null);syncPhotoUrl(null);}} onNavigate={item=>openPhoto(item.id)} onToggle={toggle} onSaveNote={saveNote} allowNote={Boolean(data.album.allowNote)} locked={locked} canSelect={data.canSelect}/>}
    {confirm&&data&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setConfirm(false);}}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Xác nhận lựa chọn"><button className="dialog-close" onClick={()=>setConfirm(false)} aria-label="Đóng"><X size={19}/></button><span className="dialog-icon"><Check size={24}/></span><h2>Gửi lựa chọn?</h2><p>Bạn đang chọn <strong>{data.selectedCount} ảnh</strong>. Danh sách sẽ được ghi nhận để quản trị viên xử lý.</p>{data.selectedCount<data.album.minSelection&&<p className="validation">Bạn cần chọn ít nhất {data.album.minSelection} ảnh.</p>}<div className="dialog-actions"><button className="secondary-btn" onClick={()=>setConfirm(false)}>Quay lại</button><button className="primary-btn" onClick={submit} disabled={submitting||data.selectedCount<data.album.minSelection}>{submitting?"Đang gửi...":"Gửi lựa chọn"}</button></div></section></div>}
  </div>;
}

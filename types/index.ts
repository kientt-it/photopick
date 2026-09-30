export type User = {id:string;name:string;email:string;role:"ADMIN"|"USER"};
export type Album = {id:string;name:string;description:string;driveFolderId:string|null;driveFolderUrl:string|null;minSelection:number;maxSelection:number|null;allowNote:boolean;allowEditAfterSubmit:boolean;visibility:"PUBLIC"|"PRIVATE";isPublic:boolean;coverUrl:string|null;startDate:string|null;endDate:string|null;status:"DRAFT"|"ACTIVE"|"INACTIVE"|"ARCHIVED";lastSyncAt:string|null;imageCount?:number};
export type Photo = {id:string;fileName:string;mimeType:string;thumbnailUrl:string;previewUrl:string;driveUrl:string|null;selected:number|boolean|null;note:string|null;selectedAt:string|null};
export type Session = {id:string;status:"DRAFT"|"SUBMITTED";submittedAt:string|null};
export type AlbumData = {album:Album;session:Session;images:Photo[];total:number;allCount:number;selectedCount:number;hasMore:boolean;canSelect:boolean};
export type Result = {id:string;status:string;submittedAt:string|null;updatedAt:string;userName:string;email:string;albumName:string;albumId:string;selectedCount:number;totalImages:number};

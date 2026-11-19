import {z} from 'zod';
export const VIEWER_UPLOAD_TYPES=['image/png','image/jpeg','image/webp','image/gif','image/avif','application/pdf','video/mp4','video/webm'] as const;
export const VIEWER_UPLOAD_MAX_BYTES=10*1024*1024,VIEWER_UPLOAD_MAX_COUNT=5;
export const fileConstraints={
 accept:z.array(z.enum(VIEWER_UPLOAD_TYPES)).min(1).max(VIEWER_UPLOAD_TYPES.length).default(['image/png','image/jpeg','image/webp','image/gif','image/avif','application/pdf','video/mp4','video/webm']),
 maxSize:z.number().int().min(1).max(VIEWER_UPLOAD_MAX_BYTES).default(VIEWER_UPLOAD_MAX_BYTES),
 maxCount:z.number().int().min(1).max(VIEWER_UPLOAD_MAX_COUNT).default(1),
};
export const viewerUploadSchema=z.object({
 requestId:z.string().min(1).max(128),revision:z.number().int().nonnegative(),
 fieldId:z.string().min(1).max(128).optional(),
 name:z.string().min(1).max(200),mimeType:z.enum(VIEWER_UPLOAD_TYPES),base64:z.string().min(1).max(4*Math.ceil(VIEWER_UPLOAD_MAX_BYTES/3)),
}).strict();

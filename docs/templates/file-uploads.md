# Viewer file uploads

Authenticated session viewers can explicitly select/drop supported files. A read-only paired viewer, capture browser, public page, another session or unauthenticated request cannot upload. Existing session ACL, CSRF and asset isolation remain authoritative.

Forms support `{id,label,type:"file",required?,accept?,maxSize?,maxCount?}`. Accept is an array of allowed MIME types; maxSize is bytes up to 10 MiB; maxCount is 1–5 (default 1). Supported types are PNG/JPEG/WebP/GIF/AVIF, PDF and MP4/WebM. Unknown types, HTML, executable content and MIME/byte mismatches are rejected. Filenames cannot contain paths/control characters. PDFs remain download-only.

A file picker immediately creates a private session asset; a form response contains its asset id. The server binds each accepted response id to the actual uploader, display, revision and field. File drops anywhere on the viewer create session assets with visible progress. Both notify the session agent via `assets.upload` interactions containing ids/names/types/sizes, not filesystem paths. No automatic account media-library copy is made.

Limits: five files per user selection/drop, ten MiB each, twenty uploads per actor/session/minute, 500 stored session assets, existing 200 MiB session budget and 1000 pending-interaction budget. Uploads are idempotent by requestId. A partial failed batch retains already-uploaded assets and their notifications; remove unused session assets through existing authorized asset management. A failed/cancelled form does not erase an already-uploaded file.

No SQL migration is required: upload binding records use existing JSON storage. Rolling back keeps bytes but old binaries do not render new form file fields; retain a backup/newer binary for those saved forms.

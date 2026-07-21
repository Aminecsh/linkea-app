const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const DOCUMENT_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  ...VIDEO_TYPES,
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "text/plain": "txt",
};

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
export const FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 Mo (permet les courtes vidéos)

export type FileValidation = { ok: true; ext: string } | { ok: false; error: string };

function validate(file: File, allowed: Record<string, string>, maxBytes: number): FileValidation {
  const ext = allowed[file.type];
  if (!ext) {
    return { ok: false, error: "Type de fichier non autorisé." };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo).` };
  }
  return { ok: true, ext };
}

export function validateAvatar(file: File): FileValidation {
  return validate(file, IMAGE_TYPES, AVATAR_MAX_BYTES);
}

export function validateProjectFile(file: File): FileValidation {
  return validate(file, DOCUMENT_TYPES, FILE_MAX_BYTES);
}

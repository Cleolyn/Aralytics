/**
 * File storage limits. Every value can be overridden with an environment variable
 * (Worker vars on Cloudflare, server/.env locally). Sizes are in bytes.
 *
 * FILES_CHUNK_BYTES must not change once files exist: downloads read chunks using
 * the same size that was used to write them.
 */
const n = (key, fallback) => Number(process.env[key]) || fallback;
const MB = 1024 ** 2;

const MATERIAL = ['.pdf', '.pptx', '.ppt', '.mp4', '.docx', '.doc', '.zip'];
const SUBMISSION = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.zip', '.mp4', '.png', '.jpg', '.jpeg'];
const PERSONAL = [...new Set([...MATERIAL, ...SUBMISSION, '.gif', '.webp'])];

module.exports = {
  CHUNK_BYTES: n('FILES_CHUNK_BYTES', 1 * MB),
  READ_GROUP: n('FILES_READ_GROUP', 4),
  SHARD_CAP_BYTES: n('FILES_SHARD_CAP_BYTES', 450 * MB),
  SITE_CAP_BYTES: n('FILES_SITE_CAP_BYTES', 3.5 * 1024 * MB),
  ROLE_LIMITS: {
    TEACHER: { maxFile: n('FILES_TEACHER_MAX_FILE', 15 * MB), quota: n('FILES_TEACHER_QUOTA', 1024 * MB) },
    STUDENT: { maxFile: n('FILES_STUDENT_MAX_FILE', 10 * MB), quota: n('FILES_STUDENT_QUOTA', 50 * MB) }
  },
  // Never add .svg: it can carry script.
  EXTENSIONS: { material: MATERIAL, submission: SUBMISSION, personal: PERSONAL },
  CONTENT_TYPES: {
    '.pdf': 'application/pdf',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  },
  UPLOAD_TOKEN_TTL_S: n('FILES_UPLOAD_TOKEN_TTL_S', 7200),
  DOWNLOAD_TOKEN_TTL_S: n('FILES_DOWNLOAD_TOKEN_TTL_S', 21600),
  PENDING_MAX_AGE_MS: n('FILES_PENDING_MAX_AGE_MS', 86400000)
};

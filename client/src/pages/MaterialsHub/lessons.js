import { materialUrl } from '../../utils/learning';
import { uploadFile } from '../../utils/upload';

export const FILE_TYPES = ['PDF', 'PPTX', 'MP4', 'DOCX', 'ZIP'];
// What the server accepts for lessons (server/src/config/fileLimits.js), and the type each one is listed as.
const LESSON_EXTENSIONS = { PDF: 'PDF', PPTX: 'PPTX', PPT: 'PPTX', MP4: 'MP4', DOCX: 'DOCX', DOC: 'DOCX', ZIP: 'ZIP' };
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const EMPTY_LESSON = { competency_id: '', title: '', description: '', file_type: 'PDF', storage_url: '' };

/** Lessons matching the page filters. */
export function filterLessons(materials, { search, quarter, phase, type, savedOnly, cached, competencyById }) {
  const query = search.toLowerCase();
  return materials.filter(m =>
    (!search || `${m.title} ${m.description || ''}`.toLowerCase().includes(query)) &&
    (!quarter || competencyById.get(m.competency_id)?.quarter_code === quarter || m.melc_code?.includes(quarter)) &&
    (!phase || m.ilaw_tag === phase) &&
    (!type || m.file_type === type) &&
    (!savedOnly || cached.has(materialUrl(m.storage_url)))
  );
}

/**
 * Suggested title and type for an uploaded file ("flood_guide.pdf" -> "flood guide", PDF),
 * or `{ error }` when lessons can't use that kind of file.
 */
export function describeUpload(file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : '';
  const fileType = LESSON_EXTENSIONS[ext];
  if (!fileType) return { error: `${ext ? `.${ext.toLowerCase()} files` : 'This file'} can't be used as a lesson. Choose a PDF, PowerPoint, Word, MP4 or ZIP file.` };
  return { file_type: fileType, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() };
}

/**
 * API payload for a lesson form: either an uploaded file (sent in parts first, then referenced by
 * file_id) or a safe http(s)/same-origin link.
 */
export async function buildLessonPayload(form, file, { onProgress, signal } = {}) {
  const payload = { ...form };
  if (file) {
    const uploaded = await uploadFile(file, { purpose: 'material', onProgress, signal });
    payload.file_id = uploaded.id;
    delete payload.storage_url;
  } else if (!materialUrl(form.storage_url)) {
    throw new Error('Please enter a valid file link or upload a file.');
  }
  return payload;
}

/** Form values for editing an existing lesson. */
export const lessonFormFrom = (material, clean) => ({
  competency_id: material.competency_id || '',
  title: clean(material.title || ''),
  description: clean(material.description || ''),
  file_type: material.file_type || 'PDF',
  storage_url: material.storage_url || ''
});

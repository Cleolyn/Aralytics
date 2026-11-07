import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile, renderPage } from '../../test/render';
import MaterialsHub from '../MaterialsHub';
import { api } from '../../services/api';
import * as offline from '../../utils/offlineLearning';
import { uploadFile } from '../../utils/upload';

const auth = vi.hoisted(() => ({ isTeacher: false, user: { id: 'u1' } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/api', () => ({
  api: { getTaxonomy: vi.fn(), createMaterial: vi.fn(), updateMaterial: vi.fn(), deleteMaterial: vi.fn() }
}));
vi.mock('../../utils/upload', () => ({ uploadFile: vi.fn() }));
vi.mock('../../utils/offlineLearning', () => ({
  syncReading: vi.fn(), loadMaterials: vi.fn(), loadReadingLogs: vi.fn(), cachedMaterials: vi.fn(),
  downloadMaterial: vi.fn(), removeDownload: vi.fn()
}));

const competencies = [
  { id: 'c1', melc_code: 'AP10-1', description: 'Desc one', quarter_code: 'Q1', topic_title: 'Topic One' },
  { id: 'c2', melc_code: 'AP10-2', description: 'Desc two', quarter_code: 'Q2', topic_title: 'Topic Two' }
];
const materials = [
  { id: 'm1', title: 'Climate_Change Module', description: 'about climate', file_type: 'PDF', competency_id: 'c1', ilaw_tag: 'LEARNING_EXPERIENCES', storage_url: '/api/materials/download/a.pdf', resource_available: true },
  { id: 'm2', title: 'Disaster Slides', description: '', file_type: 'PPTX', competency_id: 'c2', ilaw_tag: 'ASSESSMENT', storage_url: 'https://example.com/b.pptx' },
  { id: 'm3', title: 'Missing Video', description: '', file_type: 'MP4', competency_id: 'c1', ilaw_tag: 'WAYS_FORWARD', storage_url: '/api/materials/download/c.mp4', resource_available: false }
];

const row = title => screen.getByText(title).closest('tr');
const titles = () => screen.queryAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].querySelector('strong').textContent);

beforeEach(() => {
  auth.isTeacher = false;
  vi.clearAllMocks();
  uploadFile.mockResolvedValue({ id: 'file-1' });
  offline.syncReading.mockResolvedValue();
  offline.loadMaterials.mockResolvedValue(materials);
  offline.loadReadingLogs.mockResolvedValue([{ material_id: 'm1' }]);
  offline.cachedMaterials.mockResolvedValue(new Set(['https://example.com/b.pptx']));
  offline.downloadMaterial.mockResolvedValue();
  offline.removeDownload.mockResolvedValue();
  api.getTaxonomy.mockResolvedValue({ flatCompetencies: competencies });
  api.createMaterial.mockResolvedValue({ success: true });
  api.updateMaterial.mockResolvedValue({ success: true });
  api.deleteMaterial.mockResolvedValue({ success: true });
});

describe('MaterialsHub (learner)', () => {
  it('lists lessons with their step, reading status, and offline state', async () => {
    renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    expect(offline.syncReading).toHaveBeenCalledWith('u1');
    expect(screen.queryByRole('button', { name: /Add lesson/ })).not.toBeInTheDocument();
    expect(titles()).toEqual(['Climate Change Module', 'Disaster Slides', 'Missing Video']);

    const first = within(row('Climate Change Module'));
    expect(first.getByText('PDF · Topic One')).toBeInTheDocument();
    expect(first.getByText('Lessons')).toBeInTheDocument();
    expect(first.getByText('Read')).toBeInTheDocument();
    expect(first.getByText('Online only')).toBeInTheDocument();
    expect(first.getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/student/materials/m1');

    expect(within(row('Disaster Slides')).getByText('Saved offline')).toBeInTheDocument();
    expect(within(row('Disaster Slides')).getByText('Not read')).toBeInTheDocument();
    const missing = within(row('Missing Video'));
    expect(missing.getAllByText('File missing')).toHaveLength(2);
    expect(missing.getByRole('button', { name: 'File missing' })).toBeDisabled();
  });

  it('filters by search, quarter, step, file type, and saved lessons', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');

    await user.type(screen.getByLabelText('Search lessons'), 'CLIMATE');
    expect(titles()).toEqual(['Climate Change Module']);
    await user.clear(screen.getByLabelText('Search lessons'));

    await user.selectOptions(screen.getByLabelText('Quarter'), 'Q2');
    expect(titles()).toEqual(['Disaster Slides']);
    await user.selectOptions(screen.getByLabelText('Quarter'), '');

    await user.selectOptions(screen.getByLabelText('Step'), 'WAYS_FORWARD');
    expect(titles()).toEqual(['Missing Video']);
    await user.selectOptions(screen.getByLabelText('Step'), '');

    await user.selectOptions(screen.getByLabelText('File type'), 'PPTX');
    expect(titles()).toEqual(['Disaster Slides']);
    await user.selectOptions(screen.getByLabelText('File type'), 'DOCX');
    expect(screen.getByRole('heading', { name: 'No lessons found' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('File type'), '');

    await user.click(screen.getByRole('button', { name: 'Saved on this device' }));
    expect(screen.getByRole('button', { name: 'Saved on this device' })).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Disaster Slides']);
  });

  it('applies the step and saved filters from the URL', async () => {
    renderPage(<MaterialsHub />, { route: '/student/materials?stage=ASSESSMENT&downloaded=true' });
    await waitFor(() => expect(titles()).toEqual(['Disaster Slides']));
    expect(screen.getByLabelText('Step')).toHaveValue('ASSESSMENT');
  });

  it('saves and removes lessons for offline reading', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');

    await user.click(within(row('Climate Change Module')).getByRole('button', { name: /Save offline/ }));
    expect(offline.downloadMaterial).toHaveBeenCalledWith(materials[0]);
    expect(await screen.findByText('Lesson saved. You can now open it without internet.')).toBeInTheDocument();
    await waitFor(() => expect(offline.loadMaterials).toHaveBeenCalledTimes(2));

    await user.click(within(row('Disaster Slides')).getByRole('button', { name: 'Remove save' }));
    expect(offline.removeDownload).toHaveBeenCalledWith(materials[1]);
    expect(await screen.findByText('Saved lesson removed from this device.')).toBeInTheDocument();
  });

  it('shows the error when saving offline fails', async () => {
    offline.downloadMaterial.mockRejectedValue(new Error('Storage is full.'));
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(within(row('Climate Change Module')).getByRole('button', { name: /Save offline/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
  });
});

describe('MaterialsHub (teacher)', () => {
  beforeEach(() => { auth.isTeacher = true; });

  it('adds a lesson from a link', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    expect(within(row('Climate Change Module')).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/teacher/materials/m1');

    await user.click(screen.getByRole('button', { name: /Add lesson/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add a lesson' });
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c2');
    await user.type(within(dialog).getByLabelText('Title'), 'New Reading');
    await user.type(within(dialog).getByLabelText('Short note'), 'Read before class');
    await user.selectOptions(within(dialog).getByLabelText('File type'), 'DOCX');
    await user.type(within(dialog).getByLabelText('Or paste a file link'), 'https://example.com/r.docx');
    await user.click(within(dialog).getByRole('button', { name: 'Add lesson' }));

    expect(api.createMaterial).toHaveBeenCalledWith({
      competency_id: 'c2', title: 'New Reading', description: 'Read before class', file_type: 'DOCX', storage_url: 'https://example.com/r.docx'
    });
    expect(await screen.findByText('Lesson added.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects an unsafe link without calling the API', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(screen.getByRole('button', { name: /Add lesson/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c1');
    await user.type(within(dialog).getByLabelText('Title'), 'Bad');
    await user.type(within(dialog).getByLabelText('Or paste a file link'), 'javascript:alert(1)');
    await user.click(within(dialog).getByRole('button', { name: 'Add lesson' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a valid file link or upload a file.');
    expect(api.createMaterial).not.toHaveBeenCalled();
  });

  it('uploads a file, deriving the title and type from its name', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(screen.getByRole('button', { name: /Add lesson/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c1');
    await user.upload(within(dialog).getByLabelText('Drag and drop a file here, or click to choose'), makeFile('flood_safety-guide.pptx', 'slides'));

    expect(within(dialog).getByLabelText('Title')).toHaveValue('flood safety guide');
    expect(within(dialog).getByLabelText('File type')).toHaveValue('PPTX');
    expect(within(dialog).getByText('flood safety-guide.pptx')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add lesson' }));

    // The file is uploaded in parts first; the lesson then refers to it by file_id (never base64).
    await waitFor(() => expect(api.createMaterial).toHaveBeenCalled());
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'flood_safety-guide.pptx' }), expect.objectContaining({ purpose: 'material' }));
    expect(api.createMaterial.mock.calls[0][0]).toEqual({
      competency_id: 'c1', title: 'flood safety guide', description: '', file_type: 'PPTX', file_id: 'file-1'
    });
  });

  it('shows the upload error and keeps the form open', async () => {
    uploadFile.mockRejectedValue(new Error('Files must be 15 MB or smaller.'));
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(screen.getByRole('button', { name: /Add lesson/ }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c1');
    await user.upload(within(dialog).getByLabelText('Drag and drop a file here, or click to choose'), makeFile('huge.pdf', 'x'));
    await user.click(within(dialog).getByRole('button', { name: 'Add lesson' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Files must be 15 MB or smaller.');
    expect(api.createMaterial).not.toHaveBeenCalled();
  });

  it('edits an existing lesson', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(within(row('Climate Change Module')).getByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit lesson' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Climate Change Module');
    expect(within(dialog).getByLabelText('Topic')).toHaveValue('c1');
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Climate 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(api.updateMaterial).toHaveBeenCalledWith('m1', {
      competency_id: 'c1', title: 'Climate 2', description: 'about climate', file_type: 'PDF', storage_url: '/api/materials/download/a.pdf'
    });
    expect(await screen.findByText('Lesson updated.')).toBeInTheDocument();
  });

  it('hides Edit and Delete on lessons created by another teacher', async () => {
    offline.loadMaterials.mockResolvedValue([
      { ...materials[0], created_by: 'u1' },
      { ...materials[1], created_by: 'other-teacher' }
    ]);
    renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    expect(within(row('Climate Change Module')).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(row('Disaster Slides')).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(within(row('Disaster Slides')).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('deletes a lesson', async () => {
    const { user } = renderPage(<MaterialsHub />);
    await screen.findByText('Climate Change Module');
    await user.click(within(row('Disaster Slides')).getByRole('button', { name: /Delete/ }));
    expect(api.deleteMaterial).toHaveBeenCalledWith('m2');
    expect(await screen.findByText('Removed "Disaster Slides".')).toBeInTheDocument();
  });
});

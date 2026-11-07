import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/render';
import TeacherSupportPage from '../TeacherSupportPage';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    getRemediationQueue: vi.fn(), getClasses: vi.fn(), getProficiencyProfiling: vi.fn(), getMaterials: vi.fn(),
    handleInterventionAction: vi.fn(), createIntervention: vi.fn(), deleteIntervention: vi.fn()
  }
}));

const remedials = [{ id: 'mat-1', title: 'Reviewer_A' }, { id: 'mat-2', title: 'Video B' }];
const queue = [
  { intervention_id: 'i1', student: { name: 'Jose Rizal', section: '10-Rizal' }, competency: { topic_title: 'CBDRRM' },
    assessment_performance: { percentage: 40, tab_switch_count: 3 }, assigned_remedial_material: { id: 'mat-1', title: 'Reviewer_A' },
    available_competency_remedials: remedials, status: 'RECOMMENDED' },
  { intervention_id: 'i2', student: { name: 'Melchora Aquino', section: '10-Luna' }, competency: { topic_title: 'Solid Waste' },
    assessment_performance: { percentage: null, tab_switch_count: 0 }, assigned_remedial_material: null,
    available_competency_remedials: [], status: 'ASSIGNED' },
  { intervention_id: 'i3', student: { name: 'Andres Bonifacio', section: '10-Luna' }, competency: { topic_title: 'Climate' },
    assessment_performance: { percentage: 60, tab_switch_count: 0 }, assigned_remedial_material: null,
    available_competency_remedials: remedials, status: 'COMPLETED' }
];

const rowOf = name => screen.getByText(name).closest('tr');
const names = () => screen.queryAllByRole('row').slice(1).map(r => r.querySelector('strong').textContent);

beforeEach(() => {
  api.getRemediationQueue.mockResolvedValue({ success: true, queue });
  api.getClasses.mockResolvedValue({ learners: [{ id: 'u1', first_name: 'Juan', last_name: 'Cruz', section: '10-Rizal' }] });
  api.getProficiencyProfiling.mockResolvedValue({ profiling: [{ competency_id: 'c1', quarter: 'Q1', topic_title: 'Topic_One' }] });
  api.getMaterials.mockResolvedValue({ materials: [] });
  api.handleInterventionAction.mockResolvedValue({ success: true });
  api.createIntervention.mockResolvedValue({ success: true });
  api.deleteIntervention.mockResolvedValue({ success: true });
});

describe('TeacherSupportPage', () => {
  it('lists support plans with performance, material, and status', async () => {
    renderPage(<TeacherSupportPage />, { route: '/teacher/support?section=10-Rizal' });
    await screen.findByText('Jose Rizal');
    expect(api.getRemediationQueue).toHaveBeenCalledWith({ section: '10-Rizal', status: '' });
    expect(names()).toEqual(['Jose Rizal', 'Melchora Aquino', 'Andres Bonifacio']);

    const jose = within(rowOf('Jose Rizal'));
    expect(jose.getByText('40% · 3 screen changes')).toBeInTheDocument();
    expect(jose.getByText('Reviewer A')).toBeInTheDocument();
    expect(jose.getByText('Suggested')).toBeInTheDocument();
    expect(jose.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(jose.getByRole('button', { name: 'Move up' })).toBeDisabled();

    const melchora = within(rowOf('Melchora Aquino'));
    expect(melchora.getByText('Added by teacher')).toBeInTheDocument();
    expect(melchora.getByText('Choose a material')).toBeInTheDocument();
    expect(melchora.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(rowOf('Andres Bonifacio')).getByRole('button', { name: 'Move down' })).toBeDisabled();
  });

  it('reorders rows locally', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(within(rowOf('Jose Rizal')).getByRole('button', { name: 'Move down' }));
    expect(names()).toEqual(['Melchora Aquino', 'Jose Rizal', 'Andres Bonifacio']);
    await user.click(within(rowOf('Andres Bonifacio')).getByRole('button', { name: 'Move up' }));
    expect(names()).toEqual(['Melchora Aquino', 'Andres Bonifacio', 'Jose Rizal']);
  });

  it('filters by status', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.selectOptions(screen.getByLabelText('Status'), 'ASSIGNED');
    await waitFor(() => expect(api.getRemediationQueue).toHaveBeenLastCalledWith({ section: '', status: 'ASSIGNED' }));
  });

  it('approves a suggested plan', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(within(rowOf('Jose Rizal')).getByRole('button', { name: 'Approve' }));
    expect(api.handleInterventionAction).toHaveBeenCalledWith('i1', { action: 'APPROVE' });
    expect(await screen.findByText('Student support updated.')).toBeInTheDocument();
    await waitFor(() => expect(api.getRemediationQueue).toHaveBeenCalledTimes(2));
  });

  it('changes the review material', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(within(rowOf('Jose Rizal')).getByRole('button', { name: 'Change material' }));
    const dialog = screen.getByRole('dialog', { name: 'Change material for Jose Rizal' });
    expect(within(dialog).getByLabelText('Review material')).toHaveValue('mat-1');
    await user.selectOptions(within(dialog).getByLabelText('Review material'), 'mat-2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(api.handleInterventionAction).toHaveBeenCalledWith('i1', { action: 'MODIFY', material_id: 'mat-2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('explains when a topic has no review material', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Melchora Aquino');
    await user.click(within(rowOf('Melchora Aquino')).getByRole('button', { name: 'Change material' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('No review material is linked to this topic yet.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('overrides a plan status and shows API errors inside the dialog', async () => {
    api.handleInterventionAction.mockResolvedValueOnce({ success: false, message: 'Plan is locked.' });
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(within(rowOf('Jose Rizal')).getByRole('button', { name: 'Mark done' }));
    const dialog = screen.getByRole('dialog', { name: 'Update status for Jose Rizal' });
    await user.selectOptions(within(dialog).getByLabelText('New status'), 'EXEMPTED');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(api.handleInterventionAction).toHaveBeenCalledWith('i1', { action: 'OVERRIDE', override_status: 'EXEMPTED' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Plan is locked.');
  });

  it('removes a plan', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Andres Bonifacio');
    await user.click(within(rowOf('Andres Bonifacio')).getByRole('button', { name: /Remove/ }));
    expect(api.deleteIntervention).toHaveBeenCalledWith('i3');
    expect(await screen.findByText('Practice plan removed.')).toBeInTheDocument();
  });

  it('assigns custom practice to a learner with an optional review material', async () => {
    api.getMaterials.mockResolvedValue({ materials: [{ id: 'm-c1', competency_id: 'c1', title: 'Topic_One_Reviewer' }] });
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(screen.getByRole('button', { name: /Assign practice/ }));
    const dialog = screen.getByRole('dialog', { name: 'Assign extra practice' });
    expect(within(dialog).getByRole('option', { name: 'Juan Cruz (10-Rizal)' })).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Student'), 'u1');
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c1');
    await user.selectOptions(within(dialog).getByLabelText('Review material (optional)'), 'm-c1');
    await user.click(within(dialog).getByRole('button', { name: 'Assign practice' }));
    expect(api.createIntervention).toHaveBeenCalledWith({ student_id: 'u1', competency_id: 'c1', material_id: 'm-c1', status: 'ASSIGNED' });
    expect(await screen.findByText('Practice plan assigned to student.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('assigns custom practice to a learner', async () => {
    const { user } = renderPage(<TeacherSupportPage />);
    await screen.findByText('Jose Rizal');
    await user.click(screen.getByRole('button', { name: /Assign practice/ }));
    const dialog = screen.getByRole('dialog', { name: 'Assign extra practice' });
    expect(within(dialog).getByRole('option', { name: 'Juan Cruz (10-Rizal)' })).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Student'), 'u1');
    await user.selectOptions(within(dialog).getByLabelText('Topic'), 'c1');
    await user.click(within(dialog).getByRole('button', { name: 'Assign practice' }));
    expect(api.createIntervention).toHaveBeenCalledWith({ student_id: 'u1', competency_id: 'c1', material_id: '', status: 'ASSIGNED' });
    expect(await screen.findByText('Practice plan assigned to student.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state with guidance', async () => {
    api.getRemediationQueue.mockResolvedValue({ success: true, queue: [] });
    renderPage(<TeacherSupportPage />);
    expect(await screen.findByRole('heading', { name: 'No support plans found' })).toBeInTheDocument();
  });
});

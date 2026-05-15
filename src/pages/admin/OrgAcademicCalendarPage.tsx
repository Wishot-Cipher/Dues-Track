import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  CalendarDays,
  Clock3,
  Plus,
  Save,
  Shield,
  Sparkles,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import GlassCard from '@/components/ui/GlassCard';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import CustomButton from '@/components/ui/CustomButton';
import Checkbox from '@/components/ui/Checkbox';
import StatusBadge from '@/components/ui/StatusBadge';
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker';
import { colors, gradients } from '@/config/colors';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useOrganization } from '@/hooks/useOrganization';
import organizationService, {
  type AcademicSessionRecord,
  type AcademicTermRecord,
} from '@/services/organizationService';

interface SessionFormData {
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_locked: boolean;
}

interface TermFormData {
  name: string;
  session_id: string;
  sequence: number;
  start_date: string;
  end_date: string;
  promotion_window_starts_at: string;
  promotion_window_ends_at: string;
  status: AcademicTermRecord['status'];
}

interface PromotionSettingsForm {
  auto_promotion_enabled: boolean;
  promotion_requires_approval: boolean;
  promotion_grace_days: number;
}

const DEFAULT_SESSION_FORM: SessionFormData = {
  label: '',
  start_date: '',
  end_date: '',
  is_active: false,
  is_locked: false,
};

const DEFAULT_TERM_FORM: TermFormData = {
  name: '',
  session_id: '',
  sequence: 1,
  start_date: '',
  end_date: '',
  promotion_window_starts_at: '',
  promotion_window_ends_at: '',
  status: 'upcoming',
};

export default function OrgAcademicCalendarPage() {
  const { organization } = useMultiTenantAuth();
  const { settings } = useOrganization();

  const [sessions, setSessions] = useState<AcademicSessionRecord[]>([]);
  const [terms, setTerms] = useState<AcademicTermRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [editingSession, setEditingSession] = useState<AcademicSessionRecord | null>(null);
  const [editingTerm, setEditingTerm] = useState<AcademicTermRecord | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionFormData>(DEFAULT_SESSION_FORM);
  const [termForm, setTermForm] = useState<TermFormData>(DEFAULT_TERM_FORM);
  const [formError, setFormError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [promotionSettings, setPromotionSettings] = useState<PromotionSettingsForm>({
    auto_promotion_enabled: false,
    promotion_requires_approval: true,
    promotion_grace_days: 14,
  });

  const isAcademicOrg = organization?.organization_type === 'university' || organization?.organization_type === 'school';
  const activeSession = useMemo(() => sessions.find(session => session.is_active) || null, [sessions]);
  const activeTerm = useMemo(() => terms.find(term => term.status === 'active') || null, [terms]);
  const currentSessionTerms = useMemo(() => {
    if (!activeSession) return [];
    return terms.filter(term => term.session_id === activeSession.id);
  }, [terms, activeSession]);

  const fetchData = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError('');
    try {
      const [sessionData, termData] = await Promise.all([
        organizationService.getAcademicSessions(organization.id),
        organizationService.getAcademicTerms(organization.id),
      ]);
      setSessions(sessionData);
      setTerms(termData);
    } catch (err) {
      console.error('Failed to load academic calendar:', err);
      setError('Unable to load the academic calendar right now.');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!settings) return;
    setPromotionSettings({
      auto_promotion_enabled: Boolean(settings.auto_promotion_enabled),
      promotion_requires_approval: settings.promotion_requires_approval ?? true,
      promotion_grace_days: settings.promotion_grace_days ?? 14,
    });
  }, [settings]);

  const openSessionModal = (session?: AcademicSessionRecord) => {
    if (session) {
      setEditingSession(session);
      setSessionForm({
        label: session.label,
        start_date: session.start_date,
        end_date: session.end_date,
        is_active: session.is_active,
        is_locked: session.is_locked,
      });
    } else {
      setEditingSession(null);
      setSessionForm(DEFAULT_SESSION_FORM);
    }
    setFormError('');
    setShowSessionModal(true);
  };

  const openTermModal = (term?: AcademicTermRecord) => {
    if (term) {
      setEditingTerm(term);
      setTermForm({
        name: term.name,
        session_id: term.session_id,
        sequence: term.sequence,
        start_date: term.start_date,
        end_date: term.end_date,
        promotion_window_starts_at: term.promotion_window_starts_at || '',
        promotion_window_ends_at: term.promotion_window_ends_at || '',
        status: term.status,
      });
    } else {
      const nextSequence = activeSession ? currentSessionTerms.length + 1 : 1;
      setEditingTerm(null);
      setTermForm({
        ...DEFAULT_TERM_FORM,
        session_id: activeSession?.id || sessions[0]?.id || '',
        sequence: nextSequence,
      });
    }
    setFormError('');
    setShowTermModal(true);
  };

  const closeModals = () => {
    setShowSessionModal(false);
    setShowTermModal(false);
    setEditingSession(null);
    setEditingTerm(null);
    setFormError('');
  };

  const validateSession = (): boolean => {
    if (!sessionForm.label.trim()) {
      setSessionError('Session label is required.');
      return false;
    }
    if (!sessionForm.start_date) {
      setSessionError('Session start date is required.');
      return false;
    }
    if (!sessionForm.end_date) {
      setSessionError('Session end date is required.');
      return false;
    }
    return true;
  };

  const setSessionError = (message: string) => {
    setFormError(message);
  };

  const validateTerm = (): boolean => {
    if (!termForm.session_id) return setSessionError('Select a session for this term.'), false;
    if (!termForm.name.trim()) return setSessionError('Term name is required.'), false;
    if (!termForm.start_date) return setSessionError('Term start date is required.'), false;
    if (!termForm.end_date) return setSessionError('Term end date is required.'), false;
    return true;
  };

  const saveSession = async () => {
    if (!organization || !validateSession()) return;

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        organization_id: organization.id,
        label: sessionForm.label.trim(),
        start_date: sessionForm.start_date,
        end_date: sessionForm.end_date,
        is_active: sessionForm.is_active,
        is_locked: sessionForm.is_locked,
      };

      if (editingSession) {
        await organizationService.updateAcademicSession(editingSession.id, payload);
      } else {
        await organizationService.createAcademicSession(payload);
      }

      await fetchData();
      closeModals();
    } catch (err) {
      console.error('Save session failed:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save session.');
    } finally {
      setSaving(false);
    }
  };

  const saveTerm = async () => {
    if (!organization || !validateTerm()) return;

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        organization_id: organization.id,
        session_id: termForm.session_id,
        name: termForm.name.trim(),
        sequence: termForm.sequence,
        start_date: termForm.start_date,
        end_date: termForm.end_date,
        promotion_window_starts_at: termForm.promotion_window_starts_at || null,
        promotion_window_ends_at: termForm.promotion_window_ends_at || null,
        status: termForm.status,
      };

      if (editingTerm) {
        await organizationService.updateAcademicTerm(editingTerm.id, payload);
      } else {
        await organizationService.createAcademicTerm(payload);
      }

      await fetchData();
      closeModals();
    } catch (err) {
      console.error('Save term failed:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save term.');
    } finally {
      setSaving(false);
    }
  };

  const activateSession = async (sessionId: string) => {
    if (!organization) return;
    setSaving(true);
    try {
      await organizationService.setActiveAcademicSession(organization.id, sessionId);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const activateTerm = async (termId: string) => {
    if (!organization) return;
    setSaving(true);
    try {
      await organizationService.setActiveAcademicTerm(organization.id, termId);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const savePromotionSettings = async () => {
    if (!organization) return;
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const updated = await organizationService.updateSettings(organization.id, {
        auto_promotion_enabled: promotionSettings.auto_promotion_enabled,
        promotion_requires_approval: promotionSettings.promotion_requires_approval,
        promotion_grace_days: Math.max(0, promotionSettings.promotion_grace_days || 0),
      });

      if (!updated) {
        throw new Error('Unable to save promotion settings.');
      }

      setSettingsMessage('Promotion settings saved successfully.');
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : 'Failed to save promotion settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (!organization) return null;

  return (
    <PageWrapper>
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: colors.primary }}>
                  Academic Operations
                </p>
                <h1 className="text-2xl sm:text-4xl font-bold text-white">
                  Academic Calendar
                </h1>
                <p className="mt-3 text-sm sm:text-base" style={{ color: colors.textSecondary }}>
                  Manage sessions, terms, and promotion windows in one place. The active period stays visible to administrators and members.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full sm:w-auto sm:flex sm:flex-row">
                <CustomButton icon={Plus} onClick={() => openSessionModal()}>
                  Session
                </CustomButton>
                <CustomButton variant="secondary" icon={CalendarDays} onClick={() => openTermModal()}>
                  Term
                </CustomButton>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Sessions',
              value: sessions.length,
              icon: <Calendar className="w-5 h-5" />,
            },
            {
              label: 'Terms',
              value: terms.length,
              icon: <CalendarDays className="w-5 h-5" />,
            },
            {
              label: 'Active Session',
              value: activeSession ? activeSession.label : 'None',
              icon: <Shield className="w-5 h-5" />,
            },
            {
              label: 'Active Term',
              value: activeTerm ? activeTerm.name : 'None',
              icon: <Clock3 className="w-5 h-5" />,
            },
          ].map(card => (
            <GlassCard key={card.label} className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest" style={{ color: colors.textSecondary }}>{card.label}</p>
                  <p className="mt-2 text-xl sm:text-2xl font-bold text-white">
                    {card.value}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: gradients.glass, color: colors.primary }}>
                  {card.icon}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Sessions</h2>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {settings?.current_period_label || 'Current period from settings'}
                </p>
              </div>
              <CustomButton variant="secondary" icon={Plus} size="sm" onClick={() => openSessionModal()}>
                New Session
              </CustomButton>
            </div>

            <div className="space-y-3">
              {loading ? (
                <LoadingSpinner size="md" text="Loading sessions..." />
              ) : error ? (
                <EmptyState
                  illustration="error"
                  title="Unable to load academic data"
                  description={error}
                  action={<CustomButton variant="secondary" onClick={fetchData}>Retry</CustomButton>}
                />
              ) : sessions.length === 0 ? (
                <EmptyState
                  illustration="achievement"
                  title="No sessions yet"
                  description="Start by creating the first academic session for this organization."
                  action={<CustomButton icon={Plus} onClick={() => openSessionModal()}>Create Session</CustomButton>}
                />
              ) : (
                <AnimatePresence>
                  {sessions.map(session => (
                    <motion.div key={session.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <GlassCard className="p-4" intensity={session.is_active ? 'strong' : 'light'}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-white truncate">{session.label}</h3>
                                {session.is_active && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: `${colors.primary}20`, color: colors.primary }}>
                                    Active
                                  </span>
                                )}
                                {session.is_locked && (
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.08)', color: colors.textSecondary }}>
                                    Locked
                                  </span>
                                )}
                            </div>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                              {session.start_date} to {session.end_date}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {!session.is_active && (
                              <CustomButton size="sm" variant="secondary" onClick={() => activateSession(session.id)} disabled={saving}>
                                Activate
                              </CustomButton>
                            )}
                            <CustomButton size="sm" variant="ghost" onClick={() => openSessionModal(session)}>
                              Edit
                            </CustomButton>
                          </div>
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Terms</h2>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {activeSession ? `Inside ${activeSession.label}` : 'Select a session to manage its terms'}
                </p>
              </div>
              <CustomButton variant="secondary" icon={Plus} size="sm" onClick={() => openTermModal()}>
                New Term
              </CustomButton>
            </div>

            <div className="space-y-3">
              {activeSession ? (
                currentSessionTerms.length === 0 ? (
                  <EmptyState
                    illustration="inbox"
                    title="No terms yet"
                    description="Add the first term for the current session to begin tracking the calendar."
                    action={<CustomButton icon={Plus} onClick={() => openTermModal()}>Create Term</CustomButton>}
                    size="sm"
                  />
                ) : (
                  currentSessionTerms.map(term => (
                    <GlassCard key={term.id} className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white truncate">{term.name}</h3>
                            <StatusBadge status={term.status} size="sm" />
                          </div>
                          <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Sequence {term.sequence} · {term.start_date} to {term.end_date}
                          </p>
                          {(term.promotion_window_starts_at || term.promotion_window_ends_at) && (
                            <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                              Promotion window: {term.promotion_window_starts_at || 'TBD'} to {term.promotion_window_ends_at || 'TBD'}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {term.status !== 'active' && (
                            <CustomButton size="sm" variant="secondary" onClick={() => activateTerm(term.id)} disabled={saving}>
                              Make Active
                            </CustomButton>
                          )}
                          <CustomButton size="sm" variant="ghost" onClick={() => openTermModal(term)}>
                            Edit
                          </CustomButton>
                        </div>
                      </div>
                    </GlassCard>
                  ))
                )
              ) : (
                <EmptyState
                  illustration="search"
                  title="No active session selected"
                  description="Set a session active before adding terms."
                  size="sm"
                />
              )}
            </div>
          </GlassCard>
        </div>

        {isAcademicOrg && (
          <GlassCard className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Promotion Controls</h2>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Configure how level-up runs are approved and when they are allowed after term close.
                </p>
              </div>
              <CustomButton icon={Save} onClick={savePromotionSettings} loading={settingsSaving}>
                Save Controls
              </CustomButton>
            </div>

            {settingsMessage && (
              <div
                className="mb-4 p-3 rounded-xl text-sm"
                style={{
                  background: settingsMessage.toLowerCase().includes('failed') || settingsMessage.toLowerCase().includes('unable')
                    ? 'rgba(255, 77, 77, 0.12)'
                    : 'rgba(48, 255, 172, 0.12)',
                  border: settingsMessage.toLowerCase().includes('failed') || settingsMessage.toLowerCase().includes('unable')
                    ? '1px solid rgba(255, 77, 77, 0.25)'
                    : '1px solid rgba(48, 255, 172, 0.25)',
                  color: settingsMessage.toLowerCase().includes('failed') || settingsMessage.toLowerCase().includes('unable')
                    ? colors.statusUnpaid
                    : '#6af5c0',
                }}
              >
                {settingsMessage}
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Checkbox
                checked={promotionSettings.auto_promotion_enabled}
                onChange={(e) => setPromotionSettings(prev => ({ ...prev, auto_promotion_enabled: e.target.checked }))}
                label={<span className="text-white font-medium">Enable automatic promotion runs</span>}
                helperText="When enabled, eligible members can be prepared automatically at term closure."
              />

              <Checkbox
                checked={promotionSettings.promotion_requires_approval}
                onChange={(e) => setPromotionSettings(prev => ({ ...prev, promotion_requires_approval: e.target.checked }))}
                label={<span className="text-white font-medium">Require manual approval before commit</span>}
                helperText="Recommended for auditability and final sign-off by institutional leadership."
              />
            </div>

            <div className="mt-4 max-w-sm">
              <Input
                type="number"
                min={0}
                label="Promotion Grace Period (days)"
                value={promotionSettings.promotion_grace_days}
                onChange={(e) => setPromotionSettings(prev => ({ ...prev, promotion_grace_days: Number(e.target.value) || 0 }))}
                helperText="Number of days after term end when promotions can still be finalized."
                fullWidth
              />
            </div>
          </GlassCard>
        )}
      </div>

      <Modal
        isOpen={showSessionModal}
        onClose={closeModals}
        title={editingSession ? 'Edit Session' : 'Create Session'}
        size="lg"
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(255, 77, 77, 0.12)', color: colors.statusUnpaid, border: '1px solid rgba(255, 77, 77, 0.25)' }}>
              {formError}
            </div>
          )}

          <Input
            label="Session Label"
            placeholder="e.g. 2025/2026 Academic Session"
            value={sessionForm.label}
            onChange={(e) => setSessionForm(prev => ({ ...prev, label: e.target.value }))}
            fullWidth
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfessionalDateTimePicker
              label="Start Date"
              value={sessionForm.start_date}
              onChange={(value) => setSessionForm(prev => ({ ...prev, start_date: value }))}
              helperText="Pick the first day of the session."
            />
            <ProfessionalDateTimePicker
              label="End Date"
              value={sessionForm.end_date}
              onChange={(value) => setSessionForm(prev => ({ ...prev, end_date: value }))}
              helperText="Pick the closing day of the session."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Checkbox
              checked={sessionForm.is_active}
              onChange={(e) => setSessionForm(prev => ({ ...prev, is_active: e.target.checked }))}
              label={<span className="text-white">Mark this as the active session</span>}
              helperText="Only one session should be active at a time."
            />
            <Checkbox
              checked={sessionForm.is_locked}
              onChange={(e) => setSessionForm(prev => ({ ...prev, is_locked: e.target.checked }))}
              label={<span className="text-white">Lock this session</span>}
              helperText="Locked sessions are treated as closed for editing."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
          <CustomButton variant="secondary" onClick={closeModals} disabled={saving}>
            Cancel
          </CustomButton>
          <CustomButton icon={Save} onClick={saveSession} loading={saving}>
            Save Session
          </CustomButton>
        </div>
      </Modal>

      <Modal
        isOpen={showTermModal}
        onClose={closeModals}
        title={editingTerm ? 'Edit Term' : 'Create Term'}
        size="lg"
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(255, 77, 77, 0.12)', color: colors.statusUnpaid, border: '1px solid rgba(255, 77, 77, 0.25)' }}>
              {formError}
            </div>
          )}

          <ProfessionalDropdown
            label="Session"
            value={termForm.session_id}
            onChange={(value) => setTermForm(prev => ({ ...prev, session_id: value as string }))}
            options={sessions.map(session => ({
              value: session.id,
              label: session.label,
              description: session.is_active ? 'Active session' : `${session.start_date} to ${session.end_date}`,
            }))}
            placeholder="Select session"
          />

          <Input
            label="Term Name"
            placeholder="e.g. First Semester"
            value={termForm.name}
            onChange={(e) => setTermForm(prev => ({ ...prev, name: e.target.value }))}
            fullWidth
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Sequence"
              type="number"
              min={1}
              value={termForm.sequence}
              onChange={(e) => setTermForm(prev => ({ ...prev, sequence: Number(e.target.value) || 1 }))}
              fullWidth
            />
            <ProfessionalDropdown
              label="Status"
              value={termForm.status}
              onChange={(value) => setTermForm(prev => ({ ...prev, status: value as AcademicTermRecord['status'] }))}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'active', label: 'Active' },
                { value: 'closing', label: 'Closing' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfessionalDateTimePicker
              label="Start Date"
              value={termForm.start_date}
              onChange={(value) => setTermForm(prev => ({ ...prev, start_date: value }))}
              helperText="Pick when the term begins."
            />
            <ProfessionalDateTimePicker
              label="End Date"
              value={termForm.end_date}
              onChange={(value) => setTermForm(prev => ({ ...prev, end_date: value }))}
              helperText="Pick when the term ends."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfessionalDateTimePicker
              label="Promotion Window Starts"
              value={termForm.promotion_window_starts_at}
              onChange={(value) => setTermForm(prev => ({ ...prev, promotion_window_starts_at: value }))}
              includeTime
              helperText="When promotion review starts."
            />
            <ProfessionalDateTimePicker
              label="Promotion Window Ends"
              value={termForm.promotion_window_ends_at}
              onChange={(value) => setTermForm(prev => ({ ...prev, promotion_window_ends_at: value }))}
              includeTime
              helperText="When promotion review ends."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
          <CustomButton variant="secondary" onClick={closeModals} disabled={saving}>
            Cancel
          </CustomButton>
          <CustomButton icon={Sparkles} onClick={saveTerm} loading={saving}>
            Save Term
          </CustomButton>
        </div>
      </Modal>
    </PageWrapper>
  );
}

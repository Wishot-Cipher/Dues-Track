import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Trash2,
  Loader2,
  ClipboardPaste,
  Users,
  X,
  Eye,
  Sparkles,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/hooks/useAppAuth';
import organizationService from '@/services/organizationService';
import { getOrgScope } from '@/utils/orgScope';
import { parseFile, parseText, getFileAcceptAttribute, getAcceptedFormats } from '@/utils/memberFileParser';

interface ParsedStudent {
  full_name: string;
  reg_number: string;
  email: string;
  phone: string;
  level: string;
  department: string;
  section: string;
}

interface ImportResult {
  row_index: number;
  success: boolean;
  message: string;
  member_id: string | null;
  full_name: string;
  reg_number: string;
  temp_password: string | null;
}

type ImportStage = 'upload' | 'preview' | 'importing' | 'results';

interface BulkStudentImportProps {
  onComplete: () => void;
  onClose: () => void;
}

export default function BulkStudentImport({ onComplete, onClose }: BulkStudentImportProps) {
  const [stage, setStage] = useState<ImportStage>('upload');
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const { user } = useAuth();
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // CSV Template
  const CSV_TEMPLATE = 'full_name,reg_number,email,phone,level,department,section\nJohn Doe,FE/20/12345678,john@example.com,+2348012345678,200L,ECE,A\nJane Smith,FE/21/87654321,,,200L,ECE,B';

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };



  // Handle file drop/select - supports CSV, Excel, Word
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setErrors([]);

    try {
      const result = await parseFile(file);
      
      // Convert ParsedMember[] to ParsedStudent[]
      const parsed: ParsedStudent[] = result.members.map(m => ({
        full_name: m.full_name,
        reg_number: m.member_id,
        email: m.email || '',
        phone: m.phone || '',
        level: '',
        department: '',
        section: '',
      }));

      if (result.warnings.length > 0) {
        setErrors(result.warnings);
      }
      
      setStudents(parsed);
      if (parsed.length > 0) setStage('preview');
      else if (result.warnings.length === 0) {
        setErrors(['No valid members found in the file. Make sure it has name and ID columns.']);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to parse file.']);
    }
  }, []);

  // Handle paste
  const handlePaste = useCallback(() => {
    const text = pasteRef.current?.value || '';
    if (!text.trim()) {
      setErrors(['Please paste data first.']);
      return;
    }
    setFileName('Pasted data');
    
    const result = parseText(text);
    const parsed: ParsedStudent[] = result.members.map(m => ({
      full_name: m.full_name,
      reg_number: m.member_id,
      email: m.email || '',
      phone: m.phone || '',
      level: '',
      department: '',
      section: '',
    }));
    
    setStudents(parsed);
    setErrors(result.warnings);
    if (parsed.length > 0) setStage('preview');
    else setErrors(['No valid members found. Make sure data has name and ID columns.']);
  }, []);

  // Drag handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  // Remove student from preview
  const removeStudent = (index: number) => {
    setStudents(prev => prev.filter((_, i) => i !== index));
    if (students.length <= 1) setStage('upload');
  };

  // Import students
  const handleImport = async () => {
    if (students.length === 0) return;

    setStage('importing');
    setProgress(0);

    try {
      const scope = getOrgScope();
      if (!scope) {
        setErrors(['No organization context found. Please log in again.']);
        setStage('preview');
        return;
      }

      // Import one-by-one with hash_password
      const allResults: ImportResult[] = [];

      // Try to determine the current user's group to enforce single-level per department
      let currentGroupPrimary: string | null = null;
      try {
        if (user?.id) {
          const { data: memberRec } = await supabase.from('organization_members').select('group_id').eq('id', user.id).single();
          const groupId = memberRec?.group_id;
          if (groupId) {
            const { data: grp } = await supabase.from('organization_groups').select('levels').eq('id', groupId).single();
            if (grp?.levels && Array.isArray(grp.levels) && grp.levels.length > 0) {
              currentGroupPrimary = organizationService.canonicalizeLevel(grp.levels[0]);
            }
          }
        }
      } catch {
        // ignore
      }

      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        try {
          // Use registration number as initial password
          const tempPassword = s.reg_number;

          // Hash the password
          const { data: hashData, error: hashError } = await supabase.rpc('hash_password', {
            password: tempPassword,
          });

          if (hashError || !hashData) {
            allResults.push({
              row_index: i + 1,
              success: false,
              message: hashError?.message || 'Failed to hash password',
              member_id: null,
              full_name: s.full_name,
              reg_number: s.reg_number,
              temp_password: null,
            });
            setProgress(Math.round(((i + 1) / students.length) * 100));
            continue;
          }

          // Enforce department single-level rule when possible
          if (s.level && currentGroupPrimary) {
            const provided = organizationService.canonicalizeLevel(s.level);
            if (provided && provided !== currentGroupPrimary) {
              allResults.push({
                row_index: i + 1,
                success: false,
                message: `Level "${s.level}" does not match department level ${currentGroupPrimary}`,
                member_id: null,
                full_name: s.full_name,
                reg_number: s.reg_number,
                temp_password: null,
              });
              setProgress(Math.round(((i + 1) / students.length) * 100));
              continue;
            }
          }

          // Insert into organization_members
          const { data: insertData, error: insertError } = await supabase
            .from('organization_members')
            .insert({
              organization_id: scope.orgId,
              member_id: s.reg_number,
              full_name: s.full_name,
              email: s.email || null,
              phone: s.phone || null,
              level: currentGroupPrimary || s.level || null,
              section: s.section || s.department || null,
              password_hash: hashData,
              force_password_change: true,
              is_active: true,
            })
            .select('id')
            .single();

          if (insertError) {
            allResults.push({
              row_index: i + 1,
              success: false,
              message: insertError.message.includes('duplicate') 
                ? `Member with ID ${s.reg_number} already exists`
                : insertError.message,
              member_id: null,
              full_name: s.full_name,
              reg_number: s.reg_number,
              temp_password: null,
            });
          } else {
            allResults.push({
              row_index: i + 1,
              success: true,
              message: 'Added successfully',
              member_id: insertData?.id ?? null,
              full_name: s.full_name,
              reg_number: s.reg_number,
              temp_password: tempPassword,
            });
          }
        } catch {
          allResults.push({
            row_index: i + 1,
            success: false,
            message: 'Unexpected error',
            member_id: null,
            full_name: s.full_name,
            reg_number: s.reg_number,
            temp_password: null,
          });
        }
        setProgress(Math.round(((i + 1) / students.length) * 100));
      }

      setResults(allResults);
      setStage('results');
      onComplete(); // refresh the students list

    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Import failed. Please ensure the SQL functions are deployed.']);
      setStage('preview');
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stage: Upload */}
      <AnimatePresence mode="wait">
        {stage === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Template Download */}
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: `${colors.accentMint}08`,
                border: `1px solid ${colors.accentMint}20`,
              }}
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5" style={{ color: colors.accentMint }} />
                <div>
                  <p className="text-sm font-medium text-white">CSV Template</p>
                  <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                    Download the template, fill it in, and upload
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: `${colors.accentMint}20`,
                  color: colors.accentMint,
                  border: `1px solid ${colors.accentMint}30`,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </motion.button>
            </div>

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer rounded-xl p-8 text-center transition-all duration-200"
              style={{
                background: dragActive
                  ? `${colors.primary}10`
                  : 'rgba(255, 255, 255, 0.02)',
                border: `2px dashed ${dragActive ? colors.primary : 'rgba(255, 255, 255, 0.12)'}`,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={getFileAcceptAttribute()}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <motion.div
                animate={dragActive ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
                style={{
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}25`,
                }}
              >
                <Upload className="w-7 h-7" style={{ color: colors.primary }} />
              </motion.div>
              <p className="text-sm font-semibold text-white mb-1">
                {dragActive ? 'Drop your file here' : 'Drag & drop your file'}
              </p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                or click to browse &bull; Supports {getAcceptedFormats()}
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            {/* Paste Area */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardPaste className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                  Paste CSV data directly
                </p>
              </div>
              <textarea
                ref={pasteRef}
                rows={4}
                placeholder="full_name,reg_number,email,phone,level,department,section&#10;John Doe,FE/20/12345678,john@x.com,,200L,ECE,A"
                className="w-full rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-gray-600 focus:outline-none resize-none"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  outlineColor: colors.primary,
                }}
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePaste}
                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary,
                }}
              >
                <Eye className="w-4 h-4" />
                Parse & Preview
              </motion.button>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl space-y-1"
                style={{
                  background: `${colors.statusUnpaid}10`,
                  border: `1px solid ${colors.statusUnpaid}25`,
                }}
              >
                {errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: colors.statusUnpaid }} />
                    <p className="text-xs" style={{ color: colors.statusUnpaid }}>{err}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Stage: Preview */}
        {stage === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${colors.accentMint}15` }}
                >
                  <Users className="w-5 h-5" style={{ color: colors.accentMint }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {students.length} student{students.length !== 1 ? 's' : ''} ready
                  </p>
                  <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                    from {fileName}
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setStage('upload'); setStudents([]); setErrors([]); }}
                className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: colors.textSecondary,
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <X className="w-3 h-3" />
                Clear
              </motion.button>
            </div>

            {/* Parse Warnings */}
            {errors.length > 0 && (
              <div
                className="p-3 rounded-xl"
                style={{
                  background: `${colors.warning}10`,
                  border: `1px solid ${colors.warning}25`,
                }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: colors.warning }}>
                  {errors.length} warning{errors.length !== 1 ? 's' : ''} (these rows were skipped)
                </p>
                <div className="max-h-20 overflow-y-auto space-y-0.5">
                  {errors.map((err, i) => (
                    <p key={i} className="text-[10px]" style={{ color: colors.warning }}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textSecondary }}>#</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textSecondary }}>Name</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textSecondary }}>Reg No.</th>
                      <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell" style={{ color: colors.textSecondary }}>Level</th>
                      <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell" style={{ color: colors.textSecondary }}>Dept</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.02, 0.5) }}
                        className="border-t"
                        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                      >
                        <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>
                          {String(i + 1).padStart(2, '0')}
                        </td>
                        <td className="px-3 py-2 font-medium text-white truncate max-w-[120px]">
                          {s.full_name}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]" style={{ color: colors.primary }}>
                          {s.reg_number}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell" style={{ color: colors.textSecondary }}>
                          {s.level}
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell" style={{ color: colors.textSecondary }}>
                          {s.department}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeStudent(i)}
                            className="p-1 rounded hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setStage('upload'); setStudents([]); setErrors([]); }}
                className="flex-1 px-4 py-3 rounded-xl font-medium transition-colors"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: colors.textPrimary,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                Back
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleImport}
                disabled={students.length === 0}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                  boxShadow: `0 4px 15px ${colors.primary}30`,
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Import {students.length} Student{students.length !== 1 ? 's' : ''}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Stage: Importing */}
        {stage === 'importing' && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="py-8 text-center space-y-5"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{
                background: `${colors.primary}15`,
                border: `1px solid ${colors.primary}25`,
              }}
            >
              <Loader2 className="w-8 h-8" style={{ color: colors.primary }} />
            </motion.div>

            <div>
              <p className="text-lg font-bold text-white mb-1">Importing Students...</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Please wait while we create {students.length} accounts
              </p>
            </div>

            {/* Progress Bar */}
            <div className="max-w-xs mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white">{progress}%</span>
                <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                  {Math.round((progress / 100) * students.length)} / {students.length}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint})` }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Stage: Results */}
        {stage === 'results' && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="p-4 rounded-xl text-center"
                style={{
                  background: `${colors.statusPaid}10`,
                  border: `1px solid ${colors.statusPaid}20`,
                }}
              >
                <CheckCircle className="w-6 h-6 mx-auto mb-1" style={{ color: colors.statusPaid }} />
                <p className="text-2xl font-bold" style={{ color: colors.statusPaid }}>{successCount}</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Imported</p>
              </div>
              <div
                className="p-4 rounded-xl text-center"
                style={{
                  background: failCount > 0 ? `${colors.statusUnpaid}10` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${failCount > 0 ? `${colors.statusUnpaid}20` : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <XCircle className="w-6 h-6 mx-auto mb-1" style={{ color: failCount > 0 ? colors.statusUnpaid : colors.textSecondary }} />
                <p className="text-2xl font-bold" style={{ color: failCount > 0 ? colors.statusUnpaid : colors.textSecondary }}>
                  {failCount}
                </p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Failed</p>
              </div>
            </div>

            {/* Results Detail */}
            {results.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <th className="text-left px-3 py-2" style={{ color: colors.textSecondary }}>#</th>
                        <th className="text-left px-3 py-2" style={{ color: colors.textSecondary }}>Name</th>
                        <th className="text-left px-3 py-2" style={{ color: colors.textSecondary }}>Reg No.</th>
                        <th className="text-left px-3 py-2" style={{ color: colors.textSecondary }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr
                          key={i}
                          className="border-t"
                          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                        >
                          <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>
                            {String(r.row_index).padStart(2, '0')}
                          </td>
                          <td className="px-3 py-2 font-medium text-white truncate max-w-[100px]">
                            {r.full_name}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px]" style={{ color: colors.primary }}>
                            {r.reg_number}
                          </td>
                          <td className="px-3 py-2">
                            {r.success ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: `${colors.statusPaid}20`, color: colors.statusPaid }}>
                                <CheckCircle className="w-3 h-3" /> Added
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: `${colors.statusUnpaid}20`, color: colors.statusUnpaid }}
                                title={r.message}>
                                <XCircle className="w-3 h-3" /> {r.message}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Info: passwords */}
            {successCount > 0 && (
              <div
                className="p-3 rounded-xl flex items-start gap-3"
                style={{
                  background: `${colors.info}08`,
                  border: `1px solid ${colors.info}20`,
                }}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: colors.info }} />
                <p className="text-[10px] leading-relaxed" style={{ color: colors.textSecondary }}>
                  Each member's initial password is their <strong className="text-white">registration number / ID</strong>. They will be prompted to change it on first login.
                  They will be required to change it on first login.
                </p>
              </div>
            )}

            {/* Done Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl font-semibold text-white transition-all"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                boxShadow: `0 4px 15px ${colors.primary}30`,
              }}
            >
              Done
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

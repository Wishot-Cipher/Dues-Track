/**
 * LandingPage - Payvexo public landing page
 * Users find their organization or create a new one
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Building2,
  Church,
  GraduationCap,
  Users,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME, APP_TAGLINE } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import type { Organization } from '@/types/multiTenant';

const ORG_TYPE_ICONS: Record<string, React.ReactNode> = {
  university: <GraduationCap size={20} />,
  school: <GraduationCap size={20} />,
  church: <Church size={20} />,
  club: <Users size={20} />,
  association: <Users size={20} />,
  cooperative: <Building2 size={20} />,
  ngo: <Globe size={20} />,
  other: <Building2 size={20} />,
};

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const results = await organizationService.search(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const goToOrg = (slug: string) => {
    navigate(`/${slug}/login`);
  };

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[150px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-15%',
            right: '-10%',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[120px] opacity-15"
          style={{
            background: `radial-gradient(circle, ${colors.accentCyan} 0%, transparent 70%)`,
            bottom: '10%',
            left: '-10%',
          }}
        />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-lg"
            style={{ background: colors.primary }}
          >
            P
          </div>
          <span className="text-xl font-bold text-white">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/create')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
            style={{
              color: colors.primary,
              border: `1px solid ${colors.borderPrimary}`,
              background: `rgba(255, 104, 3, 0.1)`,
            }}
          >
            <Plus size={16} />
            Create Organization
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex flex-col items-center px-4 pt-12 sm:pt-20 pb-16 max-w-4xl mx-auto">
        <motion.div
          className="text-center space-y-6 mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
            Smart Payment &
            <br />
            <span style={{ color: colors.primary }}> Dues Management</span>
          </h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto" style={{ color: colors.textSecondary }}>
            {APP_TAGLINE}. Track dues, manage expenses, and keep your community financially organized.
          </p>
        </motion.div>

        {/* Search Box */}
        <motion.div
          className="w-full max-w-xl mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(26, 14, 9, 0.8)',
              border: `1px solid ${colors.borderMedium}`,
              boxShadow: `0 8px 32px rgba(255, 104, 3, 0.15)`,
            }}
          >
            <Search
              size={20}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: colors.textTertiary }}
            />
            <input
              type="text"
              placeholder="Search for your organization..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-transparent text-white pl-12 pr-4 py-4 text-lg outline-none placeholder-gray-500"
            />
          </div>

          {/* Search Results */}
          {hasSearched && (
            <motion.div
              className="mt-3 rounded-2xl overflow-hidden"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(26, 14, 9, 0.9)',
                border: `1px solid ${colors.borderLight}`,
              }}
            >
              {searching ? (
                <div className="p-6 text-center" style={{ color: colors.textTertiary }}>
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {searchResults.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => goToOrg(org.slug)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: `${org.primary_color || colors.primary}20`,
                          color: org.primary_color || colors.primary,
                        }}
                      >
                        {ORG_TYPE_ICONS[org.organization_type] || <Building2 size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{org.name}</p>
                        <p className="text-sm capitalize" style={{ color: colors.textTertiary }}>
                          {org.organization_type} &bull; {org.short_name}
                        </p>
                      </div>
                      <ChevronRight size={18} style={{ color: colors.textTertiary }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center space-y-3">
                  <p style={{ color: colors.textTertiary }}>
                    No organizations found for &quot;{searchQuery}&quot;
                  </p>
                  <button
                    onClick={() => navigate('/create')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
                    style={{
                      color: colors.primary,
                      border: `1px solid ${colors.borderPrimary}`,
                    }}
                  >
                    <Plus size={16} />
                    Create your organization
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* OR divider */}
        <div className="flex items-center gap-4 w-full max-w-xl mb-8">
          <div className="flex-1 h-px" style={{ background: colors.borderLight }} />
          <span className="text-sm font-medium" style={{ color: colors.textTertiary }}>
            or enter your org link
          </span>
          <div className="flex-1 h-px" style={{ background: colors.borderLight }} />
        </div>

        {/* Direct Slug Entry */}
        <motion.form
          className="w-full max-w-xl flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem('slug') as HTMLInputElement)?.value?.trim().toLowerCase();
            if (input) goToOrg(input);
          }}
        >
          <div
            className="flex-1 flex items-center rounded-xl overflow-hidden"
            style={{
              background: 'rgba(26, 14, 9, 0.9)',
              border: `1px solid ${colors.borderLight}`,
            }}
          >
            <span className="pl-4 text-sm shrink-0" style={{ color: colors.textTertiary }}>
              payvexo.com/
            </span>
            <input
              name="slug"
              type="text"
              placeholder="your-org"
              className="flex-1 bg-transparent text-white px-1 py-3 outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-3 rounded-xl font-medium text-white flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            style={{ background: colors.primary }}
          >
            Go
            <ArrowRight size={18} />
          </button>
        </motion.form>

        {/* Features Grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 w-full max-w-3xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          {[
            {
              icon: <Shield size={24} />,
              title: 'Secure',
              desc: 'Bank-level encryption & role-based access control',
            },
            {
              icon: <Zap size={24} />,
              title: 'Fast',
              desc: 'Real-time tracking with instant notifications',
            },
            {
              icon: <Globe size={24} />,
              title: 'Universal',
              desc: 'Universities, churches, clubs & organizations',
            },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="p-6 rounded-2xl text-center space-y-3"
              style={{
                background: 'rgba(26, 14, 9, 0.5)',
                border: `1px solid ${colors.borderLight}`,
              }}
            >
              <div className="inline-flex p-3 rounded-xl" style={{ background: `${colors.primary}15`, color: colors.primary }}>
                {icon}
              </div>
              <h3 className="text-white font-semibold">{title}</h3>
              <p className="text-sm" style={{ color: colors.textTertiary }}>
                {desc}
              </p>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-16 text-center space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <p style={{ color: colors.textTertiary }}>
            Ready to get started?
          </p>
          <button
            onClick={() => navigate('/create')}
            className="px-8 py-4 rounded-2xl text-white font-semibold text-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
              boxShadow: `0 8px 30px ${colors.primary}40`,
            }}
          >
            Create Your Organization — Free
          </button>
          <p className="text-xs" style={{ color: colors.textDisabled }}>
            No credit card required &bull; 14-day free trial
          </p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t py-8 px-6 text-center" style={{ borderColor: colors.borderLight }}>
        <p className="text-sm" style={{ color: colors.textDisabled }}>
          &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

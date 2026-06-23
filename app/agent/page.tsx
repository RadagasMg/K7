'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { AgentView } from '@/components/AgentView';
import { SackManager } from '@/components/SackManager';
import { DeconsolidationView } from '@/components/DeconsolidationView';
import { ShipperHandoffView } from '@/components/ShipperHandoffView';
import { DispatchView } from '@/components/DispatchView';
import { ArchivesView } from '@/components/ArchivesView';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PackagePlus, Box, Truck, PackageOpen, Send, Archive } from 'lucide-react';

export default function AgentDashboard() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'gz_intake' | 'gz_sack' | 'gz_handoff' | 'tnr_deconsolidation' | 'tnr_dispatch' | 'archives' | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'agent')) {
      router.push('/');
    }
  }, [profile, loading, router]);

  const currentTab = activeTab || (profile?.agentLocation === 'madagascar' ? 'tnr_deconsolidation' : 'gz_intake');

  if (loading || !profile || profile.role !== 'agent') return <div className="p-8 text-gray-900 dark:text-gray-100">Chargement...</div>;

  const agentTabs = [
    ...(profile.agentLocation !== 'madagascar' ? [
      { id: 'gz_intake', label: 'Reception', icon: PackagePlus },
      { id: 'gz_sack', label: 'Packing', icon: Box },
      { id: 'gz_handoff', label: 'Shipping', icon: Truck },
    ] : []),
    ...(profile.agentLocation === 'madagascar' ? [
      { id: 'tnr_deconsolidation', label: 'Reception', icon: PackageOpen },
      { id: 'tnr_dispatch', label: 'Dispatch', icon: Send },
    ] : []),
    { id: 'archives', label: 'Archives', icon: Archive },
  ];

  return (
    <DashboardLayout 
      title="Tableau de bord Agent"
      tabs={agentTabs}
      activeTab={currentTab}
      onTabChange={(tab: string) => setActiveTab(tab as any)}
    >
      <div className="mx-auto max-w-6xl">
        {/* Top tabs removed, handled by sidebar */}
        
        {currentTab === 'gz_intake' && <AgentView profile={profile} />}
        {currentTab === 'gz_sack' && <SackManager profile={profile} />}
        {currentTab === 'gz_handoff' && <ShipperHandoffView profile={profile} />}
        {currentTab === 'tnr_deconsolidation' && <DeconsolidationView profile={profile} />}
        {currentTab === 'tnr_dispatch' && <DispatchView profile={profile} />}
        {currentTab === 'archives' && <ArchivesView profile={profile} />}
      </div>
    </DashboardLayout>
  );
}

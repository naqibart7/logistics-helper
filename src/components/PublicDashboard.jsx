import React, { useMemo, useEffect, useState } from 'react';
import { Activity, TrendingUp, AlertCircle, Clock, CheckCircle2, ChevronRight, Zap, Target, Box, Database, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

const PublicDashboard = ({ projects, onSignInRequest }) => {
    // Generate smart stats
    const stats = useMemo(() => {
        const total = projects.length;
        const active = projects.filter(p => !['Completed', 'Delivered'].includes(p.status)).length;
        const totalMaterials = projects.reduce((acc, p) => acc + (p.materials?.length || 0), 0);
        
        let pendingDeliveries = 0;
        let actionRequired = 0;
        let urgentItems = [];
        
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

        projects.forEach(p => {
            const isUrgentProject = p.needByDate && new Date(p.needByDate) <= threeDaysFromNow;
            
            p.materials?.forEach(m => {
                const isPending = !m.status || m.status === 'Pending';
                if (m.status === 'Ordered') pendingDeliveries++;
                if (!m.supplier || isPending) {
                    actionRequired++;
                    if (isUrgentProject || isPending) {
                        urgentItems.push({
                            project: p.name,
                            item: m.item,
                            status: m.status || 'Pending'
                        });
                    }
                }
            });
        });

        return { 
            total, 
            active, 
            totalMaterials, 
            pendingDeliveries, 
            actionRequired, 
            urgentHotlist: urgentItems.slice(0, 5) 
        };
    }, [projects]);

    const smartUpdates = useMemo(() => {
        const updates = [];
        if (projects.length === 0) {
            updates.push({
                type: 'info',
                title: 'System Initialized',
                message: 'AI tracking mechanisms are standing by. Add projects to begin monitoring.',
                time: 'Just now',
                icon: ShieldCheck,
                gradient: 'from-blue-500 to-cyan-400'
            });
            updates.push({
                type: 'info',
                title: 'Data Synchronization',
                message: 'Cloud backup is currently active in anonymous mode.',
                time: 'Continuous',
                icon: Database,
                gradient: 'from-fuchsia-500 to-purple-500'
            });
        } else {
            if (stats.urgentHotlist.length > 0) {
                updates.push({
                    type: 'alert',
                    title: 'Critical Path Alert',
                    message: `${stats.urgentHotlist.length} urgent items require immediate attention for upcoming deadlines.`,
                    time: 'ASAP',
                    icon: AlertCircle,
                    gradient: 'from-rose-600 to-red-400'
                });
            }
            if (stats.actionRequired > 0) {
                updates.push({
                    type: 'alert',
                    title: 'Supply Gap Detected',
                    message: `${stats.actionRequired} items lack assigned suppliers or confirmed pricing.`,
                    time: 'High Priority',
                    icon: Zap,
                    gradient: 'from-amber-500 to-orange-400'
                });
            }
            if (stats.pendingDeliveries > 0) {
                updates.push({
                    type: 'delivery',
                    title: 'In-Transit Monitoring',
                    message: `${stats.pendingDeliveries} shipments active. Verify arrival checklists upon receipt.`,
                    time: 'Active',
                    icon: Clock,
                    gradient: 'from-blue-400 to-indigo-500'
                });
            }
            projects.filter(p => p.status === 'Active').slice(0, 1).forEach(p => {
                updates.push({
                    type: 'status',
                    title: `Project Health: ${p.name}`,
                    message: `Tracking ${p.materials?.length || 0} items. Overall logistics completion at ${Math.round((p.materials?.filter(m => m.status === 'Received').length / (p.materials?.length || 1)) * 100)}%.`,
                    time: 'Analysis',
                    icon: Activity,
                    gradient: 'from-emerald-400 to-teal-500'
                });
            });
        }
        return updates;
    }, [projects, stats]);

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-900/10 blur-[100px] rounded-full pointer-events-none translate-y-1/3"></div>

            <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                    <div className="animate-in slide-in-from-bottom-4 duration-700 fade-in">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4">
                            <Sparkles size={14} className="animate-pulse" /> AI Logistics Intelligence
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-gray-500 mb-3">
                            Project Operations
                        </h1>
                        <p className="text-gray-400 text-lg max-w-xl">
                            Real-time intelligence dashboard for project status, supplier gaps, and delivery tracking.
                        </p>
                    </div>
                    <button 
                        onClick={onSignInRequest}
                        className="group relative px-8 py-3.5 bg-white text-black rounded-2xl font-bold shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.6)] transition-all flex items-center gap-3 animate-in fade-in duration-1000 delay-300"
                    >
                        <span>Unlock Full Command</span>
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    {[
                        { label: 'Active Projects', value: stats.active, icon: Target, delay: '0', trend: '+2 this week' },
                        { label: 'Tracking Points', value: stats.totalMaterials, icon: Box, delay: '100', trend: 'Live monitoring' },
                        { label: 'Shipments', value: stats.pendingDeliveries, icon: Clock, delay: '200', trend: 'Active transit' },
                        { label: 'Response Needed', value: stats.actionRequired, icon: AlertCircle, delay: '300', trend: 'Critical gap', urgent: stats.actionRequired > 0 }
                    ].map((stat, i) => (
                        <div 
                            key={i} 
                            className={`group relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/10 p-6 backdrop-blur-xl transition-all hover:bg-white/[0.05] hover:-translate-y-1 animate-in slide-in-from-bottom-8 fade-in duration-700`}
                            style={{ animationDelay: `${stat.delay}ms` }}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="text-gray-400 font-medium text-sm uppercase tracking-wider">{stat.label}</h3>
                                <div className={`p-2 rounded-lg bg-white/5 ${stat.urgent ? 'text-rose-500' : 'text-blue-400'} group-hover:scale-110 transition-transform`}>
                                    <stat.icon size={18} />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-3 mb-1">
                                <p className="text-4xl font-bold font-mono tracking-tighter">{stat.value}</p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stat.urgent ? 'bg-rose-500/10 text-rose-400' : 'bg-green-500/10 text-green-400'}`}>
                                    {stat.trend}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Visualizer Panel */}
                    <div className="lg:col-span-2 flex flex-col gap-8">
                        {/* Live Hotlist */}
                        <div className="relative group animate-in zoom-in-95 fade-in duration-1000 delay-500">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                            <div className="relative rounded-3xl bg-[#0f0f13] border border-white/10 p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-xl font-bold flex items-center gap-3">
                                        <TrendingUp size={20} className="text-rose-500" />
                                        Urgent Action Hotlist
                                    </h3>
                                    <span className="text-xs text-gray-400 font-medium px-3 py-1 rounded-full border border-white/5">
                                        Scanned {new Date().toLocaleTimeString()}
                                    </span>
                                </div>
                                
                                {stats.urgentHotlist.length > 0 ? (
                                    <div className="space-y-4">
                                        {stats.urgentHotlist.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors border-l-2 border-l-rose-500">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{item.project}</span>
                                                    <span className="text-gray-200 font-medium">{item.item}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs font-mono text-rose-400 bg-rose-400/10 px-2 py-1 rounded">Needs Supplier</span>
                                                    <ChevronRight size={16} className="text-gray-600" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-center text-gray-500">
                                        <CheckCircle2 size={40} className="text-emerald-500 mb-4 opacity-70" />
                                        <p className="font-medium text-gray-300">All critical paths cleared</p>
                                        <p className="text-sm">No immediate bottlenecks detected in the logistics pipeline.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Restricted Graphic */}
                        <div className="relative flex-1 rounded-3xl bg-gradient-to-br from-[#0f0f13] to-[#0a0a0f] border border-white/10 p-8 flex flex-col items-center justify-center text-center group overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
                                <ShieldCheck size={120} className="text-blue-500 rotate-12" />
                            </div>
                            <h4 className="text-lg font-bold mb-2">Extended Analytics Restricted</h4>
                            <p className="text-sm text-gray-500 max-w-sm mb-6">
                                Sign in to view comprehensive supply chain heatmaps, lead-time predictions, and consolidated WhatsApp negotiation logs.
                            </p>
                            <button 
                                onClick={onSignInRequest}
                                className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition-all text-sm"
                            >
                                Re-verify Identity
                            </button>
                        </div>
                    </div>

                    {/* Feed Panel */}
                    <div className="animate-in slide-in-from-right-8 fade-in duration-1000 delay-500">
                        <div className="rounded-3xl bg-[#0f0f13] border border-white/10 overflow-hidden h-full flex flex-col">
                            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Activity size={18} className="text-blue-400" />
                                    Intelligence Stream
                                </h3>
                                <span className="flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                            </div>
                            <div className="p-6 flex-1 flex flex-col gap-8 overflow-y-auto">
                                {smartUpdates.map((update, i) => (
                                    <div key={i} className="flex gap-4 relative group">
                                        {i !== smartUpdates.length - 1 && (
                                            <div className="absolute left-[19px] top-12 bottom-[-32px] w-px bg-white/10 group-hover:bg-white/20 transition-colors"></div>
                                        )}
                                        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${update.gradient} z-10 shadow-lg ring-1 ring-white/20`}>
                                            <update.icon size={18} className="text-white" />
                                        </div>
                                        <div className="pt-0.5">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="text-gray-100 font-semibold text-sm">{update.title}</h4>
                                                <span className="text-[9px] uppercase tracking-tighter font-extrabold text-blue-400/80 bg-blue-400/10 px-1.5 py-0.5 rounded">
                                                    {update.time}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 leading-relaxed font-medium">{update.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicDashboard;

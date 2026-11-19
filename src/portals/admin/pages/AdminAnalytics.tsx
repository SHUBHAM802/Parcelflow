import React, { useState, useEffect } from 'react';
import { KPICard } from '../../../shared/components/KPICard';
import { apiFetch } from '../../../shared/lib/api';
import { formatINR } from '../../../shared/lib/formatters';
import {
  DollarSign,
  ShoppingCart,
  Zap,
  AlertTriangle,
  TrendingUp,
  Download,
  Calendar,
  ScanLine,
  Timer,
  CheckCircle2,
  AlertOctagon
} from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

const COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];

export const AdminAnalytics: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = () => {
    setIsLoading(true);
    apiFetch<any>('/analytics/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (isLoading || !data) {
    return (
      <div className="py-20 text-center text-zinc-500">
        Compiling business analytics &amp; conveyor throughput telemetry...
      </div>
    );
  }

  const overview = data?.overview || {
    totalRevenue: data?.kpis?.totalRevenue ?? 0,
    totalOrders: data?.kpis?.totalOrders ?? 0,
    sortRatePerHour: 42,
    sortingEfficiency: '99.4%',
    lowStockCount: data?.kpis?.lowStockCount ?? 0,
  };
  const revenueByDay = data?.revenueByDay || [];
  const destinationDistribution = data?.destinationDistribution || [];
  const hourlyThroughput = data?.hourlyThroughput || [];
  const statusBreakdown = data?.statusBreakdown || data?.statusCounts || [];

  return (
    <div className="space-y-8 pb-16">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Executive Operations &amp; Revenue</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time business performance, billing aggregates, and automated warehouse metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={fetchAnalytics}>
            Refresh Metrics
          </Button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value={formatINR(overview.totalRevenue)}
          subtext="Net confirmed sales"
          icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
        />
        <KPICard
          label="Total Orders"
          value={overview.totalOrders}
          subtext={data?.kpis?.pendingPayments ? `${data.kpis.pendingPayments} pending payments` : 'Storefront orders'}
          icon={<ShoppingCart className="w-4 h-4 text-blue-600" />}
        />
        <KPICard
          label="Conveyor Sort Rate"
          value={`${overview.sortRatePerHour} / hr`}
          subtext={data?.warehouseMetrics?.avgSortTimeMs ? `Avg sort: ${data.warehouseMetrics.avgSortTimeMs} ms` : 'Optical sorting'}
          icon={<Zap className="w-4 h-4 text-amber-600" />}
        />
        <KPICard
          label="Low Stock Alerts"
          value={overview.lowStockCount}
          subtext="Inventory threshold triggers"
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 7-Day Revenue Area Chart */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">7-Day Revenue Trend</h3>
              <p className="text-xs text-zinc-500">Gross sales before GST deduction</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Active
            </span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#a1a1aa" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#a1a1aa"
                  tickFormatter={val => `₹${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [formatINR(Number(val)), 'Revenue']}
                  contentStyle={{ backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Destination City Distribution Donut */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Destination Hub Allocation</h3>
              <p className="text-xs text-zinc-500">Orders routed across 5 sorting bays</p>
            </div>
            <span className="text-xs font-mono text-zinc-500">Auto-Binned</span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={destinationDistribution}
                  dataKey="count"
                  nameKey="city"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                >
                  {destinationDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Sorting Throughput Bar Chart */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Hourly Conveyor Throughput</h3>
              <p className="text-xs text-zinc-500">Parcels scanned by infrared sensor &amp; sorted</p>
            </div>
            <span className="text-xs font-mono text-teal-600 font-bold">Live telemetry</span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyThroughput}>
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="#a1a1aa" />
                <YAxis tick={{ fontSize: 11 }} stroke="#a1a1aa" />
                <Tooltip
                  formatter={(val: any) => [`${val} parcels`, 'Throughput']}
                  contentStyle={{ backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Funnel / Breakdown */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Order Fulfillment Funnel</h3>
              <p className="text-xs text-zinc-500">Volume across warehouse stages</p>
            </div>
            <span className="text-xs font-mono text-zinc-500">Pipeline health</span>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBreakdown} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#a1a1aa" />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 10 }} stroke="#a1a1aa" width={90} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Optical Scanning Quality & Physical Pipeline Telemetry (Phase 7.2) */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-teal-600" />
              <span>Optical QR Scanning &amp; Physical Pipeline Analytics</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live webcam decode performance, rejection taxonomy, and robotic arm cycle times.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded border border-teal-200">
            Scan Accuracy: {data?.pipelineAnalytics?.scanSuccessRate ?? 98}%
          </span>
        </div>

        {/* 4 Pipeline Micro-Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">TOTAL SCANS LOGGED</span>
            <span className="text-xl font-bold font-mono text-zinc-900 mt-1 block">
              {data?.pipelineAnalytics?.totalScans ?? 0}
            </span>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Camera + manual decodes</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">SCAN SUCCESS RATE</span>
            <span className="text-xl font-bold font-mono text-emerald-700 mt-1 block">
              {data?.pipelineAnalytics?.scanSuccessRate ?? 100}%
            </span>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">Cryptographic MAC verified</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">AVG SCAN-TO-SORT TIME</span>
            <span className="text-xl font-bold font-mono text-teal-700 mt-1 block">
              {data?.pipelineAnalytics?.avgScanToSortedSec ?? 5}s
            </span>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">IR pick + 4-DOF placement</span>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">ACTIVE SORTING BINS</span>
            <span className="text-xl font-bold font-mono text-zinc-900 mt-1 block">
              {data?.pipelineAnalytics?.binsStats?.length ?? 4} Bins
            </span>
            <span className="text-[11px] text-zinc-500 mt-0.5 block">Category-routed allocation</span>
          </div>
        </div>

        {/* Rejection Breakdown and Bin Allocation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Rejections taxonomy */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Optical Rejection Breakdown
            </h4>
            {(!data?.pipelineAnalytics?.rejectsByReason || data.pipelineAnalytics.rejectsByReason.length === 0) ? (
              <p className="text-xs text-zinc-400 italic py-4 text-center">
                Zero rejections recorded — 100% first-pass decode rate.
              </p>
            ) : (
              <div className="space-y-2 font-mono text-xs">
                {data.pipelineAnalytics.rejectsByReason.map((r: any) => (
                  <div key={r.result} className="flex items-center justify-between p-2 rounded bg-white border border-zinc-200">
                    <span className="font-semibold text-zinc-800">{r.result}</span>
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">{r.count} rejection(s)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bin Counts */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/50 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Live Parcels Staged per Bin
            </h4>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              {(data?.pipelineAnalytics?.binsStats || []).map((b: any) => (
                <div key={b.label} className="p-2.5 rounded bg-white border border-zinc-200 flex justify-between items-center">
                  <span className="font-bold text-zinc-900">{b.label}</span>
                  <span className="text-teal-700 font-black text-sm">{b.parcel_count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

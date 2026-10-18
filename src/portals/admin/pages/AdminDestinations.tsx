import React, { useState, useEffect } from 'react';
import { Bin } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { useToast } from '../../../shared/store/toastContext';
import { Sliders, Edit2, Play, CheckCircle2, RotateCcw, Power, Cpu, Boxes } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export const AdminDestinations: React.FC = () => {
  const { showToast } = useToast();
  const [bins, setBins] = useState<Bin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [testingBinId, setTestingBinId] = useState<string | null>(null);

  // Edit Modal State
  const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
  const [label, setLabel] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [servoAngles, setServoAngles] = useState<{ base: number; shoulder: number; elbow: number; wrist: number }>({
    base: 90,
    shoulder: 90,
    elbow: 90,
    wrist: 90
  });
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchBins = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<Bin[]>('/admin/bins');
      setBins(data);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to load bins', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const cats = await apiFetch<Category[]>('/inventory/categories');
      setCategories(cats || []);
    } catch {
      // Fallback default categories
      setCategories([
        { id: 'cat-elec', name: 'Electronics', slug: 'electronics' },
        { id: 'cat-fash', name: 'Fashion & Apparel', slug: 'fashion' },
        { id: 'cat-books', name: 'Books & Media', slug: 'books' },
        { id: 'cat-acc', name: 'Accessories', slug: 'accessories' },
        { id: 'cat-fit', name: 'Fitness & Sports', slug: 'fitness' },
        { id: 'cat-home', name: 'Home & Kitchen', slug: 'home-kitchen' }
      ]);
    }
  };

  useEffect(() => {
    fetchBins();
    fetchCategories();
  }, []);

  const handleOpenEdit = (bin: Bin) => {
    setSelectedBin(bin);
    setLabel(bin.label);
    setCategoryId(bin.category_id || '');
    setIsActive(bin.is_active === 1);
    try {
      const parsed = JSON.parse(bin.servo_preset_json);
      setServoAngles({
        base: parsed.base ?? 90,
        shoulder: parsed.shoulder ?? 90,
        elbow: parsed.elbow ?? 90,
        wrist: parsed.wrist ?? 90
      });
    } catch {
      setServoAngles({ base: 90, shoulder: 90, elbow: 90, wrist: 90 });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBin) return;

    // Validate 0-180 servo degrees
    for (const [axis, angle] of Object.entries(servoAngles)) {
      const num = Number(angle);
      if (isNaN(num) || num < 0 || num > 180) {
        showToast(`Servo angle for ${axis} must be between 0° and 180°`, 'error');
        return;
      }
    }

    try {
      await apiFetch(`/admin/bins/${selectedBin.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          label,
          category_id: categoryId || null,
          servo_preset_json: JSON.stringify(servoAngles),
          is_active: isActive
        })
      });
      showToast(`Updated configuration for ${label}`, 'success');
      setIsModalOpen(false);
      fetchBins();
    } catch (err: any) {
      showToast(err.message || 'Failed to update bin', 'error');
    }
  };

  const handleTestMove = async (bin: Bin) => {
    setTestingBinId(bin.id);
    try {
      const res = await apiFetch<any>(`/admin/bins/${bin.id}/test-move`, { method: 'POST' });
      showToast(`Queued test move to ${bin.label} (Command: ${res.commandId.slice(0, 8)})`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Test move failed — check if parcel in flight', 'error');
    } finally {
      setTestingBinId(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Destination Bins &amp; Servo Presets</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Data-driven sorting bins routed by product category. Configure 4-DOF servo angles and test arm actuation.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchBins}>
          Refresh Bins
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-zinc-400 text-xs">Loading bins...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {bins.map(b => {
            let servo: any = {};
            try { servo = JSON.parse(b.servo_preset_json); } catch {}

            return (
              <div
                key={b.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs space-y-4 transition-all ${
                  b.is_active === 1
                    ? 'border-zinc-200/90 hover:border-zinc-300'
                    : 'border-zinc-200 bg-zinc-50/60 opacity-70'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center font-mono font-bold text-sm shadow-xs">
                      {b.bin_number}
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-1.5">
                        <span>{b.label}</span>
                        {b.is_overflow === 1 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                            OVERFLOW
                          </span>
                        )}
                      </h3>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {b.is_active === 1 ? '● ACTIVE' : '○ DISABLED'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(b)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-teal-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                    title="Edit Bin Configuration"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Routing Category */}
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    ROUTED CATEGORY
                  </span>
                  <div className="font-semibold text-zinc-800 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-200 flex items-center justify-between">
                    <span>{b.category_name || (b.is_overflow === 1 ? 'Catch-all / Overflow' : 'None')}</span>
                  </div>
                </div>

                {/* Servo Presets Grid */}
                <div className="space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    SERVO ANGLES (4-DOF)
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    <div className="p-1.5 rounded bg-zinc-50 border border-zinc-200 flex justify-between">
                      <span className="text-zinc-500">Base:</span>
                      <span className="font-bold text-zinc-900">{servo.base ?? 90}°</span>
                    </div>
                    <div className="p-1.5 rounded bg-zinc-50 border border-zinc-200 flex justify-between">
                      <span className="text-zinc-500">Shoulder:</span>
                      <span className="font-bold text-zinc-900">{servo.shoulder ?? 90}°</span>
                    </div>
                    <div className="p-1.5 rounded bg-zinc-50 border border-zinc-200 flex justify-between">
                      <span className="text-zinc-500">Elbow:</span>
                      <span className="font-bold text-zinc-900">{servo.elbow ?? 90}°</span>
                    </div>
                    <div className="p-1.5 rounded bg-zinc-50 border border-zinc-200 flex justify-between">
                      <span className="text-zinc-500">Wrist:</span>
                      <span className="font-bold text-zinc-900">{servo.wrist ?? 90}°</span>
                    </div>
                  </div>
                </div>

                {/* Metrics & Test Move Button */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-mono">PARCELS SORTED</span>
                    <span className="text-base font-bold font-mono text-teal-800">{b.parcel_count}</span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingBinId === b.id || b.is_active === 0}
                    onClick={() => handleTestMove(b)}
                    icon={<Play className="w-3 h-3 fill-current text-teal-600" />}
                  >
                    {testingBinId === b.id ? 'Moving...' : 'Test Move'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Bin Modal */}
      {selectedBin && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Edit ${selectedBin.label}`}
          subtitle="Configure category routing and servo actuator angle presets"
          maxWidth="md"
        >
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Bin Label</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                required
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg font-mono text-zinc-900 font-bold"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Product Category Mapping</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-900"
              >
                <option value="">Catch-all / Overflow Bin</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="font-semibold text-zinc-700 block">4-DOF Robotic Servo Presets (0° – 180°)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-zinc-500 block mb-0.5">Base Servo (0-180°)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.base}
                    onChange={e => setServoAngles({ ...servoAngles, base: Number(e.target.value) })}
                    className="w-full h-8 px-2.5 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block mb-0.5">Shoulder Servo (0-180°)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.shoulder}
                    onChange={e => setServoAngles({ ...servoAngles, shoulder: Number(e.target.value) })}
                    className="w-full h-8 px-2.5 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block mb-0.5">Elbow Servo (0-180°)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.elbow}
                    onChange={e => setServoAngles({ ...servoAngles, elbow: Number(e.target.value) })}
                    className="w-full h-8 px-2.5 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block mb-0.5">Wrist Servo (0-180°)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.wrist}
                    onChange={e => setServoAngles({ ...servoAngles, wrist: Number(e.target.value) })}
                    className="w-full h-8 px-2.5 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="activeBinCheck"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <label htmlFor="activeBinCheck" className="text-zinc-700 font-medium cursor-pointer">
                Bin is actively accepting parcels from routing engine
              </label>
            </div>

            <div className="pt-4 border-t border-zinc-100 flex justify-end gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="teal" size="sm" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

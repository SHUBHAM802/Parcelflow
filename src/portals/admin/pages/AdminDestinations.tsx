import React, { useState, useEffect } from 'react';
import { Bin, RouteProfile, ServoJointCalibration } from '../../../types';
import { apiFetch } from '../../../shared/lib/api';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { useToast } from '../../../shared/store/toastContext';
import { QRCodeSVG } from 'qrcode.react';
import {
  Sliders, Edit2, Play, CheckCircle2, RotateCcw, Power, Cpu, Boxes,
  QrCode, Compass, Wrench, Download, RefreshCw, AlertTriangle, ShieldCheck
} from 'lucide-react';

export const AdminDestinations: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'routes' | 'bins' | 'calibration'>('routes');

  // Route Profiles State
  const [routeProfiles, setRouteProfiles] = useState<RouteProfile[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [calibrations, setCalibrations] = useState<ServoJointCalibration[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Selected Profile for QR Modal
  const [selectedProfileForQr, setSelectedProfileForQr] = useState<RouteProfile | null>(null);

  // Testing Joint State
  const [testingJointIndex, setTestingJointIndex] = useState<number | null>(null);
  const [testingBinId, setTestingBinId] = useState<string | null>(null);

  // Edit Route Profile Modal
  const [editProfile, setEditProfile] = useState<RouteProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileTargetBinId, setProfileTargetBinId] = useState('');
  const [profileIsActive, setProfileIsActive] = useState(true);
  const [profileNotes, setProfileNotes] = useState('');

  // Edit Bin Modal
  const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
  const [binLabel, setBinLabel] = useState('');
  const [binIsActive, setBinIsActive] = useState(true);
  const [servoAngles, setServoAngles] = useState<{
    base: number; shoulder: number; elbow: number; wrist_pitch: number; wrist_roll: number; gripper: number; aux: number;
  }>({
    base: 90, shoulder: 85, elbow: 105, wrist_pitch: 85, wrist_roll: 90, gripper: 50, aux: 90
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profilesData, binsData, calibData] = await Promise.all([
        apiFetch<RouteProfile[]>('/admin/route-profiles').catch(() => []),
        apiFetch<Bin[]>('/admin/bins').catch(() => []),
        apiFetch<ServoJointCalibration[]>('/admin/servo-calibration').catch(() => [])
      ]);
      setRouteProfiles(profilesData || []);
      setBins(binsData || []);
      setCalibrations(calibData || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load route configuration', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Save Route Profile
  const handleSaveRouteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProfile) return;
    try {
      await apiFetch(`/admin/route-profiles/${editProfile.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: profileName,
          city: profileCity,
          target_bin_id: profileTargetBinId,
          is_active: profileIsActive ? 1 : 0,
          notes: profileNotes
        })
      });
      showToast(`Updated route profile ${editProfile.code}`, 'success');
      setEditProfile(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update route profile', 'error');
    }
  };

  // Handle Save Bin Presets
  const handleSaveBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBin) return;
    try {
      await apiFetch(`/admin/bins/${selectedBin.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: binLabel,
          servo_preset_json: JSON.stringify(servoAngles),
          is_active: binIsActive ? 1 : 0
        })
      });
      showToast(`Updated servo preset for ${selectedBin.label}`, 'success');
      setSelectedBin(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update bin', 'error');
    }
  };

  // Handle Test Joint Actuation
  const handleTestJoint = async (jointIndex: number, targetAngle: number) => {
    setTestingJointIndex(jointIndex);
    try {
      const res = await apiFetch<any>('/admin/servo-calibration/test-joint', {
        method: 'POST',
        body: JSON.stringify({ jointIndex, angle: targetAngle })
      });
      showToast(`Actuated Joint ${jointIndex} to ${targetAngle}° (Cmd: ${res.commandId.slice(0, 8)})`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to actuate joint', 'error');
    } finally {
      setTestingJointIndex(null);
    }
  };

  // Handle Test Move to Bin
  const handleTestMoveBin = async (bin: Bin) => {
    setTestingBinId(bin.id);
    try {
      const res = await apiFetch<any>(`/admin/bins/${bin.id}/test-move`, { method: 'POST' });
      showToast(`Queued test trajectory to ${bin.label} (Cmd: ${res.commandId.slice(0, 8)})`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Test move failed — ensure no parcel in flight', 'error');
    } finally {
      setTestingBinId(null);
    }
  };

  // Update Calibration Joint
  const handleUpdateCalibration = async (jointIndex: number, updates: Partial<ServoJointCalibration>) => {
    try {
      await apiFetch(`/admin/servo-calibration/${jointIndex}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      showToast(`Updated calibration for Joint ${jointIndex}`, 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update calibration', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2.5">
            <Compass className="w-6 h-6 text-teal-700" />
            <span>Destination Route Profiles &amp; 7-Servo Calibration</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-world smart parcel sorting configuration for 6 destination profiles, disposable fallback reject bin, and 7-axis PCA9685 arm kinematics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchData} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'routes'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>6 Route Profiles + Fallback ({routeProfiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('bins')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'bins'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Physical Bins &amp; 7-Servo Presets ({bins.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('calibration')}
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'calibration'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>7-Joint PCA9685 Calibration</span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 1: 6 DESTINATION ROUTE PROFILES + DISPOSABLE FALLBACK    */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'routes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {routeProfiles.map(rp => (
              <div
                key={rp.id}
                className={`bg-white border rounded-2xl p-4 shadow-xs space-y-3 transition-all ${
                  rp.is_disposable_fallback === 1
                    ? 'border-amber-300 bg-amber-50/20'
                    : 'border-zinc-200/90 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                      rp.is_disposable_fallback === 1 ? 'bg-amber-600 text-white' : 'bg-teal-800 text-white'
                    }`}>
                      {rp.code}
                    </span>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm leading-tight">{rp.name}</h4>
                      <span className="text-[10px] text-zinc-400 font-mono">City: {rp.city}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setEditProfile(rp);
                      setProfileName(rp.name);
                      setProfileCity(rp.city);
                      setProfileTargetBinId(rp.target_bin_id);
                      setProfileIsActive(rp.is_active === 1);
                      setProfileNotes(rp.notes || '');
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-teal-700 hover:bg-zinc-100 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Target Bin Mapping */}
                <div className="text-xs bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">TARGET PHYSICAL BIN</span>
                  <div className="font-semibold text-zinc-800 flex items-center justify-between">
                    <span>{rp.target_bin_label || rp.target_bin_id}</span>
                    {rp.is_disposable_fallback === 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">
                        FALLBACK
                      </span>
                    )}
                  </div>
                </div>

                {/* QR Code Payload & Preview */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">AUTHENTIC QR PAYLOAD</span>
                  <div className="font-mono text-[10px] bg-zinc-100 p-1.5 rounded truncate text-zinc-700 border border-zinc-200">
                    {rp.qr_code_payload}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedProfileForQr(rp)}
                    icon={<QrCode className="w-3.5 h-3.5 text-teal-600" />}
                  >
                    View / Print QR
                  </Button>

                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                    rp.is_active === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {rp.is_active === 1 ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 2: PHYSICAL BINS (7 BINS) & 7-SERVO PRESETS             */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'bins' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {bins.map(b => {
            let servo: any = {};
            try { servo = JSON.parse(b.servo_preset_json); } catch {}

            return (
              <div
                key={b.id}
                className={`bg-white border rounded-2xl p-4 shadow-xs space-y-3 ${
                  b.is_disposable_fallback === 1
                    ? 'border-amber-300 bg-amber-50/10'
                    : 'border-zinc-200/90 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center font-mono font-bold text-xs shadow-xs">
                      {b.bin_number}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900 text-sm">{b.label}</h4>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {b.is_disposable_fallback === 1 ? 'DISPOSABLE REJECT' : `BIN #${b.bin_number}`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedBin(b);
                      setBinLabel(b.label);
                      setBinIsActive(b.is_active === 1);
                      try {
                        const parsed = JSON.parse(b.servo_preset_json);
                        setServoAngles({
                          base: parsed.base ?? 90,
                          shoulder: parsed.shoulder ?? 85,
                          elbow: parsed.elbow ?? 105,
                          wrist_pitch: parsed.wrist_pitch ?? 85,
                          wrist_roll: parsed.wrist_roll ?? 90,
                          gripper: parsed.gripper ?? 50,
                          aux: parsed.aux ?? 90
                        });
                      } catch {
                        setServoAngles({ base: 90, shoulder: 85, elbow: 105, wrist_pitch: 85, wrist_roll: 90, gripper: 50, aux: 90 });
                      }
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-teal-700 hover:bg-zinc-100 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 7-Joint Angles Grid */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">7-SERVO PRESETS</span>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">Base:</span>
                      <span className="font-bold">{servo.base ?? 90}°</span>
                    </div>
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">Shoulder:</span>
                      <span className="font-bold">{servo.shoulder ?? 85}°</span>
                    </div>
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">Elbow:</span>
                      <span className="font-bold">{servo.elbow ?? 105}°</span>
                    </div>
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">W-Pitch:</span>
                      <span className="font-bold">{servo.wrist_pitch ?? 85}°</span>
                    </div>
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">W-Roll:</span>
                      <span className="font-bold">{servo.wrist_roll ?? 90}°</span>
                    </div>
                    <div className="p-1 bg-zinc-50 border border-zinc-200 rounded flex justify-between">
                      <span className="text-zinc-500">Gripper:</span>
                      <span className="font-bold">{servo.gripper ?? 50}°</span>
                    </div>
                  </div>
                </div>

                {/* Test Move Button */}
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-zinc-400 block font-mono">PARCELS</span>
                    <span className="text-sm font-bold font-mono text-teal-800">{b.parcel_count}</span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingBinId === b.id || b.is_active === 0}
                    onClick={() => handleTestMoveBin(b)}
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

      {/* ──────────────────────────────────────────────────────────── */}
      {/* TAB 3: 7-JOINT PCA9685 CALIBRATION                           */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'calibration' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-600 flex items-center justify-between">
            <div>
              <span className="font-bold text-zinc-900 block">PCA9685 16-Channel I2C Calibration (Address: 0x40, Frequency: 50Hz)</span>
              <span>Adjust minimum and maximum microsecond pulse timings (500μs–2500μs) and test individual joint kinematics live.</span>
            </div>
            <span className="px-2.5 py-1 rounded bg-teal-100 text-teal-900 font-mono font-bold text-xs">
              7 Joints Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calibrations.map(calib => (
              <div key={calib.id} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-zinc-100 border text-zinc-700 font-mono font-bold text-xs flex items-center justify-center">
                        J{calib.joint_index}
                      </span>
                      <h4 className="font-bold text-zinc-900 text-sm">{calib.joint_name}</h4>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      PCA CH{calib.pca_channel} | {calib.servo_model}
                    </span>
                  </div>
                </div>

                {/* Angle Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-zinc-500">Angle Setting:</span>
                    <span className="font-bold text-teal-800">{calib.default_angle}°</span>
                  </div>
                  <input
                    type="range"
                    min={calib.min_angle}
                    max={calib.max_angle}
                    value={calib.default_angle}
                    onChange={e => handleUpdateCalibration(calib.joint_index, { default_angle: Number(e.target.value) })}
                    className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-teal-700"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{calib.min_angle}°</span>
                    <span>{calib.max_angle}°</span>
                  </div>
                </div>

                {/* Pulse Widths */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 block">MIN PULSE</span>
                    <span className="font-bold text-zinc-800">{calib.min_pulse_us} μs</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] text-zinc-400 block">MAX PULSE</span>
                    <span className="font-bold text-zinc-800">{calib.max_pulse_us} μs</span>
                  </div>
                </div>

                {/* Test Joint Button */}
                <div className="pt-2 border-t border-zinc-100 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingJointIndex === calib.joint_index}
                    onClick={() => handleTestJoint(calib.joint_index, calib.default_angle)}
                    icon={<Play className="w-3.5 h-3.5 text-teal-600 fill-current" />}
                  >
                    {testingJointIndex === calib.joint_index ? 'Actuating...' : `Test ${calib.default_angle}°`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: VIEW & PRINT QR DEMONSTRATION CARDS                   */}
      {/* ──────────────────────────────────────────────────────────── */}
      {selectedProfileForQr && (
        <Modal
          isOpen={!!selectedProfileForQr}
          onClose={() => setSelectedProfileForQr(null)}
          title={`Route QR Card — ${selectedProfileForQr.code}`}
          subtitle={selectedProfileForQr.name}
          maxWidth="sm"
        >
          <div className="space-y-4 text-center">
            <div className="p-6 bg-white border-2 border-dashed border-zinc-300 rounded-2xl flex flex-col items-center justify-center">
              <QRCodeSVG
                value={selectedProfileForQr.qr_code_payload}
                size={180}
                level="M"
                includeMargin={true}
              />
              <div className="mt-3">
                <span className="text-sm font-mono font-bold text-zinc-900 block">
                  {selectedProfileForQr.code} — {selectedProfileForQr.city}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono block">
                  Target: {selectedProfileForQr.target_bin_label || selectedProfileForQr.target_bin_id}
                </span>
              </div>
            </div>

            <div className="text-left bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-xs font-mono space-y-1">
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">CRYPTOGRAPHIC PAYLOAD</span>
              <span className="text-zinc-800 break-all select-all font-bold block">
                {selectedProfileForQr.qr_code_payload}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.print();
                }}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Print Demonstration Card
              </Button>

              <Button
                variant="teal"
                size="sm"
                onClick={() => setSelectedProfileForQr(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT ROUTE PROFILE                                    */}
      {/* ──────────────────────────────────────────────────────────── */}
      {editProfile && (
        <Modal
          isOpen={!!editProfile}
          onClose={() => setEditProfile(null)}
          title={`Edit Route Profile: ${editProfile.code}`}
          subtitle="Configure destination city and target physical bin"
          maxWidth="md"
        >
          <form onSubmit={handleSaveRouteProfile} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Route Name</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                required
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg font-bold text-zinc-900"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Destination City</label>
              <input
                type="text"
                value={profileCity}
                onChange={e => setProfileCity(e.target.value)}
                required
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-900"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Target Physical Bin</label>
              <select
                value={profileTargetBinId}
                onChange={e => setProfileTargetBinId(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-900"
              >
                {bins.map(b => (
                  <option key={b.id} value={b.id}>
                    Bin {b.bin_number} ({b.label})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Operational Notes</label>
              <textarea
                value={profileNotes}
                onChange={e => setProfileNotes(e.target.value)}
                rows={2}
                className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-zinc-900"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="profileActiveCheck"
                checked={profileIsActive}
                onChange={e => setProfileIsActive(e.target.checked)}
                className="rounded border-zinc-300 text-teal-600 cursor-pointer"
              />
              <label htmlFor="profileActiveCheck" className="text-zinc-700 font-medium cursor-pointer">
                Route profile is active and eligible for automated bin assignment
              </label>
            </div>

            <div className="pt-4 border-t border-zinc-100 flex justify-end gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => setEditProfile(null)}>
                Cancel
              </Button>
              <Button variant="teal" size="sm" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT BIN 7-SERVO PRESETS                              */}
      {/* ──────────────────────────────────────────────────────────── */}
      {selectedBin && (
        <Modal
          isOpen={!!selectedBin}
          onClose={() => setSelectedBin(null)}
          title={`Edit ${selectedBin.label}`}
          subtitle="Configure 7-joint servo target angles for pick-and-place actuation"
          maxWidth="md"
        >
          <form onSubmit={handleSaveBin} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Bin Label</label>
              <input
                type="text"
                value={binLabel}
                onChange={e => setBinLabel(e.target.value)}
                required
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg font-bold text-zinc-900 font-mono"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="font-semibold text-zinc-700 block">7-Joint Servo Angles (0° – 180°)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Base (CH0)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.base}
                    onChange={e => setServoAngles({ ...servoAngles, base: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Shoulder (CH1)</span>
                  <input
                    type="number"
                    min={15}
                    max={165}
                    value={servoAngles.shoulder}
                    onChange={e => setServoAngles({ ...servoAngles, shoulder: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Elbow (CH2)</span>
                  <input
                    type="number"
                    min={15}
                    max={165}
                    value={servoAngles.elbow}
                    onChange={e => setServoAngles({ ...servoAngles, elbow: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Wrist Pitch (CH3)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.wrist_pitch}
                    onChange={e => setServoAngles({ ...servoAngles, wrist_pitch: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Wrist Roll (CH4)</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={servoAngles.wrist_roll}
                    onChange={e => setServoAngles({ ...servoAngles, wrist_roll: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block mb-0.5">Gripper (CH5)</span>
                  <input
                    type="number"
                    min={30}
                    max={125}
                    value={servoAngles.gripper}
                    onChange={e => setServoAngles({ ...servoAngles, gripper: Number(e.target.value) })}
                    className="w-full h-8 px-2 bg-zinc-50 border border-zinc-300 rounded font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="binActiveCheck"
                checked={binIsActive}
                onChange={e => setBinIsActive(e.target.checked)}
                className="rounded border-zinc-300 text-teal-600 cursor-pointer"
              />
              <label htmlFor="binActiveCheck" className="text-zinc-700 font-medium cursor-pointer">
                Bin is actively accepting parcels from sorting pipeline
              </label>
            </div>

            <div className="pt-4 border-t border-zinc-100 flex justify-end gap-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => setSelectedBin(null)}>
                Cancel
              </Button>
              <Button variant="teal" size="sm" type="submit">
                Save Presets
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

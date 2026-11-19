import React, { useState, useEffect } from 'react';
import { Address } from '../../../types';
import { useAuth } from '../../../shared/store/authContext';
import { apiFetch } from '../../../shared/lib/api';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { useToast } from '../../../shared/store/toastContext';
import { User, MapPin, Plus, Trash2, CheckCircle2, Shield, Phone, Mail, LogOut } from 'lucide-react';

export const CustomerProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add Address Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [label, setLabel] = useState('Home');
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '+91 98765 43210');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('Pune');
  const [state, setState] = useState('Maharashtra');
  const [pincode, setPincode] = useState('411001');

  const fetchAddresses = () => {
    setIsLoading(true);
    apiFetch<Address[]>('/auth/addresses')
      .then(setAddresses)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label,
          fullName,
          phone,
          line1,
          city,
          state,
          pincode,
          isDefault: addresses.length === 0 ? 1 : 0
        })
      });
      showToast('Address added successfully', 'success');
      setIsAddOpen(false);
      setLine1('');
      fetchAddresses();
    } catch (err: any) {
      showToast(err.message || 'Failed to add address', 'error');
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await apiFetch(`/auth/addresses/${id}`, { method: 'DELETE' });
      showToast('Address deleted', 'info');
      fetchAddresses();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      <div className="pb-4 border-b border-zinc-200/80">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Customer Profile</h1>
        <p className="text-xs text-zinc-500 mt-1">Manage your identity, authentication credentials, and saved shipping hubs.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* User Card */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-6 h-fit">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-2xl font-bold border-2 border-orange-200">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">{user?.name}</h3>
              <p className="text-xs text-zinc-500 capitalize">{user?.role} Account</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-100 text-xs">
            <div className="flex items-center gap-2.5 text-zinc-600">
              <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="truncate">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-zinc-600">
              <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="font-mono">{user?.phone || '+91 98765 43210'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-zinc-600">
              <Shield className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Role-Based Access: {user?.role}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <button
              id="customer-profile-logout-btn"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out of Account</span>
            </button>
          </div>
        </div>

        {/* Addresses Management */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-zinc-200/80 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Saved Addresses</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Used for shipping labels and automatic conveyor bin routing.</p>
              </div>
              <Button
                variant="orange"
                size="sm"
                onClick={() => setIsAddOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Address
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              {addresses.map(addr => (
                <div
                  key={addr.id}
                  className="p-4 rounded-xl border border-zinc-200 bg-white flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-900">{addr.full_name}</span>
                      <span className="bg-zinc-100 text-zinc-700 px-1.5 py-0.2 rounded font-bold uppercase text-[10px]">
                        {addr.label}
                      </span>
                      {addr.is_default === 1 && (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-600">{addr.line1}</p>
                    <p className="text-zinc-700 font-medium">
                      {addr.city}, {addr.state} - <span className="font-mono">{addr.pincode}</span>
                    </p>
                    <p className="text-zinc-500 font-mono">Phone: {addr.phone}</p>
                  </div>

                  <button
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                    title="Delete address"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Address Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Delivery Address"
        subtitle="Used for parcel dispatch and routing"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="orange" size="sm" onClick={handleSaveAddress}>
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveAddress} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-600 font-medium">Tag</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              />
            </div>
            <div>
              <label className="text-zinc-600 font-medium">Recipient Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              />
            </div>
          </div>

          <div>
            <label className="text-zinc-600 font-medium">Phone</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
            />
          </div>

          <div>
            <label className="text-zinc-600 font-medium">Address</label>
            <input
              type="text"
              required
              value={line1}
              onChange={e => setLine1(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-zinc-300 rounded-lg text-zinc-800"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-zinc-600 font-medium">City</label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              >
                <option value="Pune">Pune</option>
                <option value="Delhi">Delhi</option>
                <option value="Mumbai">Mumbai</option>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Hyderabad">Hyderabad</option>
              </select>
            </div>
            <div>
              <label className="text-zinc-600 font-medium">State</label>
              <input
                type="text"
                required
                value={state}
                onChange={e => setState(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-zinc-300 rounded-lg text-zinc-800"
              />
            </div>
            <div>
              <label className="text-zinc-600 font-medium">Pincode</label>
              <input
                type="text"
                required
                value={pincode}
                onChange={e => setPincode(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-zinc-300 rounded-lg text-zinc-800 font-mono"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

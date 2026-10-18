import React, { useState, useEffect } from 'react';
import { MachineState, WarehouseQueue } from '../../types';
import { apiFetch } from '../../shared/lib/api';
import { getSocket } from '../../shared/lib/socket';
import { useToast } from '../../shared/store/toastContext';
import { OperatorHeader } from './components/OperatorHeader';
import { OperatorSidebar } from './components/OperatorSidebar';
import { OperatorDashboard } from './pages/OperatorDashboard';
import { OperatorOrdersQueue } from './pages/OperatorOrdersQueue';
import { OperatorPicking } from './pages/OperatorPicking';
import { OperatorPacking } from './pages/OperatorPacking';
import { OperatorLabels } from './pages/OperatorLabels';
import { OperatorConveyor } from './pages/OperatorConveyor';
import { OperatorInventory } from './pages/OperatorInventory';
import { OperatorAlerts } from './pages/OperatorAlerts';
import { OperatorLogs } from './pages/OperatorLogs';

export const OperatorPortal: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');

  const [machineState, setMachineState] = useState<MachineState>({
    conveyor: 'RUNNING',
    sensor: 'CLEAR',
    robot: 'IDLE',
    esp32: 'ONLINE',
    wifi: 'CONNECTED',
    motorRpm: 120,
    cameraFps: 30,
    activeOrderId: null,
    activeOrderCity: null,
    activeOrderBin: null
  });

  const [queue, setQueue] = useState<WarehouseQueue>({
    newOrders: [],
    picking: [],
    packing: [],
    ready: [],
    conveyor: [],
    dispatched: []
  });

  const [alertCount, setAlertCount] = useState<number>(0);

  const fetchMachineState = () => {
    apiFetch<MachineState>('/warehouse/conveyor/state')
      .then(setMachineState)
      .catch(console.error);
  };

  const fetchQueue = () => {
    apiFetch<WarehouseQueue>('/warehouse/queue')
      .then(setQueue)
      .catch(console.error);
  };

  const fetchAlerts = () => {
    apiFetch<any[]>('/warehouse/alerts')
      .then(data => setAlertCount(data.length))
      .catch(console.error);
  };

  useEffect(() => {
    fetchMachineState();
    fetchQueue();
    fetchAlerts();

    const socket = getSocket();

    const handleMachineStatus = (state: MachineState) => {
      setMachineState(state);
    };

    const handleQueueChange = () => {
      fetchQueue();
      fetchAlerts();
    };

    socket.on('machine:status', handleMachineStatus);
    socket.on('order:status:changed', handleQueueChange);
    socket.on('alert:created', (alert: any) => {
      showToast(`ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, alert.severity === 'critical' ? 'error' : 'warning');
      fetchAlerts();
    });

    return () => {
      socket.off('machine:status', handleMachineStatus);
      socket.off('order:status:changed', handleQueueChange);
    };
  }, []);

  const handleSendToConveyor = async (orderId: string) => {
    try {
      await apiFetch('/warehouse/conveyor/infeed', {
        method: 'POST',
        body: JSON.stringify({ orderId })
      });
      showToast(`Order ${orderId} infeed to conveyor initiated!`, 'success');
      fetchQueue();
      setActiveTab('conveyor');
    } catch (err: any) {
      showToast(err.message || 'Failed to infeed parcel', 'error');
    }
  };

  const handleOrderAction = async (action: string, orderId: string) => {
    try {
      if (action === 'start-picking') {
        await apiFetch(`/warehouse/orders/${orderId}/start-picking`, { method: 'POST' });
        showToast(`Started picking ${orderId}`, 'info');
      } else if (action === 'picked') {
        await apiFetch(`/warehouse/orders/${orderId}/picked`, { method: 'POST' });
        showToast(`Order ${orderId} picked and moved to Packing Bay`, 'success');
      } else if (action === 'dispatch') {
        await apiFetch(`/warehouse/orders/${orderId}/dispatch`, { method: 'POST' });
        showToast(`Order ${orderId} marked as Dispatched!`, 'success');
      } else if (action === 'deliver') {
        await apiFetch(`/warehouse/orders/${orderId}/deliver`, { method: 'POST' });
        showToast(`Order ${orderId} marked as Delivered!`, 'success');
      }
      fetchQueue();
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    }
  };

  const badgeCounts = {
    queue:
      queue.newOrders.length +
      queue.picking.length +
      queue.packing.length +
      queue.ready.length +
      queue.conveyor.length,
    picking: queue.picking.length,
    packing: queue.packing.length,
    alerts: alertCount
  };

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      <OperatorHeader machineState={machineState} onRefresh={fetchQueue} />

      <div className="flex-1 flex flex-col md:flex-row">
        <OperatorSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          badgeCounts={badgeCounts}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full">
          {activeTab === 'dashboard' && (
            <OperatorDashboard
              queue={queue}
              machineState={machineState}
              onNavigate={setActiveTab}
              onSendToConveyor={handleSendToConveyor}
            />
          )}

          {activeTab === 'queue' && (
            <OperatorOrdersQueue
              queue={queue}
              onAction={handleOrderAction}
              onNavigateToPicking={(id) => {
                setSelectedOrderId(id);
                setActiveTab('picking');
              }}
              onNavigateToPacking={(id) => {
                setSelectedOrderId(id);
                setActiveTab('packing');
              }}
              onSendToConveyor={handleSendToConveyor}
            />
          )}

          {activeTab === 'picking' && (
            <OperatorPicking
              selectedOrderId={selectedOrderId}
              onPickingCompleted={() => {
                fetchQueue();
                setActiveTab('packing');
              }}
            />
          )}

          {activeTab === 'packing' && (
            <OperatorPacking
              selectedOrderId={selectedOrderId}
              onPackingCompleted={() => {
                fetchQueue();
                setActiveTab('conveyor');
              }}
            />
          )}

          {activeTab === 'labels' && (
            <OperatorLabels />
          )}

          {activeTab === 'conveyor' && (
            <OperatorConveyor
              machineState={machineState}
              onMachineStateChange={setMachineState}
            />
          )}

          {activeTab === 'inventory' && <OperatorInventory />}
          {activeTab === 'alerts' && <OperatorAlerts />}
          {activeTab === 'logs' && <OperatorLogs />}
        </main>
      </div>
    </div>
  );
};

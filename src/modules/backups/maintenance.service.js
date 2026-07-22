let maintenanceReason = '';

export function enterMaintenance(reason = 'maintenance') {
  if (maintenanceReason) return false;
  maintenanceReason = reason;
  return true;
}

export function leaveMaintenance(reason = '') {
  if (!reason || maintenanceReason === reason) maintenanceReason = '';
}

export function getMaintenanceReason() {
  return maintenanceReason;
}

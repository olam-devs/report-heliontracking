import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";

const PAGE_KEYS = ["daily_report", "fuel_alerts", "notifications", "calibration", "danger_zones"];

export function useTrackingAccess() {
  const { user } = useAuth();
  return useMemo(() => {
    const pages = user?.trackingAccess || {};
    const isAdmin = user?.role === "admin";
    const canTrack = isAdmin || user?.can_view_tracking;
    const canView = (page) => canTrack && (isAdmin || pages[page] === "view" || pages[page] === "edit");
    const canEdit = (page) => canTrack && (isAdmin || pages[page] === "edit");
    const firstAllowedPath = () => {
      if (canView("daily_report")) return "/tracking";
      if (canView("fuel_alerts")) return "/tracking/fuel-alerts";
      if (canView("notifications")) return "/tracking/notifications";
      if (canView("calibration")) return "/tracking/calibration";
      if (canView("danger_zones")) return "/tracking/danger-zones";
      return "/drivers";
    };
    return { pages, canTrack, isAdmin, canView, canEdit, firstAllowedPath, PAGE_KEYS };
  }, [user]);
}

export default useTrackingAccess;

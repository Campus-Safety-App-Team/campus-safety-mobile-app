import {
  createEmergencyAlertInDb,
  createNotificationInDb,
  deleteNotificationFromDb,
  fetchEmergencyAlertsFromDb,
  fetchNotificationsFromDb,
  updateNotificationInDb
} from '@/services/database';
import { EmergencyAlert, Notification, NotificationStatus, NotificationType } from '@/types';
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';

interface CreateNotificationData {
  type: NotificationType;
  title: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  photoUrl?: string;
}

export const [NotificationsProvider, useNotifications] = createContextHook(() => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [notificationsData, emergencyAlertsData] = await Promise.all([
        fetchNotificationsFromDb(),
        fetchEmergencyAlertsFromDb(),
      ]);
      setNotifications(notificationsData);
      setEmergencyAlerts(emergencyAlertsData);
    } catch (error) {
      console.error("Failed to fetch notifications or alerts", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const createNotification = useCallback(async (data: CreateNotificationData): Promise<Notification> => {
    if (!user) throw new Error('User not authenticated');

    const timestamp = new Date().toISOString();
    const newNotificationData: Omit<Notification, 'id'> = {
      ...data,
      status: 'open',
      createdBy: user.id,
      createdByName: user.fullName,
      createdAt: timestamp,
      updatedAt: timestamp,
      followedBy: [user.id],
    };

    const id = await createNotificationInDb(newNotificationData);
    const newNotification: Notification = { id, ...newNotificationData };

    setNotifications(prev => [newNotification, ...prev]);
    return newNotification;
  }, [user]);

  const updateNotificationStatus = useCallback(async (id: string, status: NotificationStatus) => {
    try {
      await updateNotificationInDb(id, { status, updatedAt: new Date().toISOString() });
      setNotifications(prev =>
        prev.map(n =>
          n.id === id
            ? { ...n, status, updatedAt: new Date().toISOString() }
            : n
        )
      );
    } catch (error) {
      console.error("Failed to update status", error);
      throw error;
    }
  }, []);

  const updateNotification = useCallback(async (id: string, updates: Partial<Notification>) => {
    try {
      const timestamp = new Date().toISOString();
      await updateNotificationInDb(id, { ...updates, updatedAt: timestamp });
      setNotifications(prev =>
        prev.map(n =>
          n.id === id
            ? { ...n, ...updates, updatedAt: timestamp }
            : n
        )
      );
    } catch (error) {
      console.error("Failed to update notification", error);
      throw error;
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await deleteNotificationFromDb(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error("Failed to delete notification", error);
      throw error;
    }
  }, []);

  const toggleFollow = useCallback(async (notificationId: string) => {
    if (!user) return;

    // Optimistic update
    let isFollowing = false;
    setNotifications(prev =>
      prev.map(n => {
        if (n.id !== notificationId) return n;
        isFollowing = n.followedBy.includes(user.id);
        return {
          ...n,
          followedBy: isFollowing
            ? n.followedBy.filter(id => id !== user.id)
            : [...n.followedBy, user.id],
        };
      })
    );

    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) return; // Should not happen given local state

      const currentFollowers = notification.followedBy;
      const newFollowers = isFollowing
        ? currentFollowers.filter(id => id !== user.id)
        : [...currentFollowers, user.id];

      await updateNotificationInDb(notificationId, { followedBy: newFollowers });
    } catch (error) {
      console.error("Failed to toggle follow", error);
      // Revert on error could be implemented here
      refreshNotifications();
    }
  }, [user, notifications, refreshNotifications]);

  const createEmergencyAlert = useCallback(async (title: string, message: string) => {
    if (!user || user.role !== 'admin') {
      throw new Error('Only admins can create emergency alerts');
    }

    const timestamp = new Date().toISOString();
    const alertData: Omit<EmergencyAlert, 'id'> = {
      title,
      message,
      createdAt: timestamp,
      createdBy: user.id,
    };

    try {
      const id = await createEmergencyAlertInDb(alertData);
      const newAlert: EmergencyAlert = { id, ...alertData };
      setEmergencyAlerts(prev => [newAlert, ...prev]);
      return newAlert;
    } catch (error) {
      console.error("Failed to create emergency alert", error);
      throw error;
    }
  }, [user]);

  const getNotificationById = useCallback((id: string) => {
    return notifications.find(n => n.id === id);
  }, [notifications]);

  const getFollowedNotifications = useCallback(() => {
    if (!user) return [];
    return notifications.filter(n => n.followedBy.includes(user.id));
  }, [notifications, user]);

  return {
    notifications,
    emergencyAlerts,
    loading,
    refreshNotifications,
    createNotification,
    updateNotificationStatus,
    updateNotification,
    deleteNotification,
    toggleFollow,
    createEmergencyAlert,
    getNotificationById,
    getFollowedNotifications,
  };
});

import { auth } from '@/config/firebaseConfig';
import { createUserProfile, getUserProfile } from '@/services/database';
import { NotificationPreferences, User } from '@/types';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  preferences: NotificationPreferences;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    preferences: {
      pushEnabled: true,
      emailEnabled: true,
      emergencyAlerts: true,
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          // Fetch additional user details from Firestore
          const userProfile = await getUserProfile(firebaseUser.uid);

          if (userProfile) {
            setState(prev => ({
              ...prev,
              user: userProfile,
              isAuthenticated: true,
              isLoading: false,
            }));
          } else {
            // Fallback if profile doesn't exist (shouldn't happen with our register flow)
            console.warn("User profile not found for", firebaseUser.uid);
            setState(prev => ({ ...prev, user: null, isAuthenticated: false, isLoading: false }));
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setState(prev => ({ ...prev, user: null, isAuthenticated: false, isLoading: false }));
        }
      } else {
        setState(prev => ({ ...prev, user: null, isAuthenticated: false, isLoading: false }));
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // State updates automatically via onAuthStateChanged
      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'An error occurred during login';
      if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not found';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid password';
      }
      return { success: false, error: errorMessage };
    }
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    department: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      const newUser: User = {
        id: firebaseUser.uid,
        email,
        fullName,
        department,
        role: 'user', // Default role
        createdAt: new Date().toISOString(),
      };

      // Create profile in Firestore
      await createUserProfile(newUser);

      // State will update via onAuthStateChanged listener, but we might want to manually set it 
      // locally if the listener is slower than the nav transition.
      // For now, relying on the listener is safer to ensure data consistency.

      return { success: true };
    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMessage = 'An error occurred during registration';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Email already registered';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      }
      return { success: false, error: errorMessage };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      // State updates automatically via onAuthStateChanged
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const updatePreferences = useCallback(async (newPreferences: NotificationPreferences) => {
    try {
      await AsyncStorage.setItem('preferences', JSON.stringify(newPreferences));
      setState(prev => ({
        ...prev,
        preferences: newPreferences,
      }));
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      // Implementation for updating profile in Firestore could go here
      // For now, implementing local update if needed, but ideally should sync with DB
      console.warn("Update profile not fully implemented with Firestore sync yet");
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  }, []);

  return {
    ...state,
    login,
    register,
    logout,
    updatePreferences,
    updateProfile,
  };
});

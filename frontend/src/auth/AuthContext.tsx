import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, authApi, type Student } from "./api";
import { cacheStudentProfile, clearCachedStudentProfile, getCachedStudentProfile } from "../ai/chatStorage";

type AuthContextValue = {
  student: Student | null;
  loading: boolean;
  error: string | null;
  register: (details: { name: string; email: string; password: string }) => Promise<void>;
  login: (details: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateStudent: (student: Student) => void;
  refreshStudent: () => Promise<Student>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStudent = useCallback(async () => {
    const result = await authApi.currentStudent();
    await cacheStudentProfile(result.student);
    setStudent(result.student);
    setError(null);
    return result.student;
  }, []);

  useEffect(() => {
    let active = true;
    authApi.currentStudent()
      .then(async ({ student: currentStudent }) => {
        await cacheStudentProfile(currentStudent);
        if (active) {
          setStudent(currentStudent);
          setError(null);
        }
      })
      .catch(async (requestError: unknown) => {
        if (!(requestError instanceof ApiError && requestError.status === 0)) {
          if (requestError instanceof ApiError && requestError.status === 401) {
            try {
              const cachedStudent = await getCachedStudentProfile();
              if (cachedStudent) await clearCachedStudentProfile(cachedStudent.id);
            } catch (storageError) {
              if (active) setError(storageError instanceof Error ? storageError.message : "The saved account profile could not be cleared.");
            }
          }
          if (active && !(requestError instanceof ApiError && requestError.status === 401)) {
            setError(requestError instanceof Error ? requestError.message : "Could not check your sign-in.");
          }
          return;
        }

        try {
          const cachedStudent = await getCachedStudentProfile();
          if (active && cachedStudent) {
            setStudent({ ...cachedStudent, offline: true });
            setError(null);
          } else if (active) {
            setError("EduSphere could not verify your account while offline. Connect to the server once, then try offline access again.");
          }
        } catch (storageError) {
          if (active) {
            setError(storageError instanceof Error ? storageError.message : "Your offline account profile could not be opened.");
          }
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!student?.offline) return;
    const handleOnline = () => {
      void refreshStudent().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "The central account session could not be verified.");
      });
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refreshStudent, student?.offline]);

  const register = useCallback(async (details: { name: string; email: string; password: string }) => {
    const result = await authApi.register(details);
    await cacheStudentProfile(result.student);
    setStudent(result.student);
    setError(null);
  }, []);

  const login = useCallback(async (details: { email: string; password: string }) => {
    const result = await authApi.login(details);
    await cacheStudentProfile(result.student);
    setStudent(result.student);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    if (student?.offline) {
      throw new ApiError("You are offline. Your server session cannot be revoked until the EduSphere server is reachable.", 0);
    }
    await authApi.logout();
    if (student) await clearCachedStudentProfile(student.id);
    setStudent(null);
  }, [student]);

  const updateStudent = useCallback(async (updatedStudent: Student) => {
    await cacheStudentProfile(updatedStudent);
    setStudent(updatedStudent);
  }, []);

  const value = useMemo(
    () => ({ student, loading, error, register, login, logout, updateStudent, refreshStudent }),
    [student, loading, error, register, login, logout, updateStudent, refreshStudent],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useStudentAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useStudentAuth must be used inside AuthProvider.");
  }
  return context;
}

export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ThemePreference = "system" | "light" | "dark";
export type BlurMode = "acrylic" | "blur";

export interface AppSettings {
  opacity: number;
  blurMode: BlurMode;
  theme: ThemePreference;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  targetMonitorId: string | null;
  lockPasswordHash: string | null;
  edgeAutoHide: boolean;
}

export interface AppStateData {
  todos: TodoItem[];
  settings: AppSettings;
}

export interface MonitorDescriptor {
  id: string;
  name: string;
  isPrimary: boolean;
  workLeft: number;
  workTop: number;
  workRight: number;
  workBottom: number;
  scaleFactor: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  opacity: 15,
  blurMode: "acrylic",
  theme: "light",
  alwaysOnTop: false,
  launchAtStartup: false,
  targetMonitorId: null,
  lockPasswordHash: null,
  edgeAutoHide: true,
};

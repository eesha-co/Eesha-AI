import { create } from 'zustand';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  language?: string;
  isBinary?: boolean;
}

export interface OpenFile {
  path: string;
  content: string;
  modified: boolean;
}

interface WorkspaceState {
  currentPath: string;
  files: FileEntry[];
  openFiles: OpenFile[];
  activeFilePath: string | null;
  isLoading: boolean;

  setCurrentPath: (path: string) => void;
  setFiles: (files: FileEntry[]) => void;
  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;
  setIsLoading: (loading: boolean) => void;
  refreshFiles: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentPath: '',
  files: [],
  openFiles: [],
  activeFilePath: null,
  isLoading: false,

  setCurrentPath: (path) => set({ currentPath: path }),
  setFiles: (files) => set({ files }),

  openFile: (path, content) => {
    const { openFiles } = get();
    if (!openFiles.find((f) => f.path === path)) {
      set({ openFiles: [...openFiles, { path, content, modified: false }] });
    }
    set({ activeFilePath: path });
  },

  closeFile: (path) => {
    const { openFiles, activeFilePath } = get();
    const remaining = openFiles.filter((f) => f.path !== path);
    const newActive =
      activeFilePath === path
        ? remaining[remaining.length - 1]?.path || null
        : activeFilePath;
    set({ openFiles: remaining, activeFilePath: newActive });
  },

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, modified: true } : f
      ),
    }));
  },

  markFileSaved: (path) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, modified: false } : f
      ),
    }));
  },

  setIsLoading: (loading) => set({ isLoading: loading }),

  refreshFiles: async () => {
    const { currentPath } = get();
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/workspace?path=${encodeURIComponent(currentPath)}`);
      if (res.ok) {
        const data = await res.json();
        set({ files: data.files || [] });
      }
    } catch {
      // silently fail
    }
    set({ isLoading: false });
  },
}));

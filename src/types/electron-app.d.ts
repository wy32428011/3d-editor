export {};

declare global {
  interface DesktopSceneRecord {
    id: string;
    name: string;
    file: string;
    createdAt: string;
    updatedAt: string;
  }

  interface DesktopProjectRecord {
    version: 1;
    id: string;
    name: string;
    path: string;
    createdAt: string;
    updatedAt: string;
    activeSceneId: string;
    scenes: DesktopSceneRecord[];
  }

  interface RecentProjectRecord {
    id: string;
    name: string;
    path: string;
    lastOpenedAt: string;
    exists?: boolean;
  }

  interface DesktopScenePayload {
    project: DesktopProjectRecord;
    scene: DesktopSceneRecord;
    babylonScene: unknown | null;
  }

  interface Window {
    electronApp?: {
      isElectron: boolean;
      platform: NodeJS.Platform;
      versions: {
        chrome?: string;
        electron?: string;
        node?: string;
      };
      projects: {
        listRecent: () => Promise<RecentProjectRecord[]>;
        create: (name: string) => Promise<DesktopProjectRecord | null>;
        open: () => Promise<DesktopProjectRecord | null>;
        openRecent: (projectPath: string) => Promise<DesktopProjectRecord | null>;
        loadScene: (projectPath: string, sceneId: string) => Promise<DesktopScenePayload>;
        createScene: (projectPath: string, name: string) => Promise<DesktopProjectRecord>;
        saveScene: (projectPath: string, sceneId: string, babylonScene: unknown) => Promise<DesktopProjectRecord>;
      };
    };
  }
}

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

  interface DesktopProjectAssetPayload {
    data: ArrayBuffer;
    lastModified: number;
  }

  interface DesktopModelPackageProjectFile {
    relativePath: string;
    projectFile: string;
    role: "primaryModel" | "modelDependency" | "script" | "meta" | "texture" | "other";
    size: number;
    lastModified?: number;
  }

  interface DesktopModelPackageImportResult {
    packageId: string;
    displayName: string;
    rootDirectoryName: string;
    primaryModelFile: string;
    scriptFile?: string;
    metaFile?: string;
    projectFiles: DesktopModelPackageProjectFile[];
    textFiles: Record<string, string>;
    warnings: string[];
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
        renameScene: (projectPath: string, sceneId: string, name: string) => Promise<DesktopProjectRecord>;
        saveScene: (projectPath: string, sceneId: string, babylonScene: unknown) => Promise<DesktopProjectRecord>;
        saveAssetFile: (projectPath: string, assetId: string, fileName: string, data: ArrayBuffer) => Promise<string>;
        loadAssetFile: (projectPath: string, projectFile: string) => Promise<DesktopProjectAssetPayload>;
        importModelPackage?: (projectPath: string) => Promise<DesktopModelPackageImportResult | null>;
      };
    };
  }
}

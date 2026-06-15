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

  interface DesktopProjectAssetBatchRequest {
    projectFile: string;
    expectedByteLength?: number;
  }

  interface DesktopProjectAssetBatchResult {
    projectFile: string;
    data?: ArrayBuffer;
    lastModified?: number;
    error?: string;
  }

  interface DesktopLocalReferencePayload {
    data: ArrayBuffer;
    fileName: string;
    lastModified: number;
    mimeType: string;
  }

  interface DesktopModelPackageProjectFile {
    relativePath: string;
    projectFile: string;
    stagingProjectFile?: string;
    role: "primaryModel" | "modelDependency" | "script" | "meta" | "texture" | "other";
    size: number;
    lastModified?: number;
  }

  interface DesktopKnownModelPackage {
    assetId: string;
    packageId: string;
    sourceRoot?: string;
    rootDirectoryName: string;
  }

  interface DesktopModelPackageImportRequest {
    knownPackages: DesktopKnownModelPackage[];
  }

  interface DesktopModelPackageReplacementResult {
    assetId: string;
    packageId: string;
    matchRule: "sourceRoot" | "rootDirectoryName";
    pendingToken?: string;
  }

  interface DesktopModelPackageReplacementCommitRequest {
    packageId: string;
    pendingToken: string;
  }

  interface DesktopModelPackageImportResult {
    packageId: string;
    displayName: string;
    rootDirectoryName: string;
    sourceRoot: string;
    primaryModelFile: string;
    scriptFile?: string;
    metaFile?: string;
    projectFiles: DesktopModelPackageProjectFile[];
    textFiles: Record<string, string>;
    warnings: string[];
    replacement?: DesktopModelPackageReplacementResult;
  }

  interface DesktopModelPackageRefreshRequest {
    packageId: string;
    sourceRoot?: string;
  }

  interface DesktopModelPackageRefreshResult {
    packageId: string;
    rootDirectoryName: string;
    sourceRoot: string;
    metaFile?: string;
    projectFiles: DesktopModelPackageProjectFile[];
    textFiles: Record<string, string>;
    warnings: string[];
  }

  interface DesktopPublishResult {
    distPath: string;
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
        saveAssetFileFromPath?: (projectPath: string, assetId: string, sourcePath: string, fileName: string) => Promise<string>;
        loadAssetFile: (projectPath: string, projectFile: string) => Promise<DesktopProjectAssetPayload>;
        loadAssetFiles?: (
          projectPath: string,
          requests: DesktopProjectAssetBatchRequest[]
        ) => Promise<DesktopProjectAssetBatchResult[]>;
        importModelPackage?: (
          projectPath: string,
          request: DesktopModelPackageImportRequest
        ) => Promise<DesktopModelPackageImportResult | null>;
        activateModelPackageReplacement?: (
          projectPath: string,
          request: DesktopModelPackageReplacementCommitRequest
        ) => Promise<void>;
        finalizeModelPackageReplacement?: (
          projectPath: string,
          request: DesktopModelPackageReplacementCommitRequest
        ) => Promise<void>;
        rollbackModelPackageReplacement?: (
          projectPath: string,
          request: DesktopModelPackageReplacementCommitRequest
        ) => Promise<void>;
        refreshModelPackage?: (
          projectPath: string,
          request: DesktopModelPackageRefreshRequest
        ) => Promise<DesktopModelPackageRefreshResult | null>;
      };
      publish?: {
        buildAndOpenDist: () => Promise<DesktopPublishResult>;
      };
      files?: {
        getPath: (file: File) => string;
        readLocalReference: (baseFilePath: string, referencePath: string) => Promise<DesktopLocalReferencePayload | null>;
      };
    };
  }
}

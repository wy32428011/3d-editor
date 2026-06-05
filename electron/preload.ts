import { contextBridge, ipcRenderer, webUtils } from "electron";

interface DesktopProjectAssetBatchRequest {
  projectFile: string;
  expectedByteLength?: number;
}

/** 暴露极小桌面端能力面，避免渲染进程直接接触 Node.js。 */
contextBridge.exposeInMainWorld("electronApp", {
  isElectron: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  projects: {
    listRecent: () => ipcRenderer.invoke("projects:listRecent"),
    create: (name: string) => ipcRenderer.invoke("projects:create", name),
    open: () => ipcRenderer.invoke("projects:open"),
    openRecent: (projectPath: string) => ipcRenderer.invoke("projects:openRecent", projectPath),
    loadScene: (projectPath: string, sceneId: string) => ipcRenderer.invoke("projects:loadScene", projectPath, sceneId),
    createScene: (projectPath: string, name: string) => ipcRenderer.invoke("projects:createScene", projectPath, name),
    renameScene: (projectPath: string, sceneId: string, name: string) =>
      ipcRenderer.invoke("projects:renameScene", projectPath, sceneId, name),
    saveScene: (projectPath: string, sceneId: string, babylonScene: unknown) =>
      ipcRenderer.invoke("projects:saveScene", projectPath, sceneId, babylonScene),
    saveAssetFile: (projectPath: string, assetId: string, fileName: string, data: ArrayBuffer) =>
      ipcRenderer.invoke("projects:saveAssetFile", projectPath, assetId, fileName, data),
    saveAssetFileFromPath: (projectPath: string, assetId: string, sourcePath: string, fileName: string) =>
      ipcRenderer.invoke("projects:saveAssetFileFromPath", projectPath, assetId, sourcePath, fileName),
    loadAssetFile: (projectPath: string, projectFile: string) => ipcRenderer.invoke("projects:loadAssetFile", projectPath, projectFile),
    loadAssetFiles: (projectPath: string, requests: DesktopProjectAssetBatchRequest[]) =>
      ipcRenderer.invoke("projects:loadAssetFiles", projectPath, requests),
    importModelPackage: (projectPath: string) => ipcRenderer.invoke("projects:importModelPackage", projectPath)
  },
  files: {
    getPath: (file: File) => webUtils.getPathForFile(file),
    readLocalReference: (baseFilePath: string, referencePath: string) =>
      ipcRenderer.invoke("files:readLocalReference", baseFilePath, referencePath)
  }
});

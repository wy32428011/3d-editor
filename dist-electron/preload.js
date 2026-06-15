import { contextBridge, ipcRenderer, webUtils } from "electron";
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
        create: (name) => ipcRenderer.invoke("projects:create", name),
        open: () => ipcRenderer.invoke("projects:open"),
        openRecent: (projectPath) => ipcRenderer.invoke("projects:openRecent", projectPath),
        loadScene: (projectPath, sceneId) => ipcRenderer.invoke("projects:loadScene", projectPath, sceneId),
        createScene: (projectPath, name) => ipcRenderer.invoke("projects:createScene", projectPath, name),
        renameScene: (projectPath, sceneId, name) => ipcRenderer.invoke("projects:renameScene", projectPath, sceneId, name),
        saveScene: (projectPath, sceneId, babylonScene) => ipcRenderer.invoke("projects:saveScene", projectPath, sceneId, babylonScene),
        saveAssetFile: (projectPath, assetId, fileName, data) => ipcRenderer.invoke("projects:saveAssetFile", projectPath, assetId, fileName, data),
        saveAssetFileFromPath: (projectPath, assetId, sourcePath, fileName) => ipcRenderer.invoke("projects:saveAssetFileFromPath", projectPath, assetId, sourcePath, fileName),
        loadAssetFile: (projectPath, projectFile) => ipcRenderer.invoke("projects:loadAssetFile", projectPath, projectFile),
        loadAssetFiles: (projectPath, requests) => ipcRenderer.invoke("projects:loadAssetFiles", projectPath, requests),
        importModelPackage: (projectPath, request) => ipcRenderer.invoke("projects:importModelPackage", projectPath, request),
        activateModelPackageReplacement: (projectPath, request) => ipcRenderer.invoke("projects:activateModelPackageReplacement", projectPath, request),
        finalizeModelPackageReplacement: (projectPath, request) => ipcRenderer.invoke("projects:finalizeModelPackageReplacement", projectPath, request),
        rollbackModelPackageReplacement: (projectPath, request) => ipcRenderer.invoke("projects:rollbackModelPackageReplacement", projectPath, request),
        refreshModelPackage: (projectPath, request) => ipcRenderer.invoke("projects:refreshModelPackage", projectPath, request)
    },
    publish: {
        buildAndOpenDist: () => ipcRenderer.invoke("publish:buildAndOpenDist")
    },
    files: {
        getPath: (file) => webUtils.getPathForFile(file),
        readLocalReference: (baseFilePath, referencePath) => ipcRenderer.invoke("files:readLocalReference", baseFilePath, referencePath)
    }
});
//# sourceMappingURL=preload.js.map
import { contextBridge, ipcRenderer } from "electron";
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
        saveScene: (projectPath, sceneId, babylonScene) => ipcRenderer.invoke("projects:saveScene", projectPath, sceneId, babylonScene)
    }
});
//# sourceMappingURL=preload.js.map
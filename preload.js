const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveAs:           (text) =>            ipcRenderer.invoke('save-as', text),
    newNote:          ()    =>             ipcRenderer.invoke('new-note'),
    openFile:         ()    =>             ipcRenderer.invoke('open-file'),
    getNotes:         ()    =>             ipcRenderer.invoke('get-notes'),
    saveNoteJson:     (note) =>            ipcRenderer.invoke('save-note-json', note),
    deleteNote:       (id)  =>             ipcRenderer.invoke('delete-note', id),
    setUnsavedChanges:(unsaved) =>         ipcRenderer.invoke('set-unsaved-changes', unsaved),
    onMenuAction:     (channel, callback) => ipcRenderer.on(channel, callback),
    getSettings:      ()   =>              ipcRenderer.invoke('get-settings'),
    saveSettings:     (settings) =>        ipcRenderer.invoke('save-settings', settings),
    showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
    moveToTrash:       (id)  =>             ipcRenderer.invoke('move-to-trash', id),
    restoreNote:       (id)  =>             ipcRenderer.invoke('restore-note', id),
    deleteNotePermanently: (id) =>          ipcRenderer.invoke('delete-note-permanently', id),
    openRecentFile: (filePath) => ipcRenderer.invoke('open-recent-file', filePath),
    onOpenRecentFile: (callback) => 
        ipcRenderer.on('open-recent-file',
            (_event, filePath) => callback(filePath)),
    
});